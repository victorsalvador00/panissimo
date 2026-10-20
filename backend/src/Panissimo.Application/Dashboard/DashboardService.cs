using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Production;
using Panissimo.Application.Security;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Sales;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Dashboard;

/// <summary>A document of a dashboard block: what the card lists under its count.</summary>
/// <param name="Title">The other party: location, supplier, customer or product.</param>
/// <param name="Date">Required, expected or dispatch date, depending on the block.</param>
public sealed record DashboardDocumentDto(Guid Id, string Folio, string Title, DateOnly? Date);

/// <param name="Items">The first <see cref="DashboardService.PreviewSize"/>, oldest first.</param>
public sealed record DashboardDocumentsBlock(int Count, IReadOnlyList<DashboardDocumentDto> Items);

public sealed record LowStockBlock(int Count, IReadOnlyList<LowStockAlertDto> Items);

/// <param name="ExpiredCount">Lots already expired, included in <paramref name="Count"/>.</param>
public sealed record ExpiringLotsBlock(int Count, int ExpiredCount, int ExpiryAlertDays, IReadOnlyList<ExpiringLotAlertDto> Items);

/// <summary>Today's orders of a factory (RN-49) in one unit (quantities of different units are never added).</summary>
public sealed record ProductionTodayRowDto(Guid? FactoryId, string FactoryName, string BaseUomCode, int Orders, decimal Planned, decimal Produced);

public sealed record ProductionInProgressDto(Guid Id, string Folio, string OutputSku, string OutputName, string BaseUomCode,
    DateOnly ScheduledDate, decimal PlannedQty, decimal ProducedQty);

public sealed record ProductionInProgressBlock(int Count, IReadOnlyList<ProductionInProgressDto> Items);

public sealed record RecipeCostIncreaseDto(Guid RecipeId, Guid OutputItemId, string OutputSku, string OutputName, int RecipeVersion,
    IReadOnlyList<CostIncreaseDto> Components);

public sealed record RecipeCostIncreasesBlock(int Count, decimal AlertPct, IReadOnlyList<RecipeCostIncreaseDto> Items);

/// <param name="OverdueCount">Required before today, included in <paramref name="Count"/>.</param>
public sealed record CustomerOrdersDueBlock(int Count, int OverdueCount, IReadOnlyList<DashboardDocumentDto> Items);

public sealed record LocationLowStockDto(Guid LocationId, string Code, string Name, int Count);

/// <summary>
/// The dashboard of a location, or of every location in scope without one (backend §8.2). Each block is null when the user
/// lacks its permission.
/// </summary>
public sealed record DashboardDto(
    Guid? LocationId,
    DateOnly BusinessDate,
    LowStockBlock? LowStock,
    ExpiringLotsBlock? ExpiringLots,
    DashboardDocumentsBlock? TransfersToReceive,
    DashboardDocumentsBlock? TransfersToDispatch,
    DashboardDocumentsBlock? BranchOrdersToApprove,
    DashboardDocumentsBlock? BranchOrdersInProgress,
    DashboardDocumentsBlock? PurchaseOrdersToApprove,
    IReadOnlyList<ProductionTodayRowDto>? ProductionToday,
    ProductionInProgressBlock? ProductionInProgress,
    RecipeCostIncreasesBlock? RecipesWithCostIncreases,
    CustomerOrdersDueBlock? CustomerOrdersDue,
    DashboardDocumentsBlock? CustomerShipmentsToDispatch,
    IReadOnlyList<LocationLowStockDto>? LowStockByLocation);

public interface IDashboardService
{
    Task<DashboardDto> GetAsync(Guid? locationId, CancellationToken ct = default);
}

