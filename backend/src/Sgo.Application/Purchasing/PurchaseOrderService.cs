using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Purchasing;

namespace Sgo.Application.Purchasing;

public sealed record PurchaseOrderListQuery : PageQuery
{
    public PurchaseOrderStatus? Status { get; init; }
    public Guid? SupplierId { get; init; }
    public Guid? LocationId { get; init; }

    /// <summary>Only orders that can still be received: Approved or PartiallyReceived.</summary>
    public bool PendingReceipt { get; init; }
}

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="UnitPrice">Per purchase unit without VAT; empty takes the supplier's catalog price (RN-30).</param>
/// <param name="LineId">On edit: an existing line, to keep its link to a requisition line.</param>
public sealed record PurchaseOrderLineRequest(Guid ItemId, decimal Quantity, decimal? UnitPrice, Guid? LineId = null);

public sealed record CreatePurchaseOrderRequest(
    Guid SupplierId, Guid DeliveryLocationId, DateOnly? ExpectedDate, string? Notes, IReadOnlyList<PurchaseOrderLineRequest> Lines);

/// <summary>The supplier is fixed: the lines depend on its catalog.</summary>
public sealed record UpdatePurchaseOrderRequest(
    uint Version, Guid DeliveryLocationId, DateOnly? ExpectedDate, string? Notes, IReadOnlyList<PurchaseOrderLineRequest> Lines);

public sealed record RejectPurchaseOrderRequest(uint Version, string Reason);

public sealed record PurchasingLocationDto(Guid Id, string Code, string Name);

public sealed record PurchaseOrderSupplierDto(Guid Id, string TaxId, string Name);

public sealed record PurchaseOrderListItemDto(
    Guid Id, string Folio, PurchaseOrderSupplierDto Supplier, PurchasingLocationDto DeliveryLocation, DateOnly? ExpectedDate,
    PurchaseOrderStatus Status, decimal Total, int LineCount, DateTimeOffset CreatedAt);

/// <param name="PurchaseUomCode">Unit of Quantity, UnitPrice and ReceivedQty: the item's purchase unit, or its base unit.</param>
public sealed record PurchaseOrderLineDto(
    Guid Id, Guid ItemId, string Sku, string ItemName, string PurchaseUomCode, decimal PurchaseToBaseFactor, bool TracksLots,
    decimal Quantity, decimal UnitPrice, decimal TaxRate, decimal Subtotal, decimal TaxAmount, decimal ReceivedQty, decimal PendingQty,
    Guid? RequisitionLineId, Guid? RequisitionId, string? RequisitionFolio);

public sealed record PurchaseOrderDto(
    Guid Id, string Folio, PurchaseOrderSupplierDto Supplier, PurchasingLocationDto DeliveryLocation, DateOnly? ExpectedDate,
    PurchaseOrderStatus Status, string? Notes, decimal Subtotal, decimal TaxTotal, decimal Total,
    DateTimeOffset? SubmittedAt, Guid? SubmittedBy, string? SubmittedByName, bool ApprovalRequired, Guid? ApprovedBy,
    string? ApprovedByName, DateTimeOffset? ApprovedAt, DateTimeOffset? RejectedAt, Guid? RejectedBy, string? RejectedByName,
    string? RejectionReason, DateTimeOffset? ClosedAt, Guid? ClosedBy, string? ClosedByName,
    IReadOnlyList<PurchaseOrderLineDto> Lines, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version);

public sealed class PurchaseOrderLineRequestValidator : AbstractValidator<PurchaseOrderLineRequest>
{
    public PurchaseOrderLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => p is null || InventoryMath.Round(p.Value) == p).WithMessage("El precio admite máximo 4 decimales.");
    }
}

public sealed class CreatePurchaseOrderRequestValidator : AbstractValidator<CreatePurchaseOrderRequest>
{
    public CreatePurchaseOrderRequestValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty().WithName("Proveedor");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en la orden de compra.");
        RuleForEach(x => x.Lines).SetValidator(new PurchaseOrderLineRequestValidator());
    }
}

public sealed class UpdatePurchaseOrderRequestValidator : AbstractValidator<UpdatePurchaseOrderRequest>
{
    public UpdatePurchaseOrderRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).SetValidator(new PurchaseOrderLineRequestValidator());
    }
}

public sealed class RejectPurchaseOrderRequestValidator : AbstractValidator<RejectPurchaseOrderRequest>
{
    public RejectPurchaseOrderRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public interface IPurchaseOrderService
{
    Task<PagedResult<PurchaseOrderListItemDto>> ListAsync(PurchaseOrderListQuery query, CancellationToken ct = default);
    Task<PurchaseOrderDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken ct = default);
    Task<PurchaseOrderDto> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct = default);

    /// <summary>RN-31: compares the subtotal with the configured threshold.</summary>
    Task<PurchaseOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default);

    Task<PurchaseOrderDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default);
    Task<PurchaseOrderDto> RejectAsync(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct = default);
    Task<PurchaseOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);
    Task<PurchaseOrderDto> CloseAsync(Guid id, uint version, CancellationToken ct = default);
}

