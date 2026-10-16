namespace Sgo.Domain.Common;

/// <summary>Marks an entity whose changes are written to audit.audit_log.</summary>
[AttributeUsage(AttributeTargets.Class, Inherited = true)]
public sealed class AuditedAttribute : Attribute;
