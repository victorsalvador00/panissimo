using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Sales;

public sealed record CustomerShipmentLineQuantityRequest(Guid LineId, decimal Quantity);

/// <param name="Lines">Quantities to change; lines not listed keep theirs. 0 leaves a line out.</param>
public sealed record UpdateCustomerShipmentRequest(uint Version, string? Notes, IReadOnlyList<CustomerShipmentLineQuantityRequest> Lines);

/// <param name="WarehouseId">Sub-warehouse this line leaves; empty takes the dispatch's (RN-45).</param>
public sealed record CustomerShipmentDispatchLineRequest(Guid LineId, IReadOnlyList<LotQuantity> Lots, Guid? WarehouseId = null);

/// <param name="Lines">Optional: lots chosen per line. Lines not listed are taken by FEFO.</param>
/// <param name="FromWarehouseId">Sub-warehouse of the plant every line leaves (RN-45); required when the plant has sub-warehouses.</param>
public sealed record DispatchCustomerShipmentRequest(
    uint Version, string VehicleDescription, string DriverName, string? ReceivedByName, IReadOnlyList<CustomerShipmentDispatchLineRequest>? Lines,
    Guid? FromWarehouseId = null);

/// <summary>Tabs of the shipments screen (frontend: Por despachar, Todas).</summary>
public enum CustomerShipmentTab
{
    All,
    ToDispatch,
}

public sealed record CustomerShipmentListQuery : PageQuery
{
    public CustomerShipmentTab? Tab { get; init; }
    public CustomerShipmentStatus? Status { get; init; }
    public Guid? CustomerId { get; init; }
    public Guid? CustomerOrderId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record CustomerShipmentListItemDto(
    Guid Id, string Folio, Guid CustomerOrderId, string CustomerOrderFolio, Guid CustomerId, string CustomerName, string? DeliveryPointName,
    CustomerShipmentStatus Status, int LineCount, decimal TotalQuantity, DateTimeOffset CreatedAt, DateTimeOffset? DispatchedAt);

public sealed record CustomerShipmentLotDto(Guid LotId, string LotNumber, DateOnly? ExpirationDate, decimal Quantity);

/// <param name="MaxQuantity">Order balance plus the shipment tolerance (RN-82), for the draft.</param>
/// <param name="LocationCode">Sub-warehouse it left (or the plant), once dispatched.</param>
public sealed record CustomerShipmentLineDto(
    Guid Id, Guid CustomerOrderLineId, string? LocationCode, Guid ItemId, string Sku, string ItemName, string? CustomerSku, string UomCode, bool TracksLots,
    decimal OrderedQty, decimal PreviouslyShippedQty, decimal MaxQuantity, decimal Quantity, decimal? UnitCost, decimal? LineCost,
    IReadOnlyList<CustomerShipmentLotDto> Lots);

public sealed record CustomerShipmentDto(
    Guid Id, string Folio, Guid CustomerOrderId, string CustomerOrderFolio, string? CustomerReference, Guid CustomerId, string CustomerCode,
    string CustomerName, Guid? DeliveryPointId, string? DeliveryPointName, string? DeliveryPointAddress, Guid FromLocationId,
    string FromLocationCode, string FromLocationName, CustomerShipmentStatus Status, string? Notes, IReadOnlyList<CustomerShipmentLineDto> Lines,
    decimal? TotalCost, string? VehicleDescription, string? DriverName, string? ReceivedByName, DateTimeOffset? DispatchedAt,
    string? DispatchedByName, DateTimeOffset? CancelledAt, DateTimeOffset CreatedAt, string? CreatedByName, uint Version);

public sealed class UpdateCustomerShipmentRequestValidator : AbstractValidator<UpdateCustomerShipmentRequest>
{
    public UpdateCustomerShipmentRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(CustomerShipment.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).NotNull().Must(l => l.Select(x => x.LineId).Distinct().Count() == l.Count).WithMessage("Hay líneas repetidas.");
        RuleForEach(x => x.Lines).ChildRules(line =>
            line.RuleFor(l => l.Quantity).GreaterThanOrEqualTo(0).WithName("Cantidad")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales."));
    }
}

public sealed class DispatchCustomerShipmentRequestValidator : AbstractValidator<DispatchCustomerShipmentRequest>
{
    public DispatchCustomerShipmentRequestValidator()
    {
        RuleFor(x => x.VehicleDescription).NotEmpty().MaximumLength(150).WithName("Vehículo");
        RuleFor(x => x.DriverName).NotEmpty().MaximumLength(150).WithName("Chofer");
        RuleFor(x => x.ReceivedByName).MaximumLength(150).WithName("Recibe");
    }
}

public interface ICustomerShipmentService
{
    Task<PagedResult<CustomerShipmentListItemDto>> ListAsync(CustomerShipmentListQuery query, CancellationToken ct = default);
    Task<CustomerShipmentDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>RN-81: a draft prefilled with the balance of each line of a confirmed or partially shipped order.</summary>
    Task<CustomerShipmentDto> CreateFromOrderAsync(Guid customerOrderId, CancellationToken ct = default);
    Task<CustomerShipmentDto> UpdateAsync(Guid id, UpdateCustomerShipmentRequest request, CancellationToken ct = default);
    Task<CustomerShipmentDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-81/RN-82: posts CustomerShipment at the plant (chosen lots or FEFO, expired rejected) and advances the order.</summary>
    Task<CustomerShipmentDto> DispatchAsync(Guid id, DispatchCustomerShipmentRequest request, CancellationToken ct = default);
}

public sealed class CustomerShipmentService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : ICustomerShipmentService
{
    private static readonly Dictionary<string, Expression<Func<CustomerShipment, object?>>> SortColumns = new()
    {
        ["folio"] = s => s.Folio,
        ["createdAt"] = s => s.CreatedAt,
        ["dispatchedAt"] = s => s.DispatchedAt,
        ["status"] = s => s.Status,
    };

