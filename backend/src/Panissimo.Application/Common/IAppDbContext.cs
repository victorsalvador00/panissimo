using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Common;

/// <summary>
/// The EF Core context as seen by application services (backend §3: services use the context directly,
/// without generic repositories). Implemented by <c>AppDbContext</c> in Infrastructure.
/// </summary>
public interface IAppDbContext
{
    DbSet<Location> Locations { get; }
    DbSet<ProductionArea> ProductionAreas { get; }
    DbSet<AppSetting> AppSettings { get; }
    DbSet<UnitOfMeasure> UnitsOfMeasure { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<UserLocation> UserLocations { get; }
    DbSet<AuditLog> AuditLogs { get; }

    DatabaseFacade Database { get; }

    EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
