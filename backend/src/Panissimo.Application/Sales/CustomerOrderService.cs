using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Sales;

/// <param name="Quantity">In base unit.</param>
/// <param name="UnitPrice">Without VAT, informative. Empty takes the customer's item price, if any (D-06).</param>
public sealed record CustomerOrderLineRequest(Guid ItemId, decimal Quantity, decimal? UnitPrice);

/// <summary>The plant supplying the order is the active plant (D-01).</summary>
public sealed record CreateCustomerOrderRequest(
    Guid CustomerId, Guid? DeliveryPointId, DateOnly RequiredDate, string? CustomerReference, string? Notes,
    IReadOnlyList<CustomerOrderLineRequest> Lines);

/// <summary>Only drafts are edited; the customer is fixed.</summary>
public sealed record UpdateCustomerOrderRequest(
    uint Version, Guid? DeliveryPointId, DateOnly RequiredDate, string? CustomerReference, string? Notes,
    IReadOnlyList<CustomerOrderLineRequest> Lines);

public sealed record CloseCustomerOrderRequest(uint Version, string Reason);

/// <summary>Tabs of the customer orders screen (frontend: Por surtir, Borradores, Todos).</summary>
public enum CustomerOrderTab
{
    All,
    ToFulfill,
    Drafts,
}

public sealed record CustomerOrderListQuery : PageQuery
{
    public CustomerOrderTab? Tab { get; init; }
    public CustomerOrderStatus? Status { get; init; }
    public Guid? CustomerId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

/// <param name="ShippedPct">Progress: shipped / ordered across lines, 0–100.</param>
public sealed record CustomerOrderListItemDto(
    Guid Id, string Folio, Guid CustomerId, string CustomerCode, string CustomerName, string? DeliveryPointName, DateOnly RequiredDate,
    string? CustomerReference, CustomerOrderStatus Status, int LineCount, decimal ShippedPct, DateTimeOffset CreatedAt);

/// <param name="Amount">Quantity × price, rounded to cents; informative.</param>
public sealed record CustomerOrderLineDto(
    Guid Id, int LineNumber, Guid ItemId, string Sku, string ItemName, string UomCode, string? CustomerSku, decimal Quantity,
    decimal ShippedQty, decimal PendingQty, decimal? UnitPrice, decimal? Amount);

public sealed record CustomerOrderShipmentDto(Guid Id, string Folio, CustomerShipmentStatus Status, DateTimeOffset CreatedAt, DateTimeOffset? DispatchedAt);

public sealed record CustomerOrderDto(
    Guid Id, string Folio, Guid CustomerId, string CustomerCode, string CustomerName, Guid? DeliveryPointId, string? DeliveryPointName,
    string? DeliveryPointAddress, Guid SupplyingLocationId, string SupplyingLocationCode, DateOnly RequiredDate, string? CustomerReference,
    CustomerOrderStatus Status, string? Notes, IReadOnlyList<CustomerOrderLineDto> Lines, decimal EstimatedSubtotal,
    IReadOnlyList<CustomerOrderShipmentDto> Shipments, DateTimeOffset? ConfirmedAt, string? ConfirmedByName, DateTimeOffset? CancelledAt, DateTimeOffset? ClosedAt, string? ClosedByName,
    string? CloseReason, DateTimeOffset CreatedAt, string? CreatedByName, DateTimeOffset? UpdatedAt, string? UpdatedByName, uint Version);

public sealed class CustomerOrderLineRequestValidator : AbstractValidator<CustomerOrderLineRequest>
{
    public CustomerOrderLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
        RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => p is null || decimal.Round(p.Value, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
    }
}

public sealed class CreateCustomerOrderRequestValidator : AbstractValidator<CreateCustomerOrderRequest>
{
    public CreateCustomerOrderRequestValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithName("Cliente");
        RuleFor(x => x.CustomerReference).MaximumLength(CustomerOrder.ReferenceMaxLength).WithName("Referencia del cliente");
        RuleFor(x => x.Notes).MaximumLength(CustomerOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en el pedido.");
        RuleForEach(x => x.Lines).SetValidator(new CustomerOrderLineRequestValidator());
    }
}

public sealed class UpdateCustomerOrderRequestValidator : AbstractValidator<UpdateCustomerOrderRequest>
{
    public UpdateCustomerOrderRequestValidator()
    {
        RuleFor(x => x.CustomerReference).MaximumLength(CustomerOrder.ReferenceMaxLength).WithName("Referencia del cliente");
        RuleFor(x => x.Notes).MaximumLength(CustomerOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en el pedido.");
        RuleForEach(x => x.Lines).SetValidator(new CustomerOrderLineRequestValidator());
    }
}

public sealed class CloseCustomerOrderRequestValidator : AbstractValidator<CloseCustomerOrderRequest>
{
    public CloseCustomerOrderRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public interface ICustomerOrderService
{
    Task<PagedResult<CustomerOrderListItemDto>> ListAsync(CustomerOrderListQuery query, CancellationToken ct = default);
    Task<CustomerOrderDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<CustomerOrderDto> CreateAsync(CreateCustomerOrderRequest request, CancellationToken ct = default);
    Task<CustomerOrderDto> UpdateAsync(Guid id, UpdateCustomerOrderRequest request, CancellationToken ct = default);
    Task<CustomerOrderDto> ConfirmAsync(Guid id, uint version, CancellationToken ct = default);
    Task<CustomerOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);
    Task<CustomerOrderDto> CloseAsync(Guid id, CloseCustomerOrderRequest request, CancellationToken ct = default);
}

/// <summary>Customer orders (RN-80, RN-82). Supplied by the plant: every action requires it in the caller's scope.</summary>
public sealed class CustomerOrderService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : ICustomerOrderService
{
    private static readonly Dictionary<string, Expression<Func<CustomerOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["requiredDate"] = o => o.RequiredDate,
        ["createdAt"] = o => o.CreatedAt,
        ["status"] = o => o.Status,
    };