    public async Task<PagedResult<CustomerShipmentListItemDto>> ListAsync(CustomerShipmentListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var shipments = db.CustomerShipments.AsNoTracking().Where(s => allowed.Contains(s.FromLocationId));
        if (query.Tab == CustomerShipmentTab.ToDispatch)
            shipments = shipments.Where(s => s.Status == CustomerShipmentStatus.Draft);
        if (query.Status is { } status)
            shipments = shipments.Where(s => s.Status == status);
        if (query.CustomerId is { } customerId)
            shipments = shipments.Where(s => s.CustomerId == customerId);
        if (query.CustomerOrderId is { } orderId)
            shipments = shipments.Where(s => s.CustomerOrderId == orderId);
        if (query.From is { } from)
            shipments = shipments.Where(s => s.CreatedAt >= from);
        if (query.To is { } to)
            shipments = shipments.Where(s => s.CreatedAt <= to);
        if (query.SearchTerm() is { } term)
            shipments = shipments.Where(s => s.Folio.ToLower().Contains(term));

        var page = await shipments.Include(s => s.Lines).ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);

        var orderIds = page.Items.Select(s => s.CustomerOrderId).Distinct().ToList();
        var orders = await db.CustomerOrders.Where(o => orderIds.Contains(o.Id)).ToDictionaryAsync(o => o.Id, o => o.Folio, ct);
        var customerIds = page.Items.Select(s => s.CustomerId).Distinct().ToList();
        var customers = await db.Customers.Where(c => customerIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var pointIds = page.Items.Select(s => s.DeliveryPointId).OfType<Guid>().Distinct().ToList();
        var points = await db.CustomerDeliveryPoints.Where(p => pointIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name, ct);

        return new PagedResult<CustomerShipmentListItemDto>(page.Items.Select(s => new CustomerShipmentListItemDto(s.Id, s.Folio,
            s.CustomerOrderId, orders[s.CustomerOrderId], s.CustomerId, customers[s.CustomerId],
            s.DeliveryPointId is { } p ? points.GetValueOrDefault(p) : null, s.Status, s.Lines.Count(l => l.Quantity > 0),
            s.Lines.Sum(l => l.Quantity), s.CreatedAt, s.DispatchedAt)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<CustomerShipmentDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var shipment = await Shipments().AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct)
                       ?? throw new NotFoundException("la remisión", id);
        scope.EnsureAccess(shipment.FromLocationId);
        return await ToDtoAsync(shipment, ct);
    }

    public async Task<CustomerShipmentDto> CreateFromOrderAsync(Guid customerOrderId, CancellationToken ct = default)
    {
        var order = await db.CustomerOrders.AsNoTracking().Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == customerOrderId, ct)
                    ?? throw new NotFoundException("el pedido de cliente", customerOrderId);
        scope.EnsureAccess(order.SupplyingLocationId);
        if (order.Lines.All(l => l.PendingQty == 0))
            throw new BusinessRuleException("customer_order_nothing_pending", $"El pedido {order.Folio} no tiene saldo por remisionar.");

        var lines = order.Lines.OrderBy(l => l.LineNumber).Where(l => l.PendingQty > 0)
            .Select(l => new CustomerShipmentLineInput(l.Id, l.ItemId, l.PendingQty)).ToList();
        var shipment = new CustomerShipment(await folios.NextAsync(DocType.CustomerShipment, ct), order, lines);
        db.CustomerShipments.Add(shipment);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(shipment, ct);
    }

