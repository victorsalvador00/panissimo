using Panissimo.Domain.Common;

namespace Panissimo.Domain.Security;

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

/// <summary>
/// A permission the seed has already seen. A code of <see cref="Permissions.All"/> that is not here is new: the seed grants
/// it once to the system roles that include it, and records it, so later edits the client makes to its roles stay.
/// </summary>
public class KnownPermission
{
    private KnownPermission() { }

    public KnownPermission(string code, DateTimeOffset seenAt)
    {
        Code = code;
        SeenAt = seenAt;
    }

    public string Code { get; private set; } = null!;
    public DateTimeOffset SeenAt { get; private set; }
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

public enum AuditAction
{
    Created,
    Updated,
    Deleted,

    /// <summary>A query that must leave a trace (the lot traceability, RN-109).</summary>
    Queried,
}

/// <summary>RN-41: immutable record of a change to an audited entity.</summary>
public class AuditLog : Entity
{
    private AuditLog() { }

    public AuditLog(DateTimeOffset occurredAt, Guid? userId, AuditAction action,
        string entityType, string entityId, string changesJson, string? ipAddress)
    {
        OccurredAt = occurredAt;
        UserId = userId;
        Action = action;
        EntityType = entityType;
        EntityId = entityId;
        ChangesJson = changesJson;
        IpAddress = ipAddress;
    }

    public DateTimeOffset OccurredAt { get; private set; }
    public Guid? UserId { get; private set; }
    public AuditAction Action { get; private set; }
    public string EntityType { get; private set; } = null!;
    public string EntityId { get; private set; } = null!;
    public string ChangesJson { get; private set; } = null!;
    public string? IpAddress { get; private set; }
}
