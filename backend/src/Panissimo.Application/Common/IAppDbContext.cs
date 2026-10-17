using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
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
    DbSet<ItemCategory> ItemCategories { get; }
    DbSet<Item> Items { get; }
    DbSet<ItemLocationSetting> ItemLocationSettings { get; }
    DbSet<Lot> Lots { get; }
    DbSet<StockBalance> StockBalances { get; }
    DbSet<ItemLocationCost> ItemLocationCosts { get; }
    DbSet<InventoryMovement> InventoryMovements { get; }
    DbSet<InventoryAdjustment> InventoryAdjustments { get; }
    DbSet<PhysicalCount> PhysicalCounts { get; }
    DbSet<ConsumptionEntry> Consumptions { get; }
    DbSet<Transfer> Transfers { get; }
    DbSet<Recipe> Recipes { get; }
    DbSet<ProductionOrder> ProductionOrders { get; }
    DbSet<ProductionOrderImport> ProductionOrderImports { get; }
    DbSet<ProductionClose> ProductionCloses { get; }
    DbSet<Supplier> Suppliers { get; }
    DbSet<SupplierItem> SupplierItems { get; }
    DbSet<PurchaseRequisition> PurchaseRequisitions { get; }
    DbSet<PurchaseOrder> PurchaseOrders { get; }
    DbSet<GoodsReceipt> GoodsReceipts { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<UserLocation> UserLocations { get; }
    DbSet<AuditLog> AuditLogs { get; }
    DbSet<RefreshToken> RefreshTokens { get; }

    DatabaseFacade Database { get; }

    EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
