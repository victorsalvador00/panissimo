using Panissimo.Application.Common;
using Panissimo.Domain.Common;

namespace Panissimo.Application.Security;

/// <summary>Effective permissions and location scope of a user (RN-40).</summary>
/// <param name="LocationIds">
/// Locations whose data and documents the user sees: the assigned ones, their sub-warehouses and the parent of an assigned
/// sub-warehouse; every location when <paramref name="AllLocations"/> is true.
/// </param>
/// <param name="StockLocationIds">
/// Where the user may move inventory (B-26): an assigned plant or branch and its sub-warehouses, or only the assigned
/// sub-warehouse.
/// </param>
public sealed record UserAccess(
    Guid UserId,
    bool IsActive,
    IReadOnlySet<string> Permissions,
    bool AllLocations,
    IReadOnlySet<Guid> LocationIds,
    IReadOnlySet<Guid> StockLocationIds)
{
    public bool Has(string permission) => Permissions.Contains(permission);
}

public interface IUserAccessService
{
    /// <summary>Cached for 5 minutes. Returns null when the user does not exist.</summary>
    Task<UserAccess?> GetAsync(Guid userId, CancellationToken ct = default);

    /// <summary>Call after editing a user (roles, locations, active flag).</summary>
    void Invalidate(Guid userId);

    /// <summary>Call after editing a role or creating a location (users with <c>locations.all</c>).</summary>
    void InvalidateAll();
}

/// <summary>Per-request holder, filled by the API once the caller is authenticated.</summary>
public sealed class UserAccessContext
{
    public UserAccess? Access { get; set; }
}

/// <summary>RN-40: locations the current user may operate on.</summary>
public interface ILocationScope
{
    IReadOnlySet<Guid> AllowedLocationIds { get; }

    /// <summary>Locations where the user may move inventory (RN-40, B-26).</summary>
    IReadOnlySet<Guid> AllowedStockLocationIds { get; }

    /// <summary>Throws <see cref="ForbiddenException"/> if the location is out of scope.</summary>
    void EnsureAccess(Guid locationId);

    /// <summary>Throws <see cref="ForbiddenException"/> if the user may not move inventory in the location (or sub-warehouse).</summary>
    void EnsureStockAccess(Guid locationId);
}

public sealed class LocationScope(UserAccessContext context) : ILocationScope
{
    public const string OutOfScopeMessage = "No tienes acceso a esta ubicación.";

    public const string OutOfStockScopeMessage = "No tienes acceso a este subalmacén.";

    public IReadOnlySet<Guid> AllowedLocationIds => context.Access?.LocationIds ?? new HashSet<Guid>();

    public IReadOnlySet<Guid> AllowedStockLocationIds => context.Access?.StockLocationIds ?? new HashSet<Guid>();

    public void EnsureAccess(Guid locationId)
    {
        if (!AllowedLocationIds.Contains(locationId))
            throw new ForbiddenException(OutOfScopeMessage);
    }

    public void EnsureStockAccess(Guid locationId)
    {
        if (!AllowedStockLocationIds.Contains(locationId))
            throw new ForbiddenException(AllowedLocationIds.Contains(locationId) ? OutOfStockScopeMessage : OutOfScopeMessage);
    }
}
