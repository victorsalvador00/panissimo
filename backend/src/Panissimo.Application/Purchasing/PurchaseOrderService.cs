using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

public interface IPurchaseOrderService
{
    Task<PagedResult<PurchaseOrderListItemDto>> ListAsync(PurchaseOrderListQuery query, CancellationToken ct = default);
    Task<PurchaseOrderDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken ct = default);
    Task<PurchaseOrderDto> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct = default);

    /// <summary>RN-31: at or above the threshold → PendingApproval; below it → Approved.</summary>
    Task<PurchaseOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default);
    Task<PurchaseOrderDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default);
    Task<PurchaseOrderDto> RejectAsync(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct = default);
    Task<PurchaseOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);
    Task<PurchaseOrderDto> CloseAsync(Guid id, ClosePurchaseOrderRequest request, CancellationToken ct = default);
}

public sealed class PurchaseOrderService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IPurchaseOrderService
{
    private static readonly Dictionary<string, Expression<Func<PurchaseOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["expectedDate"] = o => o.ExpectedDate,
        ["createdAt"] = o => o.CreatedAt,
        ["status"] = o => o.Status,
        ["total"] = o => o.Total,
    };

    public async Task<PagedResult<PurchaseOrderListItemDto>> ListAsync(PurchaseOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.PurchaseOrders.AsNoTracking().Where(o => allowed.Contains(o.DeliveryLocationId));
        orders = query.Tab switch
        {
            PurchaseOrderTab.ToApprove => orders.Where(o => o.Status == PurchaseOrderStatus.PendingApproval),
            PurchaseOrderTab.ToReceive => orders.Where(o => o.Status == PurchaseOrderStatus.Approved || o.Status == PurchaseOrderStatus.PartiallyReceived),
            _ => orders,
        };
        if (query.PendingReceipt is true)
            orders = orders.Where(o => o.Status == PurchaseOrderStatus.Approved || o.Status == PurchaseOrderStatus.PartiallyReceived);
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.SupplierId is { } supplierId)
            orders = orders.Where(o => o.SupplierId == supplierId);
        if (query.LocationId is { } locationId)
            orders = orders.Where(o => o.DeliveryLocationId == locationId);
        if (query.From is { } from)
            orders = orders.Where(o => o.ExpectedDate >= from);
        if (query.To is { } to)
            orders = orders.Where(o => o.ExpectedDate <= to);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term)
                                       || db.Suppliers.Any(s => s.Id == o.SupplierId && s.Name.ToLower().Contains(term)));

        var page = await orders.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);

        var ids = page.Items.Select(o => o.Id).ToList();
        var lineCounts = await db.PurchaseOrders.Where(o => ids.Contains(o.Id)).Select(o => new { o.Id, Count = o.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var supplierIds = page.Items.Select(o => o.SupplierId).Distinct().ToList();
        var suppliers = await db.Suppliers.Where(s => supplierIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        var locationIds = page.Items.Select(o => o.DeliveryLocationId).Distinct().ToList();
        var locations = await db.Locations.Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return new PagedResult<PurchaseOrderListItemDto>(
            page.Items.Select(o => new PurchaseOrderListItemDto(o.Id, o.Folio, o.SupplierId, suppliers[o.SupplierId], o.DeliveryLocationId,
                locations[o.DeliveryLocationId], o.ExpectedDate, o.Status, lineCounts[o.Id], o.Subtotal, o.TaxTotal, o.Total, o.CreatedAt)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<PurchaseOrderDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var order = await db.PurchaseOrders.AsNoTracking().Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("la orden de compra", id);
        scope.EnsureAccess(order.DeliveryLocationId);
        return await ToDtoAsync(order, ct);
    }

    public async Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken ct = default)
    {
        await EnsurePlantAsync(request.DeliveryLocationId, ct);
        var lines = await ResolveLinesAsync(request.SupplierId, request.Lines, null, ct);

        var order = new PurchaseOrder(await folios.NextAsync(DocType.PurchaseOrder, ct), request.SupplierId, request.DeliveryLocationId,
            request.ExpectedDate, request.Notes, lines);
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<PurchaseOrderDto> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        if (request.DeliveryLocationId != order.DeliveryLocationId)
            await EnsurePlantAsync(request.DeliveryLocationId, ct);
        var lines = await ResolveLinesAsync(order.SupplierId, request.Lines, order, ct);

        order.UpdateDraft(request.DeliveryLocationId, request.ExpectedDate, request.Notes, lines);
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<PurchaseOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        var supplier = await db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == order.SupplierId, ct);
        if (!supplier.IsActive)
            throw new BusinessRuleException("supplier_inactive", $"El proveedor {supplier.Name} está inactivo.");
        var threshold = await db.GetSettingAsync(AppSettingKeys.PoApprovalThreshold, ct);
        return await ChangeAsync(order, version, o => o.Submit(threshold, clock.UtcNow, currentUser.UserId), ct);
    }

    public async Task<PurchaseOrderDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), version, o => o.Approve(clock.UtcNow, currentUser.UserId), ct);

    public async Task<PurchaseOrderDto> RejectAsync(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), request.Version, o => o.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public async Task<PurchaseOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), version, o => o.Cancel(), ct);

    public async Task<PurchaseOrderDto> CloseAsync(Guid id, ClosePurchaseOrderRequest request, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), request.Version, o => o.Close(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    private async Task<PurchaseOrderDto> ChangeAsync(PurchaseOrder order, uint version, Action<PurchaseOrder> change, CancellationToken ct)
    {
        db.EnsureVersion(order, version);
        change(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    /// <summary>
    /// RN-30: only active items of the supplier's active catalog; the price defaults to the catalog's and may be edited;
    /// VAT from the item; whole quantities when the purchase unit is pieces (RN-03b). A line of the current order keeps
    /// its requisition link, as long as it keeps its item.
    /// </summary>
    private async Task<List<PurchaseOrderLineInput>> ResolveLinesAsync(
        Guid supplierId, IReadOnlyList<PurchaseOrderLineRequest> lines, PurchaseOrder? current, CancellationToken ct)
    {
        var supplier = await db.Suppliers.AsNoTracking().SingleOrDefaultAsync(s => s.Id == supplierId, ct)
                       ?? throw new NotFoundException("el proveedor", supplierId);
        if (!supplier.IsActive)
            throw new BusinessRuleException("supplier_inactive", $"El proveedor {supplier.Name} está inactivo.");

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, u.Code })
            .ToDictionaryAsync(x => x.Item.Id, ct);
        var catalog = await db.SupplierItems.AsNoTracking()
            .Where(o => o.SupplierId == supplierId && itemIds.Contains(o.ItemId) && o.IsActive)
            .ToDictionaryAsync(o => o.ItemId, o => o.Price, ct);

        var errors = new List<string>();
        var resolved = new List<PurchaseOrderLineInput>();
        foreach (var line in lines)
        {
            if (!items.TryGetValue(line.ItemId, out var entry))
            {
                errors.Add("Uno o más artículos no existen.");
                continue;
            }
            var sku = entry.Item.Sku;
            if (!entry.Item.IsActive)
                errors.Add($"El artículo {sku} está inactivo.");
            else if (!catalog.TryGetValue(line.ItemId, out var price))
                errors.Add($"{supplier.Name} no vende {sku}: agrégalo a su catálogo (RN-30).");
            else
            {
                if (entry.Code == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(line.Quantity))
                    errors.Add($"{sku} se compra en piezas: la cantidad debe ser entera.");

                Guid? requisitionLineId = null;
                if (line.LineId is { } lineId)
                {
                    var existing = current?.Lines.SingleOrDefault(l => l.Id == lineId);
                    if (existing is null)
                        errors.Add("Una línea indicada no pertenece a la orden de compra.");
                    else if (existing.ItemId != line.ItemId)
                        errors.Add($"No puedes cambiar el artículo de la línea {existing.LineNumber}: agrega una línea nueva.");
                    else
                        requisitionLineId = existing.RequisitionLineId;
                }
                resolved.Add(new PurchaseOrderLineInput(line.ItemId, line.Quantity, line.UnitPrice ?? price, entry.Item.TaxRate, requisitionLineId));
            }
        }

        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });
        return resolved;
    }

    /// <summary>RN-33: deliveries only at the plant.</summary>
    private Task EnsurePlantAsync(Guid locationId, CancellationToken ct) =>
        PurchasingLocations.EnsurePlantAsync(db, scope, locationId, "purchase_order_plant_only",
            "Las compras se entregan solo en la Planta (RN-33).", ct);

    private async Task<PurchaseOrder> FindAsync(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("la orden de compra", id);
        scope.EnsureAccess(order.DeliveryLocationId);
        return order;
    }

    private async Task<PurchaseOrderDto> ToDtoAsync(PurchaseOrder o, CancellationToken ct)
    {
        var supplier = await db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == o.SupplierId, ct);
        var location = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == o.DeliveryLocationId, ct);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.ReceiptTolerancePct, ct);

        var itemIds = o.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join p in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals p.Id
                           join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, i.TracksLots, i.PurchaseToBaseFactor, Uom = p.Code, BaseUom = b.Code })
            .ToDictionaryAsync(x => x.Id, ct);
        var requisitionLineIds = o.Lines.Select(l => l.RequisitionLineId).OfType<Guid>().ToList();
        var requisitions = await (from r in db.PurchaseRequisitions.AsNoTracking()
                                  from rl in r.Lines
                                  where requisitionLineIds.Contains(rl.Id)
                                  select new { LineId = rl.Id, r.Id, r.Folio })
            .ToDictionaryAsync(x => x.LineId, ct);
        var receipts = await db.GoodsReceipts.AsNoTracking().Where(g => g.PurchaseOrderId == o.Id).OrderBy(g => g.ReceivedAt)
            .Select(g => new PurchaseOrderReceiptSummaryDto(g.Id, g.Folio, g.ReceivedAt, g.SupplierInvoiceNumber))
            .ToListAsync(ct);
        var names = await userDirectory.GetNamesAsync([o.CreatedBy, o.UpdatedBy, o.SubmittedBy, o.ApprovedBy, o.RejectedBy, o.ClosedBy], ct);

        var lines = o.Lines.OrderBy(l => l.LineNumber).Select(l =>
        {
            var item = items[l.ItemId];
            var requisition = l.RequisitionLineId is { } rl ? requisitions.GetValueOrDefault(rl) : null;
            return new PurchaseOrderLineDto(l.Id, l.LineNumber, l.ItemId, item.Sku, item.Name, item.Uom, item.BaseUom,
                item.PurchaseToBaseFactor, item.TracksLots, l.Quantity, l.UnitPrice, l.TaxRate, l.Subtotal, l.TaxAmount, l.ReceivedQty,
                l.PendingQty, Math.Max(0, l.MaxReceivableQty(tolerance) - l.ReceivedQty), l.RequisitionLineId, requisition?.Id,
                requisition?.Folio);
        }).ToList();

        return new PurchaseOrderDto(o.Id, o.Folio, o.SupplierId, supplier.TaxId, supplier.Name, supplier.PaymentTermsDays,
            o.DeliveryLocationId, location.Code, location.Name, o.ExpectedDate, o.Status, o.Notes, lines, o.Subtotal, o.TaxTotal, o.Total,
            tolerance, o.SubmittedAt, names.Of(o.SubmittedBy), o.ApprovedAt, names.Of(o.ApprovedBy),
            o.ApprovedAt is not null && o.ApprovedBy is null, o.RejectedAt, names.Of(o.RejectedBy), o.RejectionReason,
            o.ClosedAt, names.Of(o.ClosedBy), o.CloseReason, receipts, o.CreatedAt, names.Of(o.CreatedBy), o.UpdatedAt, names.Of(o.UpdatedBy), o.Version);
    }
}
