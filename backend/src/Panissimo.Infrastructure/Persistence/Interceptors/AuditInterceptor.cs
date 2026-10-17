using System.Collections;
using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Security;

namespace Panissimo.Infrastructure.Persistence.Interceptors;

/// <summary>
/// RN-41: writes an <see cref="AuditLog"/> row, in the same SaveChanges, for every change
/// to an entity marked with <see cref="AuditedAttribute"/>. Composite keys are joined with "|".
/// </summary>
public sealed class AuditInterceptor(IClock clock, ICurrentUser currentUser) : SaveChangesInterceptor
{
    /// <summary>Never written to the audit log.</summary>
    private static readonly HashSet<string> SkippedProperties =
    [
        "PasswordHash", "SecurityStamp", "ConcurrencyStamp", "AccessFailedCount", nameof(IVersioned.Version),
        "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy",
    ];

    /// <summary>Framework types that cannot carry <see cref="AuditedAttribute"/> but must be audited (RN-41).</summary>
    private static readonly HashSet<Type> AlsoAudited = [typeof(IdentityUserRole<Guid>)];

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        WriteAuditLogs(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        WriteAuditLogs(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void WriteAuditLogs(DbContext? context)
    {
        if (context is null)
            return;

        context.ChangeTracker.DetectChanges();

        var logs = context.ChangeTracker.Entries()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted
                        && IsAudited(e.Entity.GetType()))
            .Select(CreateLog)
            .OfType<AuditLog>()
            .ToList();

        context.AddRange(logs);
    }

    private static bool IsAudited(Type type) =>
        AlsoAudited.Contains(type) || type.GetCustomAttribute<AuditedAttribute>() is not null;

    /// <summary>Binary content (e.g. item photos) is logged by size, never by value.</summary>
    private static object? Loggable(object? value) => value is byte[] bytes ? $"{bytes.Length} bytes" : value;

    private static bool ValuesEqual(object? a, object? b) =>
        a is byte[] x && b is byte[] y ? x.AsSpan().SequenceEqual(y) : Equals(a, b);

    private AuditLog? CreateLog(EntityEntry entry)
    {
        var properties = entry.Properties.Where(p => !SkippedProperties.Contains(p.Metadata.Name)).ToList();

        (AuditAction action, IDictionary changes) = entry.State switch
        {
            EntityState.Added => (AuditAction.Created,
                properties.ToDictionary(p => p.Metadata.Name, p => Loggable(p.CurrentValue))),
            EntityState.Deleted => (AuditAction.Deleted,
                properties.ToDictionary(p => p.Metadata.Name, p => Loggable(p.OriginalValue))),
            _ => (AuditAction.Updated,
                properties.Where(p => p.IsModified && !ValuesEqual(p.OriginalValue, p.CurrentValue))
                    .ToDictionary(p => p.Metadata.Name,
                        p => (object?)new { old = Loggable(p.OriginalValue), @new = Loggable(p.CurrentValue) })),
        };

        if (action == AuditAction.Updated && changes.Count == 0)
            return null;

        var keyValues = entry.Metadata.FindPrimaryKey()!.Properties.Select(p => entry.Property(p.Name).CurrentValue);

        return new AuditLog(
            clock.UtcNow,
            currentUser.UserId,
            action,
            entry.Metadata.ClrType.Name,
            string.Join("|", keyValues),
            JsonSerializer.Serialize(changes, JsonOptions),
            currentUser.IpAddress);
    }
}
