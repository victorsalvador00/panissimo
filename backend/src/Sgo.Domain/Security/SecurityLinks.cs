using Sgo.Domain.Common;

namespace Sgo.Domain.Security;

/// <summary>A permission granted to a role.</summary>
[Audited]
public class RolePermission
{
    private RolePermission() { }

    public RolePermission(Guid roleId, string permissionCode)
    {
        if (!Permissions.IsValid(permissionCode))
            throw new ArgumentException($"Unknown permission '{permissionCode}'.", nameof(permissionCode));
        RoleId = roleId;
        PermissionCode = permissionCode;
    }

    public Guid RoleId { get; private set; }
    public string PermissionCode { get; private set; } = null!;
}

/// <summary>RN-40: a location the user may access.</summary>
[Audited]
public class UserLocation
{
    private UserLocation() { }

    public UserLocation(Guid userId, Guid locationId)
    {
        UserId = userId;
        LocationId = locationId;
    }

    public Guid UserId { get; private set; }
    public Guid LocationId { get; private set; }
}