    public async Task<CustomerShipmentDto> UpdateAsync(Guid id, UpdateCustomerShipmentRequest request, CancellationToken ct = default)
    {
        var shipment = await FindAsync(id, ct);
        db.EnsureVersion(shipment, request.Version);
        var order = await db.CustomerOrders.AsNoTracking().Include(o => o.Lines).SingleAsync(o => o.Id == shipment.CustomerOrderId, ct);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.ShipmentTolerancePct, ct);
        var quantities = request.Lines.ToDictionary(l => l.LineId, l => l.Quantity);

        await EnsureWholePiecesAsync(shipment, quantities, ct);
        // Early check against what is already shipped; the dispatch checks again (RN-82).
        foreach (var line in shipment.Lines.Where(l => quantities.ContainsKey(l.Id)))
        {
            var orderLine = order.Lines.Single(l => l.Id == line.CustomerOrderLineId);
            if (quantities[line.Id] > orderLine.RemainingWithTolerance(tolerance))
                throw new BusinessRuleException("shipment_over_tolerance",
                    $"La línea {orderLine.LineNumber} excede lo pedido: puedes remisionar máximo " +
                    $"{orderLine.RemainingWithTolerance(tolerance):0.####} (RN-82).");
        }

        shipment.UpdateDraft(request.Notes, quantities);
        db.Entry(shipment).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(shipment, ct);
    }

    public async Task<CustomerShipmentDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var shipment = await FindAsync(id, ct);
        db.EnsureVersion(shipment, version);
        shipment.Cancel(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(shipment, ct);
    }

    public async Task<CustomerShipmentDto> DispatchAsync(Guid id, DispatchCustomerShipmentRequest request, CancellationToken ct = default)
    {
        var shipment = await FindAsync(id, ct);
        db.EnsureVersion(shipment, request.Version);
        var order = await db.CustomerOrders.Include(o => o.Lines).SingleAsync(o => o.Id == shipment.CustomerOrderId, ct);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.ShipmentTolerancePct, ct);

