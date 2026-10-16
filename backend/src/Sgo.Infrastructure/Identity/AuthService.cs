using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

public sealed class AuthService(
    SgoDbContext db,
    UserManager<AppUser> userManager,
    TokenService tokens,
    IUserAccessService userAccess,
    IClock clock,
    ICurrentUser currentUser) : IAuthService
{
    public const string InvalidCredentialsMessage = "Correo o contraseña incorrectos.";
    public const string LockedMessage = "La cuenta está bloqueada por intentos fallidos. Intenta de nuevo en 15 minutos.";
    public const string InactiveMessage = "El usuario está inactivo. Contacta al administrador.";
    public const string SessionExpiredMessage = "Tu sesión expiró. Inicia sesión de nuevo.";

    /// <summary>How long a just-rotated refresh token is still accepted (concurrent refreshes, not theft).</summary>
    public static readonly TimeSpan ReuseGracePeriod = TimeSpan.FromSeconds(30);

    private static AuthenticationFailedException InvalidCredentials() => new("invalid_credentials", InvalidCredentialsMessage);
    private static AuthenticationFailedException Locked() => new("account_locked", LockedMessage);
    private static AuthenticationFailedException SessionExpired() => new("session_expired", SessionExpiredMessage);

    public async Task<AuthResult> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        var user = await userManager.FindByEmailAsync(request.Email) ?? throw InvalidCredentials();

        if (await userManager.IsLockedOutAsync(user))
            throw Locked();

        if (!await userManager.CheckPasswordAsync(user, request.Password))
        {
            await userManager.AccessFailedAsync(user); // RN-42: locks after 5 failures
            throw await userManager.IsLockedOutAsync(user) ? Locked() : InvalidCredentials();
        }

        if (!user.IsActive)
            throw new AuthenticationFailedException("user_inactive", InactiveMessage);

        await userManager.ResetAccessFailedCountAsync(user);

        var (refreshToken, hash, expiresAt) = tokens.CreateRefreshToken();
        db.RefreshTokens.Add(new RefreshToken(user.Id, hash, Guid.CreateVersion7(), clock.UtcNow, expiresAt, currentUser.IpAddress));
        await db.SaveChangesAsync(ct);

        return new AuthResult(tokens.CreateAccessToken(user), refreshToken, expiresAt);
    }

    public async Task<AuthResult> RefreshAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw SessionExpired();

        var now = clock.UtcNow;
        var hash = TokenService.Hash(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, ct)
                     ?? throw SessionExpired();

        if (stored.WasRotated)
            return await RefreshRotatedAsync(stored, now, ct);

        if (!stored.IsActive(now))
            throw SessionExpired();

        var user = await ActiveUserAsync(stored, ct);
        var (newToken, newHash, expiresAt) = tokens.CreateRefreshToken();
        db.RefreshTokens.Add(stored.Rotate(newHash, now, expiresAt, currentUser.IpAddress));

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another request rotated the same token first (same race as a reuse within the grace period).
            db.ChangeTracker.Clear();
            var rotated = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, ct) ?? throw SessionExpired();
            return await RefreshRotatedAsync(rotated, now, ct);
        }

        return new AuthResult(tokens.CreateAccessToken(user), newToken, expiresAt);
    }

    /// <summary>
    /// A rotated token came back. Within <see cref="ReuseGracePeriod"/> and while the session is still alive it is a
    /// benign race (two tabs, double reload): issue a sibling token in the same family. Otherwise assume it was
    /// stolen and kill the whole family.
    /// </summary>
    private async Task<AuthResult> RefreshRotatedAsync(RefreshToken stored, DateTimeOffset now, CancellationToken ct)
    {
        var familyAlive = await db.RefreshTokens.AnyAsync(
            t => t.FamilyId == stored.FamilyId && t.RevokedAt == null && t.ExpiresAt > now, ct);

        if (!stored.RotatedWithin(now, ReuseGracePeriod) || !familyAlive)
        {
            await RevokeFamilyAsync(stored.FamilyId, RefreshTokenRevocation.ReuseDetected, ct);
            throw SessionExpired();
        }

        var user = await ActiveUserAsync(stored, ct);
        var (newToken, newHash, expiresAt) = tokens.CreateRefreshToken();
        db.RefreshTokens.Add(new RefreshToken(stored.UserId, newHash, stored.FamilyId, now, expiresAt, currentUser.IpAddress));
        await db.SaveChangesAsync(ct);

        return new AuthResult(tokens.CreateAccessToken(user), newToken, expiresAt);
    }

    private async Task<AppUser> ActiveUserAsync(RefreshToken stored, CancellationToken ct)
    {
        var user = await userManager.FindByIdAsync(stored.UserId.ToString());
        if (user is null || !user.IsActive || await userManager.IsLockedOutAsync(user))
        {
            await RevokeFamilyAsync(stored.FamilyId, RefreshTokenRevocation.UserUnavailable, ct);
            throw SessionExpired();
        }
        return user;
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            return;

        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == TokenService.Hash(refreshToken), ct);
        if (stored is not null && stored.UserId == currentUser.UserId)
            await RevokeFamilyAsync(stored.FamilyId, RefreshTokenRevocation.Logout, ct);
    }

    public async Task<MeDto> GetMeAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw new NotFoundException("el usuario", userId);
        var access = await userAccess.GetAsync(userId, ct) ?? throw new NotFoundException("el usuario", userId);

        var locations = await db.Locations.AsNoTracking()
            .Where(l => access.LocationIds.Contains(l.Id))
            .OrderBy(l => l.Code)
            .Select(l => new MeLocationDto(l.Id, l.Code, l.Name, l.Type.ToString(), l.IsActive))
            .ToListAsync(ct);

        return new MeDto(user.Id, user.Email!, user.FullName, user.DefaultLocationId,
            access.Permissions.Order().ToList(), access.AllLocations, locations);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct = default)
    {
        var user = await userManager.FindByIdAsync(userId.ToString()) ?? throw new NotFoundException("el usuario", userId);

        var result = await userManager.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            var mismatch = result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.PasswordMismatch));
            throw new RequestValidationException(mismatch
                ? new Dictionary<string, string[]> { ["currentPassword"] = ["La contraseña actual es incorrecta."] }
                : new Dictionary<string, string[]> { ["newPassword"] = result.Errors.Select(e => e.Description).ToArray() });
        }

        var now = clock.UtcNow;
        var active = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        active.ForEach(t => t.Revoke(now, RefreshTokenRevocation.PasswordChanged));
        await db.SaveChangesAsync(ct);
    }

    private async Task RevokeFamilyAsync(Guid familyId, RefreshTokenRevocation reason, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var family = await db.RefreshTokens.Where(t => t.FamilyId == familyId && t.RevokedAt == null).ToListAsync(ct);
        family.ForEach(t => t.Revoke(now, reason));
        await db.SaveChangesAsync(ct);
    }
}
