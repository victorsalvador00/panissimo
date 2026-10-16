using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Sgo.Application.Common;

namespace Sgo.Infrastructure.Persistence.Interceptors;

/// <summary>Fills CreatedAt/CreatedBy and UpdatedAt/UpdatedBy on any entity that declares them.</summary>
public sealed class TimestampsInterceptor(IClock clock, ICurrentUser currentUser) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        Stamp(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        Stamp(eventData.Context);
        return ValueTask.FromResult(result);
    }

    private void Stamp(DbContext? context)
    {
        if (context is null)
            return;

        context.ChangeTracker.DetectChanges();
        var now = clock.UtcNow;
        var userId = currentUser.UserId;

        foreach (var entry in context.ChangeTracker.Entries())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    Set(entry, "CreatedAt", now);
                    Set(entry, "CreatedBy", userId);
                    break;
                case EntityState.Modified:
                    Set(entry, "UpdatedAt", now);
                    Set(entry, "UpdatedBy", userId);
                    break;
            }
        }
    }

    private static void Set(EntityEntry entry, string propertyName, object? value)
    {
        if (entry.Metadata.FindProperty(propertyName) is not null)
            entry.Property(propertyName).CurrentValue = value;
    }
}