        // RN-82: tolerance and order status, before anything is written.
        order.RegisterShipment(shipment.QuantitiesByOrderLine(), tolerance);
        var chosen = (request.Lines ?? []).Where(l => l.Lots.Count > 0).ToDictionary(l => l.LineId, l => l.Lots);
        // RN-45: the plant's sub-warehouse per line.
        var picker = await WarehousePicker.LoadAsync(db, scope, shipment.FromLocationId, ct);
        var lineWarehouses = (request.Lines ?? []).ToDictionary(l => l.LineId, l => l.WarehouseId);
        var sources = shipment.Lines.Where(l => l.Quantity > 0)
            .ToDictionary(l => l.Id, l => picker.Resolve(request.FromWarehouseId, lineWarehouses.GetValueOrDefault(l.Id)));
        var requests = shipment.DispatchRequests(chosen, lineId => sources[lineId]);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // First write claims the shipment (client's version) and the order (loaded version): a concurrent dispatch of this
        // shipment or of another shipment of the same order waits and then gets 409, rolling back its movements.
        db.Entry(shipment).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);

        var movements = await posting.PostAsync(requests, ct);
        shipment.Dispatch(request.VehicleDescription, request.DriverName, request.ReceivedByName, clock.UtcNow, currentUser.UserId, movements);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(shipment, ct);
    }

    private async Task EnsureWholePiecesAsync(CustomerShipment shipment, IReadOnlyDictionary<Guid, decimal> quantities, CancellationToken ct)
    {
        var itemIds = shipment.Lines.Select(l => l.ItemId).ToList();
        var pieces = await (from i in db.Items
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where itemIds.Contains(i.Id) && u.Code == UnitOfMeasure.PieceCode
                            select new { i.Id, i.Sku }).ToDictionaryAsync(x => x.Id, x => x.Sku, ct);
        foreach (var line in shipment.Lines)
            if (quantities.TryGetValue(line.Id, out var qty) && pieces.TryGetValue(line.ItemId, out var sku) && !InventoryMath.IsWhole(qty))
                throw new BusinessRuleException("whole_quantity_required", $"{sku} se maneja en piezas: la cantidad debe ser entera.");
    }

    private IQueryable<CustomerShipment> Shipments() => db.CustomerShipments.Include(s => s.Lines).ThenInclude(l => l.Lots);

    /// <summary>Shipments are made at the plant: every action requires it in the caller's scope.</summary>
    private async Task<CustomerShipment> FindAsync(Guid id, CancellationToken ct)
    {
        var shipment = await Shipments().SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw new NotFoundException("la remisión", id);
        scope.EnsureAccess(shipment.FromLocationId);
        return shipment;
    }

    private async Task<CustomerShipmentDto> ToDtoAsync(CustomerShipment s, CancellationToken ct)
    {
        var order = await db.CustomerOrders.AsNoTracking().Include(o => o.Lines).SingleAsync(o => o.Id == s.CustomerOrderId, ct);
        var customer = await db.Customers.AsNoTracking().SingleAsync(c => c.Id == s.CustomerId, ct);
        var point = s.DeliveryPointId is { } pointId ? await db.CustomerDeliveryPoints.AsNoTracking().SingleAsync(p => p.Id == pointId, ct) : null;
        var plant = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == s.FromLocationId, ct);
        var tolerance = await db.GetSettingAsync(AppSettingKeys.ShipmentTolerancePct, ct);
        var itemIds = s.Lines.Select(l => l.ItemId).ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, i.TracksLots, Uom = u.Code }).ToDictionaryAsync(x => x.Id, ct);
        var customerSkus = await db.CustomerItems.AsNoTracking().Where(r => r.CustomerId == s.CustomerId && itemIds.Contains(r.ItemId))
            .ToDictionaryAsync(r => r.ItemId, r => r.CustomerSku, ct);
        var lotIds = s.Lines.SelectMany(l => l.Lots).Select(l => l.LotId).Distinct().ToList();
        var lots = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);
        var names = await userDirectory.GetNamesAsync([s.CreatedBy, s.DispatchedBy], ct);
        var stockIds = s.Lines.Select(l => l.LocationId).OfType<Guid>().Distinct().ToList();
        var stockCodes = await db.Locations.AsNoTracking().Where(l => stockIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        var lines = s.Lines.Select(l =>
        {
            var item = items[l.ItemId];
            var orderLine = order.Lines.Single(o => o.Id == l.CustomerOrderLineId);
            var dispatched = s.Status == CustomerShipmentStatus.Dispatched;
            // Once dispatched, this shipment is already part of the order's ShippedQty.
            var previously = dispatched ? orderLine.ShippedQty - l.Quantity : orderLine.ShippedQty;
            return new CustomerShipmentLineDto(l.Id, l.CustomerOrderLineId, l.LocationId is { } stock ? stockCodes[stock] : null, l.ItemId, item.Sku, item.Name, customerSkus.GetValueOrDefault(l.ItemId),
                item.Uom, item.TracksLots, orderLine.Quantity, previously, dispatched ? l.Quantity : orderLine.RemainingWithTolerance(tolerance),
                l.Quantity, l.UnitCost, l.UnitCost is { } cost ? InventoryMath.Round(cost * l.Quantity) : null,
                l.Lots.Select(x => new CustomerShipmentLotDto(x.LotId, lots[x.LotId].LotNumber, lots[x.LotId].ExpirationDate, x.Quantity))
                    .OrderBy(x => x.ExpirationDate).ToList());
        }).OrderBy(l => order.Lines.Single(o => o.Id == l.CustomerOrderLineId).LineNumber).ToList();

        return new CustomerShipmentDto(s.Id, s.Folio, s.CustomerOrderId, order.Folio, order.CustomerReference, s.CustomerId, customer.Code,
            customer.Name, s.DeliveryPointId, point?.Name, point?.Address, s.FromLocationId, plant.Code, plant.Name, s.Status, s.Notes, lines,
            s.Status == CustomerShipmentStatus.Dispatched ? lines.Sum(l => l.LineCost ?? 0) : null, s.VehicleDescription, s.DriverName,
            s.ReceivedByName, s.DispatchedAt, names.Of(s.DispatchedBy), s.CancelledAt, s.CreatedAt, names.Of(s.CreatedBy), s.Version);
    }
}
