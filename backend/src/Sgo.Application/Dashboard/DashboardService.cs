using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Security;
using Sgo.Domain.Logistics;
using Sgo.Domain.Production;
using Sgo.Domain.Purchasing;
using Sgo.Domain.Security;

namespace Sgo.Application.Dashboard;

/// <param name="ExpiringLots">Lots with stock expiring within <paramref name="ExpirationAlertDays"/> days, expired ones included (RN-07).</param>
public sealed record InventoryBlockDto(int LowStock, int ExpiringLots, int ExpiredLots, int ExpirationAlertDays);

/// <param name="ToReceive">Dispatched to the location, in transit.</param>
/// <param name="ToDispatch">Drafts leaving the location.</param>
public sealed record TransfersBlockDto(int ToReceive, int ToDispatch);

public sealed record LocationCountDto(Guid LocationId, string LocationCode, string LocationName, int Count);

/// <summary>
/// Home page counters. A block is null when the user lacks its permission. Counts cover the given location,
/// or every location in the user's scope when none is given.
/// </summary>
/// <param name="BranchOrdersToApprove">Submitted orders the location must supply.</param>
/// <param name="BranchOrdersInProgress">The branch's own orders submitted or approved, not yet received.</param>
/// <param name="ProductionOrdersToday">Released orders scheduled for today.</param>
/// <param name="LowStockByLocation">Only with locations.all: items below minimum per active location.</param>
public sealed record DashboardDto(
    Guid? LocationId,
    InventoryBlockDto? Inventory,
    TransfersBlockDto? Transfers,
    int? BranchOrdersToApprove,
    int? BranchOrdersInProgress,
    int? PurchaseOrdersToApprove,
    int? ProductionOrdersToday,
    IReadOnlyList<LocationCountDto>? LowStockByLocation);

public interface IDashboardService
{
    Task<DashboardDto> GetAsync(Guid? locationId, CancellationToken ct = default);
}

public sealed class DashboardService(
    ISgoDbContext db,
    ILocationScope scope,
    UserAccessContext access,
    IStockQueries stock,
    IClock clock) : IDashboardService
{
    public async Task<DashboardDto> GetAsync(Guid? locationId, CancellationToken ct = default)
    {
        if (locationId is { } id)
            scope.EnsureAccess(id);
        List<Guid> locations = locationId is { } one ? [one] : [.. scope.AllowedLocationIds];
        bool Has(string permission) => access.Access?.Has(permission) == true;

        InventoryBlockDto? inventory = null;
        IReadOnlyList<LocationCountDto>? byLocation = null;
        if (Has(Permissions.InventoryView))
        {
            // With locations.all the chart needs every location; the counters keep to the requested one.
            var alerts = await stock.AlertsAsync(Has(Permissions.LocationsAll) ? null : locationId, ct);
            var lowStock = alerts.LowStock.Where(a => locations.Contains(a.LocationId)).ToList();
            var expiring = alerts.ExpiringLots.Where(a => locations.Contains(a.LocationId)).ToList();
            inventory = new InventoryBlockDto(lowStock.Count, expiring.Count, expiring.Count(e => e.IsExpired), alerts.ExpirationAlertDays);

            if (Has(Permissions.LocationsAll))
            {
                var counts = alerts.LowStock.GroupBy(a => a.LocationId).ToDictionary(g => g.Key, g => g.Count());
                byLocation = (await db.Locations.AsNoTracking().Where(l => l.IsActive).OrderBy(l => l.Code).ToListAsync(ct))
                    .Select(l => new LocationCountDto(l.Id, l.Code, l.Name, counts.GetValueOrDefault(l.Id))).ToList();
            }
        }

        TransfersBlockDto? transfers = null;
        if (Has(Permissions.LogisticsView))
            transfers = new TransfersBlockDto(
                await db.Transfers.CountAsync(t => t.Status == TransferStatus.Dispatched && locations.Contains(t.ToLocationId), ct),
                await db.Transfers.CountAsync(t => t.Status == TransferStatus.Draft && locations.Contains(t.FromLocationId), ct));

        int? ordersToApprove = Has(Permissions.LogisticsOrdersApprove)
            ? await db.BranchOrders.CountAsync(o => o.Status == BranchOrderStatus.Submitted && locations.Contains(o.SupplyingLocationId), ct)
            : null;
        int? ordersInProgress = Has(Permissions.LogisticsOrdersCreate)
            ? await db.BranchOrders.CountAsync(o => (o.Status == BranchOrderStatus.Submitted || o.Status == BranchOrderStatus.Approved)
                                                    && locations.Contains(o.RequestingLocationId), ct)
            : null;
        int? purchaseOrdersToApprove = Has(Permissions.PurchasingPoApprove)
            ? await db.PurchaseOrders.CountAsync(o => o.Status == PurchaseOrderStatus.PendingApproval && locations.Contains(o.DeliveryLocationId), ct)
            : null;

        int? productionToday = null;
        if (Has(Permissions.ProductionView))
        {
            var today = clock.BusinessDate();
            productionToday = await db.ProductionOrders.CountAsync(o => o.Status == ProductionOrderStatus.Released
                                                                        && o.ScheduledDate == today && locations.Contains(o.LocationId), ct);
        }

        return new DashboardDto(locationId, inventory, transfers, ordersToApprove, ordersInProgress, purchaseOrdersToApprove,
            productionToday, byLocation);
    }
}
