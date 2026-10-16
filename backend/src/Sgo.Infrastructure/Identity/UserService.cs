using System.Linq.Expressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

public sealed class UserService(
    SgoDbContext db,
    UserManager<AppUser> userManager,
    PrivilegeGuard guard,
    IUserAccessService userAccess,
    ICurrentUser currentUser,
    IClock clock) : IUserService
{
    private static readonly Dictionary<string, Expression<Func<AppUser, object?>>> SortColumns = new()
    {
        ["fullName"] = u => u.FullName,
        ["email"] = u => u.Email,
        ["isActive"] = u => u.IsActive,
        ["createdAt"] = u => u.CreatedAt,
    };

    public async Task<PagedResult<UserListItemDto>> ListAsync(UserListQuery query, CancellationToken ct = default)
    {
        var users = db.Users.AsNoTracking();

        if (query.IsActive is { } active)
            users = users.Where(u => u.IsActive == active);
        if (query.RoleId is { } roleId)
            users = users.Where(u => db.UserRoles.Any(ur => ur.UserId == u.Id && ur.RoleId == roleId));
        if (query.LocationId is { } locationId)
            users = users.Where(u => db.UserLocations.Any(ul => ul.UserId == u.Id && ul.LocationId == locationId));
        if (query.SearchTerm() is { } term)
            users = users.Where(u => u.FullName.ToLower().Contains(term) || u.Email!.ToLower().Contains(term));

        var page = await users.ApplySort(query.Sort, SortColumns, "fullName").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(u => u.Id).ToList();

        var roles = (await db.UserRoles.Where(ur => ids.Contains(ur.UserId))
                .Join(db.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
                .ToListAsync(ct))
            .ToLookup(x => x.UserId, x => x.Name!);
        var locations = (await db.UserLocations.Where(ul => ids.Contains(ul.UserId))
                .Join(db.Locations, ul => ul.LocationId, l => l.Id, (ul, l) => new { ul.UserId, l.Code })
                .ToListAsync(ct))
            .ToLookup(x => x.UserId, x => x.Code);

        var now = clock.UtcNow;
        return new PagedResult<UserListItemDto>(
            page.Items.Select(u => new UserListItemDto(u.Id, u.Email!, u.FullName, u.IsActive, u.LockoutEnd > now,
                roles[u.Id].Order().ToList(), locations[u.Id].Order().ToList())).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<UserDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, ct)
                   ?? throw new NotFoundException("el usuario", id);
        return await ToDtoAsync(user, ct);
    }

    public async Task<UserDto> CreateAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        await ValidateAssignmentsAsync(request.RoleIds, request.LocationIds, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var user = new AppUser(request.Email.Trim(), request.FullName.Trim())
        {
            EmailConfirmed = true,
            DefaultLocationId = request.DefaultLocationId,
        };
        var result = await userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
            throw ToValidationException(result, passwordField: "password");

        db.UserRoles.AddRange(request.RoleIds.Select(roleId => new IdentityUserRole<Guid> { UserId = user.Id, RoleId = roleId }));
        db.UserLocations.AddRange(request.LocationIds.Select(locationId => new UserLocation(user.Id, locationId)));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await ToDtoAsync(user, ct);
    }

    public async Task<UserDto> UpdateAsync(Guid id, UpdateUserRequest request, CancellationToken ct = default)
    {
        var user = await FindManageableAsync(id, ct);
        db.EnsureVersion(user, request.Version);
        await ValidateAssignmentsAsync(request.RoleIds, request.LocationIds, ct);

        if (id == currentUser.UserId && !await RolesGrantAsync(request.RoleIds, Permissions.SecurityUsersManage, ct))
            throw new BusinessRuleException("cannot_lock_yourself_out", "No puedes quitarte el permiso de administrar usuarios.");

        user.FullName = request.FullName.Trim();
        user.DefaultLocationId = request.DefaultLocationId;
        db.Entry(user).State = EntityState.Modified; // role/location-only edits still bump the version

        var currentRoles = await db.UserRoles.Where(ur => ur.UserId == id).ToListAsync(ct);
        db.UserRoles.RemoveRange(currentRoles.Where(ur => !request.RoleIds.Contains(ur.RoleId)));
        db.UserRoles.AddRange(request.RoleIds.Except(currentRoles.Select(ur => ur.RoleId))
            .Select(roleId => new IdentityUserRole<Guid> { UserId = id, RoleId = roleId }));

        var currentLocations = await db.UserLocations.Where(ul => ul.UserId == id).ToListAsync(ct);
        db.UserLocations.RemoveRange(currentLocations.Where(ul => !request.LocationIds.Contains(ul.LocationId)));
        db.UserLocations.AddRange(request.LocationIds.Except(currentLocations.Select(ul => ul.LocationId))
            .Select(locationId => new UserLocation(id, locationId)));

        await db.SaveChangesAsync(ct);
        userAccess.Invalidate(id);
        return await ToDtoAsync(user, ct);
    }

    public async Task ResetPasswordAsync(Guid id, ResetPasswordRequest request, CancellationToken ct = default)
    {
        var user = await FindManageableAsync(id, ct);

        var errors = new List<string>();
        foreach (var validator in userManager.PasswordValidators)
        {
            var result = await validator.ValidateAsync(userManager, user, request.NewPassword);
            errors.AddRange(result.Errors.Select(e => e.Description));
        }
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["newPassword"] = [.. errors] });

        user.PasswordHash = userManager.PasswordHasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        user.AccessFailedCount = 0;
        user.LockoutEnd = null;
        await RevokeSessionsAsync(id, RefreshTokenRevocation.PasswordChanged, ct);
        await db.SaveChangesAsync(ct);
    }

    public Task<UserDto> ActivateAsync(Guid id, uint version, CancellationToken ct = default) =>
        SetActiveAsync(id, version, active: true, ct);

    public Task<UserDto> DeactivateAsync(Guid id, uint version, CancellationToken ct = default)
    {
        if (id == currentUser.UserId)
            throw new BusinessRuleException("cannot_lock_yourself_out", "No puedes desactivar tu propio usuario.");
        return SetActiveAsync(id, version, active: false, ct);
    }

    private async Task<UserDto> SetActiveAsync(Guid id, uint version, bool active, CancellationToken ct)
    {
        var user = await FindManageableAsync(id, ct);
        db.EnsureVersion(user, version);

        user.IsActive = active;
        if (!active)
            await RevokeSessionsAsync(id, RefreshTokenRevocation.UserUnavailable, ct);

        await db.SaveChangesAsync(ct);
        userAccess.Invalidate(id);
        return await ToDtoAsync(user, ct);
    }

    private async Task<AppUser> FindManageableAsync(Guid id, CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new NotFoundException("el usuario", id);
        await guard.EnsureCanManageUserAsync(id, ct);
        return user;
    }

    private async Task ValidateAssignmentsAsync(IReadOnlyList<Guid> roleIds, IReadOnlyList<Guid> locationIds, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        if (await db.Roles.CountAsync(r => roleIds.Contains(r.Id), ct) != roleIds.Count)
            errors["roleIds"] = ["Uno o más roles no existen."];
        if (await db.Locations.CountAsync(l => locationIds.Contains(l.Id), ct) != locationIds.Count)
            errors["locationIds"] = ["Una o más ubicaciones no existen."];
        if (errors.Count > 0)
            throw new RequestValidationException(errors);

        await guard.EnsureCanGrantRolesAsync(roleIds, ct);
        guard.EnsureCanAssignLocations(locationIds);
    }

    private Task<bool> RolesGrantAsync(IReadOnlyList<Guid> roleIds, string permission, CancellationToken ct) =>
        db.RolePermissions.AnyAsync(rp => roleIds.Contains(rp.RoleId) && rp.PermissionCode == permission, ct);

    private async Task RevokeSessionsAsync(Guid userId, RefreshTokenRevocation reason, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var tokens = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        tokens.ForEach(t => t.Revoke(now, reason));
    }

    private async Task<UserDto> ToDtoAsync(AppUser user, CancellationToken ct)
    {
        var roleIds = await db.UserRoles.Where(ur => ur.UserId == user.Id).Select(ur => ur.RoleId).ToListAsync(ct);
        var locationIds = await db.UserLocations.Where(ul => ul.UserId == user.Id)
            .Join(db.Locations, ul => ul.LocationId, l => l.Id, (ul, l) => new { l.Id, l.Code })
            .OrderBy(l => l.Code).Select(l => l.Id).ToListAsync(ct);

        return new UserDto(user.Id, user.Email!, user.FullName, user.IsActive, user.LockoutEnd > clock.UtcNow,
            user.DefaultLocationId, roleIds, locationIds, user.CreatedAt, user.UpdatedAt, user.Version);
    }

    private static RequestValidationException ToValidationException(IdentityResult result, string passwordField)
    {
        // The user name is the email: report the duplicate once, as an email error.
        var errors = result.Errors
            .Where(e => e.Code != nameof(IdentityErrorDescriber.DuplicateUserName))
            .GroupBy(e => e.Code.StartsWith("Password", StringComparison.Ordinal) ? passwordField : "email")
            .ToDictionary(g => g.Key, g => g.Select(e => e.Description).Distinct().ToArray());
        return new RequestValidationException(errors);
    }
}
