using Sgo.Domain.Common;

namespace Sgo.Domain.Security;

public enum AuditAction
{
    Created,
    Updated,
    Deleted,
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