    public async Task<PagedResult<CustomerOrderListItemDto>> ListAsync(CustomerOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.CustomerOrders.AsNoTracking().Where(o => allowed.Contains(o.SupplyingLocationId));
        orders = query.Tab switch
        {
            CustomerOrderTab.ToFulfill => orders.Where(o => o.Status == CustomerOrderStatus.Confirmed || o.Status == CustomerOrderStatus.PartiallyShipped),
            CustomerOrderTab.Drafts => orders.Where(o => o.Status == CustomerOrderStatus.Draft),
            _ => orders,
        };
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.CustomerId is { } customerId)
            orders = orders.Where(o => o.CustomerId == customerId);
        if (query.From is { } from)
            orders = orders.Where(o => o.RequiredDate >= from);
        if (query.To is { } to)
            orders = orders.Where(o => o.RequiredDate <= to);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term)
                                       || (o.CustomerReference != null && o.CustomerReference.ToLower().Contains(term))
                                       || db.Customers.Any(c => c.Id == o.CustomerId && c.Name.ToLower().Contains(term)));

        var page = await orders.Include(o => o.Lines).ApplySort(query.Sort, SortColumns, "requiredDate").ToPagedResultAsync(query, ct);

        var customerIds = page.Items.Select(o => o.CustomerId).Distinct().ToList();
        var customers = await db.Customers.Where(c => customerIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct);
        var pointIds = page.Items.Select(o => o.DeliveryPointId).OfType<Guid>().Distinct().ToList();
        var points = await db.CustomerDeliveryPoints.Where(p => pointIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name, ct);

        return new PagedResult<CustomerOrderListItemDto>(page.Items.Select(o =>
        {
            var ordered = o.Lines.Sum(l => l.Quantity);
            var shipped = o.Lines.Sum(l => Math.Min(l.ShippedQty, l.Quantity));
            return new CustomerOrderListItemDto(o.Id, o.Folio, o.CustomerId, customers[o.CustomerId].Code, customers[o.CustomerId].Name,
                o.DeliveryPointId is { } p ? points.GetValueOrDefault(p) : null, o.RequiredDate, o.CustomerReference, o.Status, o.Lines.Count,
                ordered == 0 ? 0 : decimal.Round(shipped / ordered * 100, 1), o.CreatedAt);
        }).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<CustomerOrderDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var order = await db.CustomerOrders.AsNoTracking().Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("el pedido de cliente", id);
        scope.EnsureAccess(order.SupplyingLocationId);
        return await ToDtoAsync(order, ct);
    }

    public async Task<CustomerOrderDto> CreateAsync(CreateCustomerOrderRequest request, CancellationToken ct = default)
    {
        var plant = await db.Locations.AsNoTracking().Where(l => l.Type == LocationType.Plant && l.IsActive).OrderBy(l => l.Code)
                        .FirstOrDefaultAsync(ct)
                    ?? throw new BusinessRuleException("plant_not_found", "No hay una Planta activa que surta el pedido.");
        scope.EnsureAccess(plant.Id);
        var customer = await db.Customers.AsNoTracking().SingleOrDefaultAsync(c => c.Id == request.CustomerId, ct)
                       ?? throw new NotFoundException("el cliente", request.CustomerId);
        if (!customer.IsActive)
            throw new BusinessRuleException("customer_inactive", $"El cliente {customer.Name} está inactivo.");
        var plan = await ResolvePlanAsync(customer.Id, request.DeliveryPointId, request.RequiredDate, request.CustomerReference,
            request.Notes, request.Lines, ct);

        var order = new CustomerOrder(await folios.NextAsync(DocType.CustomerOrder, ct), customer.Id, plant.Id, plan, clock.BusinessDate());
        db.CustomerOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<CustomerOrderDto> UpdateAsync(Guid id, UpdateCustomerOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        var plan = await ResolvePlanAsync(order.CustomerId, request.DeliveryPointId, request.RequiredDate, request.CustomerReference,
            request.Notes, request.Lines, ct);
        order.UpdateDraft(plan, clock.BusinessDate());
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<CustomerOrderDto> ConfirmAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        var customer = await db.Customers.AsNoTracking().SingleAsync(c => c.Id == order.CustomerId, ct);
        if (!customer.IsActive)
            throw new BusinessRuleException("customer_inactive", $"El cliente {customer.Name} está inactivo.");
        return await ChangeAsync(order, version, o => o.Confirm(clock.BusinessDate(), clock.UtcNow, currentUser.UserId), ct);
    }

    public async Task<CustomerOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), version, o => o.Cancel(clock.UtcNow), ct);

    public async Task<CustomerOrderDto> CloseAsync(Guid id, CloseCustomerOrderRequest request, CancellationToken ct = default) =>
        await ChangeAsync(await FindAsync(id, ct), request.Version, o => o.Close(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    private async Task<CustomerOrderDto> ChangeAsync(CustomerOrder order, uint version, Action<CustomerOrder> change, CancellationToken ct)
    {
        db.EnsureVersion(order, version);
        change(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    /// <summary>
    /// RN-80: delivery point of the same customer and active; active finished goods only, bulk or packaged (D-05, 422 otherwise);
    /// whole quantities in pieces (RN-03b); an empty price takes the customer's item price.
    /// </summary>
    private async Task<CustomerOrderPlan> ResolvePlanAsync(Guid customerId, Guid? deliveryPointId, DateOnly requiredDate,
        string? customerReference, string? notes, IReadOnlyList<CustomerOrderLineRequest> lines, CancellationToken ct)
    {
        if (deliveryPointId is { } pointId
            && !await db.CustomerDeliveryPoints.AnyAsync(p => p.Id == pointId && p.CustomerId == customerId && p.IsActive, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
                { ["deliveryPointId"] = ["El punto de entrega no es del cliente o está inactivo."] });

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, Pieces = u.Code == UnitOfMeasure.PieceCode })
            .ToDictionaryAsync(x => x.Item.Id, ct);

        var notSellable = items.Values.Where(x => !CustomerRules.IsSellable(x.Item.Type)).Select(x => x.Item.Sku).Order().ToList();
        if (notSellable.Count > 0)
            throw new BusinessRuleException("customer_order_item_not_allowed",
                $"A los clientes se les venden solo productos terminados (granel o empaquetado): {string.Join(", ", notSellable)} (D-05).");

        var prices = await db.CustomerItems.AsNoTracking()
            .Where(r => r.CustomerId == customerId && itemIds.Contains(r.ItemId) && r.IsActive && r.Price != null)
            .ToDictionaryAsync(r => r.ItemId, r => r.Price, ct);

        var errors = new List<string>();
        foreach (var line in lines)
        {
            if (!items.TryGetValue(line.ItemId, out var entry))
                errors.Add("Uno o más artículos no existen.");
            else if (!entry.Item.IsActive)
                errors.Add($"El artículo {entry.Item.Sku} está inactivo.");
            else if (entry.Pieces && !InventoryMath.IsWhole(line.Quantity))
                errors.Add($"{entry.Item.Sku} se maneja en piezas: la cantidad debe ser entera.");
        }
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });

        return new CustomerOrderPlan(deliveryPointId, requiredDate, customerReference, notes,
            lines.Select(l => new CustomerOrderLineInput(l.ItemId, l.Quantity, l.UnitPrice ?? prices.GetValueOrDefault(l.ItemId))).ToList());
    }

    private async Task<CustomerOrder> FindAsync(Guid id, CancellationToken ct)
    {
        var order = await db.CustomerOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("el pedido de cliente", id);
        scope.EnsureAccess(order.SupplyingLocationId);
        return order;
    }

    private async Task<CustomerOrderDto> ToDtoAsync(CustomerOrder o, CancellationToken ct)
    {
        var customer = await db.Customers.AsNoTracking().SingleAsync(c => c.Id == o.CustomerId, ct);
        var point = o.DeliveryPointId is { } pointId ? await db.CustomerDeliveryPoints.AsNoTracking().SingleAsync(p => p.Id == pointId, ct) : null;
        var plantCode = await db.Locations.Where(l => l.Id == o.SupplyingLocationId).Select(l => l.Code).SingleAsync(ct);
        var itemIds = o.Lines.Select(l => l.ItemId).ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code })
            .ToDictionaryAsync(x => x.Id, ct);
        var customerSkus = await db.CustomerItems.AsNoTracking().Where(r => r.CustomerId == o.CustomerId && itemIds.Contains(r.ItemId))
            .ToDictionaryAsync(r => r.ItemId, r => r.CustomerSku, ct);
        var shipments = await db.CustomerShipments.AsNoTracking().Where(s => s.CustomerOrderId == o.Id).OrderBy(s => s.CreatedAt)
            .Select(s => new CustomerOrderShipmentDto(s.Id, s.Folio, s.Status, s.CreatedAt, s.DispatchedAt)).ToListAsync(ct);
        var names = await userDirectory.GetNamesAsync([o.CreatedBy, o.UpdatedBy, o.ConfirmedBy, o.ClosedBy], ct);

        var lines = o.Lines.OrderBy(l => l.LineNumber).Select(l => new CustomerOrderLineDto(l.Id, l.LineNumber, l.ItemId, items[l.ItemId].Sku,
            items[l.ItemId].Name, items[l.ItemId].Uom, customerSkus.GetValueOrDefault(l.ItemId), l.Quantity, l.ShippedQty, l.PendingQty,
            l.UnitPrice, l.UnitPrice is { } price ? decimal.Round(l.Quantity * price, 2, MidpointRounding.AwayFromZero) : null)).ToList();

        return new CustomerOrderDto(o.Id, o.Folio, o.CustomerId, customer.Code, customer.Name, o.DeliveryPointId, point?.Name, point?.Address,
            o.SupplyingLocationId, plantCode, o.RequiredDate, o.CustomerReference, o.Status, o.Notes, lines, lines.Sum(l => l.Amount ?? 0),
            shipments, o.ConfirmedAt, names.Of(o.ConfirmedBy), o.CancelledAt, o.ClosedAt, names.Of(o.ClosedBy), o.CloseReason, o.CreatedAt,
            names.Of(o.CreatedBy), o.UpdatedAt, names.Of(o.UpdatedBy), o.Version);
    }
}
