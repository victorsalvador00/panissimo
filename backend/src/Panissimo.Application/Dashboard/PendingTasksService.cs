using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Production;
using Panissimo.Application.Security;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Dashboard;

/// <summary>
/// RN-118: what is waiting for the user, counted like the tab of its list so the badge matches what the list shows. A
/// count is null when the user lacks its permission.
/// </summary>
/// <param name="PurchaseOrdersToApprove">Tab "Por aprobar" of the purchase orders (purchasing.po.approve).</param>
/// <param name="PurchaseOrdersToReceive">Tab "Por recibir" of the purchase orders (purchasing.receive).</param>
/// <param name="ProductionOrdersToProduce">Released orders, tab "Por producir" (production.orders.close).</param>
/// <param name="ProductionOrdersInProgress">Orders with partial closes, tab "En proceso" (production.orders.close).</param>
/// <param name="VouchersToSend">Internal vouchers in draft, tab "Por enviar" (inventory.internal_transfers).</param>
/// <param name="VouchersToReceive">Internal vouchers sent and not received, tab "En tránsito" (inventory.internal_transfers).</param>
/// <param name="PlanRowsToSchedule">
/// Rows of the production plan (RN-70) with a quantity to produce in its default range, for the plants of the scope
/// (production.orders.manage). They go away once their OPs are generated.
/// </param>
public sealed record PendingTasksDto(
    int? PurchaseOrdersToApprove, int? PurchaseOrdersToReceive, int? ProductionOrdersToProduce, int? ProductionOrdersInProgress,
    int? VouchersToSend, int? VouchersToReceive, int? PlanRowsToSchedule);

public interface IPendingTasksService
{
    /// <summary>
    /// Orders over the user's scope (as their lists); vouchers of <paramref name="locationId"/> and its sub-warehouses (as
    /// the vouchers screen), or of the whole scope without it.
    /// </summary>
    Task<PendingTasksDto> GetAsync(Guid? locationId, CancellationToken ct = default);
}

public sealed class PendingTasksService(
    IAppDbContext db, ILocationScope scope, UserAccessContext access, IProductionPlanService plan) : IPendingTasksService
{
    public async Task<PendingTasksDto> GetAsync(Guid? locationId, CancellationToken ct = default)
    {
        if (locationId is { } id)
            scope.EnsureAccess(id);
        var allowed = scope.AllowedLocationIds;

        var purchaseOrders = db.PurchaseOrders.AsNoTracking().Where(o => allowed.Contains(o.DeliveryLocationId));
        var productionOrders = db.ProductionOrders.AsNoTracking().Where(o => allowed.Contains(o.LocationId));
        var vouchers = db.Transfers.AsNoTracking().Where(t => t.Kind == TransferKind.Internal
                                                             && (allowed.Contains(t.FromLocationId) || allowed.Contains(t.ToLocationId)));
        if (locationId is { } at)
        {
            var ids = await InventoryLocations.WithWarehousesAsync(db, at, ct);
            vouchers = vouchers.Where(t => ids.Contains(t.FromLocationId) || ids.Contains(t.ToLocationId));
        }

        return new PendingTasksDto(
            Has(Permissions.PurchasingPoApprove)
                ? await purchaseOrders.CountAsync(o => o.Status == PurchaseOrderStatus.PendingApproval, ct) : null,
            Has(Permissions.PurchasingReceive)
                ? await purchaseOrders.CountAsync(o => o.Status == PurchaseOrderStatus.Approved
                                                       || o.Status == PurchaseOrderStatus.PartiallyReceived, ct) : null,
            Has(Permissions.ProductionOrdersClose)
                ? await productionOrders.CountAsync(o => o.Status == ProductionOrderStatus.Released, ct) : null,
            Has(Permissions.ProductionOrdersClose)
                ? await productionOrders.CountAsync(o => o.Status == ProductionOrderStatus.InProgress, ct) : null,
            Has(Permissions.InventoryInternalTransfers)
                ? await vouchers.CountAsync(t => t.Status == TransferStatus.Draft, ct) : null,
            Has(Permissions.InventoryInternalTransfers)
                ? await vouchers.CountAsync(t => t.Status == TransferStatus.Dispatched, ct) : null,
            Has(Permissions.ProductionOrdersManage) ? await PlanRowsToScheduleAsync(allowed, ct) : null);
    }

    /// <summary>The plan of each plant of the scope, as its screen opens it (from today, default range).</summary>
    private async Task<int> PlanRowsToScheduleAsync(IReadOnlySet<Guid> allowed, CancellationToken ct)
    {
        var plants = await db.Locations.AsNoTracking()
            .Where(l => allowed.Contains(l.Id) && l.Type == LocationType.Plant && l.IsActive)
            .Select(l => l.Id).ToListAsync(ct);
        var count = 0;
        foreach (var plant in plants)
            count += (await plan.GetAsync(new ProductionPlanQuery { LocationId = plant }, ct)).Rows.Count(r => r.SuggestedQty > 0);
        return count;
    }

    private bool Has(string permission) => access.Access?.Has(permission) ?? false;
}