public sealed class DashboardService(IAppDbContext db, ILocationScope scope, UserAccessContext access, IClock clock, IStockQueries stock)
    : IDashboardService
{
    public const int PreviewSize = 5;

    public async Task<DashboardDto> GetAsync(Guid? locationId, CancellationToken ct = default)
    {
        if (locationId is { } id)
            scope.EnsureAccess(id);
        var locations = locationId is { } only ? [only] : scope.AllowedLocationIds.ToList();
        var today = clock.BusinessDate();

        LowStockBlock? lowStock = null;
        ExpiringLotsBlock? expiring = null;
        if (Has(Permissions.InventoryView))
        {
            var alerts = await stock.AlertsAsync(locationId, ct);
            lowStock = new LowStockBlock(alerts.LowStock.Count, [.. alerts.LowStock.Take(PreviewSize)]);
            expiring = new ExpiringLotsBlock(alerts.ExpiringLots.Count, alerts.ExpiringLots.Count(l => l.IsExpired), alerts.ExpiryAlertDays,
                [.. alerts.ExpiringLots.Take(PreviewSize)]);
        }

        DashboardDocumentsBlock? toReceive = null, toDispatch = null;
        if (Has(Permissions.LogisticsView))
        {
            toReceive = await TransfersAsync(t => t.Status == TransferStatus.Dispatched && locations.Contains(t.ToLocationId), true, ct);
            toDispatch = await TransfersAsync(t => t.Status == TransferStatus.Draft && locations.Contains(t.FromLocationId), false, ct);
        }

        var toApprove = Has(Permissions.LogisticsOrdersApprove)
            ? await BranchOrdersAsync(o => o.Status == BranchOrderStatus.Submitted && locations.Contains(o.SupplyingLocationId), false, ct)
            : null;
        var inProgress = Has(Permissions.LogisticsOrdersCreate)
            ? await BranchOrdersAsync(o => locations.Contains(o.RequestingLocationId) && (o.Status == BranchOrderStatus.Submitted
                || o.Status == BranchOrderStatus.Approved || o.Status == BranchOrderStatus.PartiallyFulfilled), true, ct)
            : null;
        var purchaseOrders = Has(Permissions.PurchasingPoApprove) ? await PurchaseOrdersAsync(locations, ct) : null;

        IReadOnlyList<ProductionTodayRowDto>? productionToday = null;
        ProductionInProgressBlock? productionInProgress = null;
        RecipeCostIncreasesBlock? costIncreases = null;
        if (Has(Permissions.ProductionView))
        {
            productionToday = await ProductionTodayAsync(locations, today, ct);
            productionInProgress = await ProductionInProgressAsync(locations, ct);
            costIncreases = await RecipeCostIncreasesAsync(today, ct);
        }

        var customerOrders = Has(Permissions.SalesView) ? await CustomerOrdersDueAsync(locations, today, ct) : null;
        var shipments = Has(Permissions.SalesShipmentsDispatch) ? await ShipmentsAsync(locations, ct) : null;
        var byLocation = Has(Permissions.LocationsAll) && Has(Permissions.InventoryView) ? await LowStockByLocationAsync(ct) : null;

        return new DashboardDto(locationId, today, lowStock, expiring, toReceive, toDispatch, toApprove, inProgress, purchaseOrders,
            productionToday, productionInProgress, costIncreases, customerOrders, shipments, byLocation);
    }

    private bool Has(string permission) => access.Access?.Has(permission) ?? false;

    private async Task<DashboardDocumentsBlock> TransfersAsync(Expression<Func<Transfer, bool>> filter,
        bool showOrigin, CancellationToken ct)
    {
        var rows = db.Transfers.AsNoTracking().Where(t => t.Kind == TransferKind.Standard).Where(filter);
        var items = await (from t in rows
                           join l in db.Locations on showOrigin ? t.FromLocationId : t.ToLocationId equals l.Id
                           orderby t.Folio
                           select new DashboardDocumentDto(t.Id, t.Folio, l.Name,
                               t.DispatchedAt == null ? null : BusinessCalendar.ToBusinessDate(t.DispatchedAt.Value)))
            .Take(PreviewSize).ToListAsync(ct);
        return new DashboardDocumentsBlock(await rows.CountAsync(ct), items);
    }

    private async Task<DashboardDocumentsBlock> BranchOrdersAsync(Expression<Func<BranchOrder, bool>> filter,
        bool showSupplier, CancellationToken ct)
    {
        var rows = db.BranchOrders.AsNoTracking().Where(filter);
        var items = await (from o in rows
                           join l in db.Locations on showSupplier ? o.SupplyingLocationId : o.RequestingLocationId equals l.Id
                           orderby o.RequiredDate, o.Folio
                           select new DashboardDocumentDto(o.Id, o.Folio, l.Name, o.RequiredDate))
            .Take(PreviewSize).ToListAsync(ct);
        return new DashboardDocumentsBlock(await rows.CountAsync(ct), items);
    }

    private async Task<DashboardDocumentsBlock> PurchaseOrdersAsync(List<Guid> locations, CancellationToken ct)
    {
        var rows = db.PurchaseOrders.AsNoTracking()
            .Where(o => o.Status == PurchaseOrderStatus.PendingApproval && locations.Contains(o.DeliveryLocationId));
        var items = await (from o in rows
                           join s in db.Suppliers on o.SupplierId equals s.Id
                           orderby o.ExpectedDate, o.Folio
                           select new DashboardDocumentDto(o.Id, o.Folio, s.Name, o.ExpectedDate))
            .Take(PreviewSize).ToListAsync(ct);
        return new DashboardDocumentsBlock(await rows.CountAsync(ct), items);
    }

    private async Task<IReadOnlyList<ProductionTodayRowDto>> ProductionTodayAsync(List<Guid> locations, DateOnly today, CancellationToken ct)
    {
        var rows = await (from o in db.ProductionOrders.AsNoTracking()
                          join i in db.Items on o.OutputItemId equals i.Id
                          join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                          join r in db.Recipes on o.RecipeId equals r.Id
                          join f in db.Locations on r.FactoryId equals f.Id into factories
                          from f in factories.DefaultIfEmpty()
                          where locations.Contains(o.LocationId) && o.ScheduledDate == today && o.Status != ProductionOrderStatus.Cancelled
                          group o by new { r.FactoryId, FactoryName = f == null ? null : f.Name, Uom = u.Code }
                          into g
                          select new { g.Key, Orders = g.Count(), Planned = g.Sum(o => o.PlannedQty), Produced = g.Sum(o => o.ProducedQty) })
            .ToListAsync(ct);
        return [.. rows.OrderBy(r => r.Key.FactoryName is null).ThenBy(r => r.Key.FactoryName).ThenBy(r => r.Key.Uom)
            .Select(r => new ProductionTodayRowDto(r.Key.FactoryId, r.Key.FactoryName ?? "Sin fábrica", r.Key.Uom, r.Orders, r.Planned, r.Produced))];
    }

    private async Task<ProductionInProgressBlock> ProductionInProgressAsync(List<Guid> locations, CancellationToken ct)
    {
        var rows = db.ProductionOrders.AsNoTracking()
            .Where(o => o.Status == ProductionOrderStatus.InProgress && locations.Contains(o.LocationId));
        var items = await (from o in rows
                           join i in db.Items on o.OutputItemId equals i.Id
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           orderby o.ScheduledDate, o.Folio
                           select new ProductionInProgressDto(o.Id, o.Folio, i.Sku, i.Name, u.Code, o.ScheduledDate, o.PlannedQty, o.ProducedQty))
            .Take(PreviewSize).ToListAsync(ct);
        return new ProductionInProgressBlock(await rows.CountAsync(ct), items);
    }

    /// <summary>RN-51: active recipe versions with a component whose last receipt cost rose (recipes are not per location).</summary>
    private async Task<RecipeCostIncreasesBlock> RecipeCostIncreasesAsync(DateOnly today, CancellationToken ct)
    {
        var alertPct = await db.GetSettingAsync(AppSettingKeys.CostIncreaseAlertPct, ct);
        var increases = await RecipeCostRules.IncreasesAsync(db, alertPct, today, ct);
        if (increases.Count == 0)
            return new RecipeCostIncreasesBlock(0, alertPct, []);

        var risen = increases.Keys.ToList();
        var recipes = await (from r in db.Recipes.AsNoTracking()
                             from l in r.Lines
                             join i in db.Items on r.OutputItemId equals i.Id
                             where r.IsActive && i.IsActive && risen.Contains(l.ComponentItemId)
                             select new { r.Id, r.OutputItemId, i.Sku, i.Name, r.VersionNumber, l.ComponentItemId })
            .ToListAsync(ct);
        var items = recipes.GroupBy(r => r.Id)
            .Select(g => new RecipeCostIncreaseDto(g.Key, g.First().OutputItemId, g.First().Sku, g.First().Name, g.First().VersionNumber,
                [.. g.Select(r => increases[r.ComponentItemId]).DistinctBy(c => c.ItemId).OrderByDescending(c => c.IncreasePct)]))
            .OrderByDescending(r => r.Components.Max(c => c.IncreasePct)).ThenBy(r => r.OutputSku)
            .ToList();
        return new RecipeCostIncreasesBlock(items.Count, alertPct, [.. items.Take(PreviewSize)]);
    }

    private async Task<CustomerOrdersDueBlock> CustomerOrdersDueAsync(List<Guid> locations, DateOnly today, CancellationToken ct)
    {
        var rows = db.CustomerOrders.AsNoTracking()
            .Where(o => locations.Contains(o.SupplyingLocationId) && o.RequiredDate <= today
                        && (o.Status == CustomerOrderStatus.Confirmed || o.Status == CustomerOrderStatus.PartiallyShipped));
        var items = await (from o in rows
                           join c in db.Customers on o.CustomerId equals c.Id
                           orderby o.RequiredDate, o.Folio
                           select new DashboardDocumentDto(o.Id, o.Folio, c.Name, o.RequiredDate))
            .Take(PreviewSize).ToListAsync(ct);
        return new CustomerOrdersDueBlock(await rows.CountAsync(ct), await rows.CountAsync(o => o.RequiredDate < today, ct), items);
    }

    private async Task<DashboardDocumentsBlock> ShipmentsAsync(List<Guid> locations, CancellationToken ct)
    {
        var rows = db.CustomerShipments.AsNoTracking()
            .Where(s => s.Status == CustomerShipmentStatus.Draft && locations.Contains(s.FromLocationId));
        var items = await (from s in rows
                           join c in db.Customers on s.CustomerId equals c.Id
                           join o in db.CustomerOrders on s.CustomerOrderId equals o.Id
                           orderby o.RequiredDate, s.Folio
                           select new DashboardDocumentDto(s.Id, s.Folio, c.Name, o.RequiredDate))
            .Take(PreviewSize).ToListAsync(ct);
        return new DashboardDocumentsBlock(await rows.CountAsync(ct), items);
    }

    /// <summary>Items under minimum per location (sub-warehouses count in their parent), only those with some.</summary>
    private async Task<IReadOnlyList<LocationLowStockDto>> LowStockByLocationAsync(CancellationToken ct)
    {
        var alerts = await stock.AlertsAsync(null, ct);
        var counts = alerts.LowStock.GroupBy(a => a.LocationId).ToDictionary(g => g.Key, g => g.Count());
        var ids = counts.Keys.ToList();
        var locations = await db.Locations.AsNoTracking().Where(l => ids.Contains(l.Id)).Select(l => new { l.Id, l.Code, l.Name })
            .ToListAsync(ct);
        return [.. locations.Select(l => new LocationLowStockDto(l.Id, l.Code, l.Name, counts[l.Id]))
            .OrderByDescending(l => l.Count).ThenBy(l => l.Code)];
    }
}