public sealed class PurchaseOrderService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IPurchaseOrderService
{
    private static readonly Dictionary<string, Expression<Func<PurchaseOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["createdAt"] = o => o.CreatedAt,
        ["expectedDate"] = o => o.ExpectedDate,
        ["total"] = o => o.Total,
        ["status"] = o => o.Status,
    };

    public async Task<PagedResult<PurchaseOrderListItemDto>> ListAsync(PurchaseOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.PurchaseOrders.AsNoTracking().Where(o => allowed.Contains(o.DeliveryLocationId));
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.PendingReceipt)
            orders = orders.Where(o => o.Status == PurchaseOrderStatus.Approved || o.Status == PurchaseOrderStatus.PartiallyReceived);
        if (query.SupplierId is { } supplierId)
            orders = orders.Where(o => o.SupplierId == supplierId);
        if (query.LocationId is { } locationId)
            orders = orders.Where(o => o.DeliveryLocationId == locationId);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term)
                                       || db.Suppliers.Any(s => s.Id == o.SupplierId && s.Name.ToLower().Contains(term)));

        var page = await orders.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        return new PagedResult<PurchaseOrderListItemDto>(await ToListItemsAsync(db, page.Items, ct), page.Page, page.PageSize, page.Total);
    }

    public async Task<PurchaseOrderDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<PurchaseOrderDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken ct = default)
    {
        await EnsureDeliveryLocationAsync(request.DeliveryLocationId, ct);
        var supplier = await db.Suppliers.AsNoTracking().SingleOrDefaultAsync(s => s.Id == request.SupplierId, ct)
                       ?? throw new RequestValidationException(new Dictionary<string, string[]> { ["supplierId"] = ["El proveedor no existe."] });
        if (!supplier.IsActive)
            throw new BusinessRuleException("supplier_inactive", $"El proveedor {supplier.Name} está inactivo.");

        var lines = await ResolveLinesAsync(supplier.Id, request.Lines, [], ct);
        var order = new PurchaseOrder(await folios.NextAsync(DocType.PurchaseOrder, ct), supplier.Id, request.DeliveryLocationId,
            request.ExpectedDate, request.Notes, lines);
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<PurchaseOrderDto> UpdateAsync(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        await EnsureDeliveryLocationAsync(request.DeliveryLocationId, ct);

        order.UpdateDraft(request.DeliveryLocationId, request.ExpectedDate, request.Notes,
            await ResolveLinesAsync(order.SupplierId, request.Lines, order.Lines, ct));
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<PurchaseOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var threshold = await db.GetDecimalSettingAsync(AppSettingKeys.PoApprovalThreshold, ct);
        return await TransitionAsync(id, version, o => o.Submit(threshold, clock.UtcNow, currentUser.UserId), ct);
    }

    public Task<PurchaseOrderDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, o => o.Approve(clock.UtcNow, currentUser.UserId), ct);

    public Task<PurchaseOrderDto> RejectAsync(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct = default) =>
        TransitionAsync(id, request.Version, o => o.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public Task<PurchaseOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, o => o.Cancel(), ct);

    public Task<PurchaseOrderDto> CloseAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, o => o.Close(clock.UtcNow, currentUser.UserId), ct);

    private async Task<PurchaseOrderDto> TransitionAsync(Guid id, uint version, Action<PurchaseOrder> transition, CancellationToken ct)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, version);
        transition(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    private async Task EnsureDeliveryLocationAsync(Guid locationId, CancellationToken ct)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        if (!location.CanPurchase)
            throw new BusinessRuleException("purchase_order_location_cannot_purchase",
                "Las órdenes de compra se entregan en la fábrica o el comisariato.");
    }

    /// <summary>
    /// RN-30: only active items of the supplier's active catalog; an empty price takes the catalog price. Edited lines that
    /// keep their id also keep their requisition link.
    /// </summary>
    private async Task<List<PurchaseOrderLineInput>> ResolveLinesAsync(
        Guid supplierId, IReadOnlyList<PurchaseOrderLineRequest> lines, IReadOnlyList<PurchaseOrderLine> existing, CancellationToken ct)
    {
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var catalog = await db.SupplierItems.AsNoTracking()
            .Where(si => si.SupplierId == supplierId && si.IsActive && itemIds.Contains(si.ItemId))
            .ToDictionaryAsync(si => si.ItemId, si => si.Price, ct);

        var errors = new List<string>();
        var result = new List<PurchaseOrderLineInput>();
        foreach (var line in lines)
        {
            Guid? requisitionLineId = null;
            if (line.LineId is { } lineId)
            {
                var current = existing.SingleOrDefault(l => l.Id == lineId);
                if (current is null || current.ItemId != line.ItemId)
                {
                    errors.Add("Una línea indicada no pertenece a la orden de compra o cambió de artículo.");
                    continue;
                }
                requisitionLineId = current.RequisitionLineId;
            }

            if (!items.TryGetValue(line.ItemId, out var item))
                errors.Add("Uno o más artículos no existen.");
            else if (!item.IsActive)
                errors.Add($"El artículo {item.Sku} está inactivo.");
            else if (!catalog.TryGetValue(item.Id, out var catalogPrice))
                errors.Add($"El artículo {item.Sku} no está en el catálogo activo del proveedor.");
            else
                result.Add(new PurchaseOrderLineInput(item.Id, line.Quantity, line.UnitPrice ?? catalogPrice, item.TaxRate, requisitionLineId));
        }

        if (lines.Select(l => l.LineId).OfType<Guid>().GroupBy(id => id).Any(g => g.Count() > 1))
            errors.Add("Hay líneas repetidas.");
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });
        return result;
    }

    private async Task<PurchaseOrder> FindAsync(Guid id, CancellationToken ct)
    {
        var order = await db.PurchaseOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("la orden de compra", id);
        scope.EnsureAccess(order.DeliveryLocationId);
        return order;
    }

    internal static async Task<List<PurchaseOrderListItemDto>> ToListItemsAsync(ISgoDbContext db, IReadOnlyList<PurchaseOrder> orders, CancellationToken ct)
    {
        var ids = orders.Select(o => o.Id).ToList();
        var lineCounts = await db.PurchaseOrders.Where(o => ids.Contains(o.Id)).Select(o => new { o.Id, Count = o.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var suppliers = await SuppliersAsync(db, orders.Select(o => o.SupplierId), ct);
        var locations = await LocationsAsync(db, orders.Select(o => o.DeliveryLocationId), ct);
        return orders.Select(o => new PurchaseOrderListItemDto(o.Id, o.Folio, suppliers[o.SupplierId], locations[o.DeliveryLocationId],
            o.ExpectedDate, o.Status, o.Total, lineCounts[o.Id], o.CreatedAt)).ToList();
    }

    private async Task<PurchaseOrderDto> ToDtoAsync(PurchaseOrder o, CancellationToken ct)
    {
        var suppliers = await SuppliersAsync(db, [o.SupplierId], ct);
        var locations = await LocationsAsync(db, [o.DeliveryLocationId], ct);
        var itemIds = o.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code, i.PurchaseToBaseFactor, i.TracksLots })
            .ToDictionaryAsync(i => i.Id, ct);
        var requisitionLineIds = o.Lines.Select(l => l.RequisitionLineId).OfType<Guid>().ToList();
        var requisitions = await db.PurchaseRequisitions.AsNoTracking()
            .SelectMany(r => r.Lines.Where(l => requisitionLineIds.Contains(l.Id)), (r, l) => new { LineId = l.Id, r.Id, r.Folio })
            .ToDictionaryAsync(x => x.LineId, ct);

        var lines = o.Lines.Select(l =>
        {
            var item = items[l.ItemId];
            var requisition = l.RequisitionLineId is { } rl ? requisitions[rl] : null;
            return new PurchaseOrderLineDto(l.Id, l.ItemId, item.Sku, item.Name, item.Uom, item.PurchaseToBaseFactor, item.TracksLots,
                l.Quantity, l.UnitPrice, l.TaxRate, l.Subtotal, l.TaxAmount, l.ReceivedQty, l.PendingQty,
                l.RequisitionLineId, requisition?.Id, requisition?.Folio);
        }).OrderBy(l => l.Sku).ToList();
        var users = await userDirectory.GetNamesAsync([o.SubmittedBy, o.ApprovedBy, o.RejectedBy, o.ClosedBy, o.CreatedBy], ct);

        return new PurchaseOrderDto(o.Id, o.Folio, suppliers[o.SupplierId], locations[o.DeliveryLocationId], o.ExpectedDate, o.Status,
            o.Notes, o.Subtotal, o.TaxTotal, o.Total, o.SubmittedAt, o.SubmittedBy, users.Of(o.SubmittedBy), o.ApprovalRequired,
            o.ApprovedBy, users.Of(o.ApprovedBy), o.ApprovedAt, o.RejectedAt, o.RejectedBy, users.Of(o.RejectedBy), o.RejectionReason,
            o.ClosedAt, o.ClosedBy, users.Of(o.ClosedBy), lines, o.CreatedAt, o.CreatedBy, users.Of(o.CreatedBy), o.Version);
    }

    internal static async Task<Dictionary<Guid, PurchaseOrderSupplierDto>> SuppliersAsync(ISgoDbContext db, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Suppliers.AsNoTracking().Where(s => list.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => new PurchaseOrderSupplierDto(s.Id, s.TaxId, s.Name), ct);
    }

    internal static async Task<Dictionary<Guid, PurchasingLocationDto>> LocationsAsync(ISgoDbContext db, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Locations.AsNoTracking().Where(l => list.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new PurchasingLocationDto(l.Id, l.Code, l.Name), ct);
    }
}
