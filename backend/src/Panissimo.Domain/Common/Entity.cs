namespace Panissimo.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; protected set; } = Guid.CreateVersion7();
}

public abstract class AuditableEntity : Entity
{
    public DateTimeOffset CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}

/// <summary>
/// Optimistic concurrency token backed by the Postgres system column <c>xmin</c>.
/// Detail DTOs expose it as <c>version</c>; edits and state changes must send it back.
/// </summary>
public interface IVersioned
{
    uint Version { get; }
}

/// <summary>Marks an entity whose changes are written to audit.audit_log (RN-41).</summary>
[AttributeUsage(AttributeTargets.Class, Inherited = true)]
public sealed class AuditedAttribute : Attribute;
