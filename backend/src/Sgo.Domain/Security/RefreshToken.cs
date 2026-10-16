using Sgo.Domain.Common;

namespace Sgo.Domain.Security;

public enum RefreshTokenRevocation
{
    Rotated,
    ReuseDetected,
    Logout,
    PasswordChanged,
    UserUnavailable,
}

/// <summary>
/// Opaque refresh token (backend spec §7). Only its SHA-256 hash is stored. Every use rotates it
/// within the same family; reusing an already rotated token revokes the whole family, except within a short
/// grace period after the rotation (concurrent refreshes from the same browser).
/// </summary>
public class RefreshToken : Entity
{
    private RefreshToken() { }

    public RefreshToken(Guid userId, string tokenHash, Guid familyId, DateTimeOffset createdAt, DateTimeOffset expiresAt, string? createdByIp)
    {
        UserId = userId;
        TokenHash = tokenHash;
        FamilyId = familyId;
        CreatedAt = createdAt;
        ExpiresAt = expiresAt;
        CreatedByIp = createdByIp;
    }

    public Guid UserId { get; private set; }
    public string TokenHash { get; private set; } = null!;
    public Guid FamilyId { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public string? CreatedByIp { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }
    public RefreshTokenRevocation? RevokedReason { get; private set; }
    public Guid? ReplacedByTokenId { get; private set; }

    public bool IsActive(DateTimeOffset now) => RevokedAt is null && now < ExpiresAt;

    /// <summary>A token that was rotated and is presented again signals theft (outside the grace period).</summary>
    public bool WasRotated => RevokedReason == RefreshTokenRevocation.Rotated;

    /// <summary>
    /// Rotated less than <paramref name="grace"/> ago: presenting it again is most likely a benign race (two tabs
    /// or two reloads sending the same cookie before the browser stored the new one), not theft.
    /// </summary>
    public bool RotatedWithin(DateTimeOffset now, TimeSpan grace) => WasRotated && RevokedAt >= now - grace;

    /// <summary>Creates the successor in the same family and revokes this one.</summary>
    public RefreshToken Rotate(string newTokenHash, DateTimeOffset now, DateTimeOffset expiresAt, string? ip)
    {
        if (!IsActive(now))
            throw new InvalidOperationException("Only an active refresh token can be rotated.");

        var next = new RefreshToken(UserId, newTokenHash, FamilyId, now, expiresAt, ip);
        Revoke(now, RefreshTokenRevocation.Rotated);
        ReplacedByTokenId = next.Id;
        return next;
    }

    /// <summary>Idempotent: the first revocation reason is kept.</summary>
    public void Revoke(DateTimeOffset now, RefreshTokenRevocation reason)
    {
        if (RevokedAt is not null)
            return;
        RevokedAt = now;
        RevokedReason = reason;
    }
}
