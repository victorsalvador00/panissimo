namespace Sgo.Application.Security;

/// <summary>Effective permissions and location scope of a user (RN-40).</summary>
/// <param name="LocationIds">Allowed locations; every location when <paramref name="AllLocations"/> is true.</param>
public sealed record UserAccess(
    Guid UserId,
    bool IsActive,
    IReadOnlySet<string> Permissions,
    bool AllLocations,
    IReadOnlySet<Guid> LocationIds)
{
    public bool Has(string permission) => Permissions.Contains(permission);
}

public interface IUserAccessService
{
    /// <summary>Cached for 5 minutes. Returns null when the user does not exist.</summary>
    Task<UserAccess?> GetAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Call after editing a user (roles, locations, active flag).</summary>
    void Invalidate(Guid userId);

    /// <summary>Call after editing a role or a location set shared by many users.</summary>
    void InvalidateAll();
}

/// <summary>Per-request holder, filled by the API once the caller is authenticated.</summary>
public sealed class UserAccessContext
{
    public UserAccess? Access { get; set; }
}
