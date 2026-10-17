using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Logistics;

/// <param name="RequestedQty">In base unit.</param>
public sealed record BranchOrderLineRequest(Guid ItemId, decimal RequestedQty);

/// <summary>The plant supplying the order is the active plant (D-01).</summary>
public sealed record CreateBranchOrderRequest(Guid RequestingLocationId, DateOnly RequiredDate, string? Notes, IReadOnlyList<BranchOrderLineRequest> Lines);

public sealed record UpdateBranchOrderRequest(uint Version, DateOnly RequiredDate, string? Notes, IReadOnlyList<BranchOrderLineRequest> Lines);

public sealed record ApproveBranchOrderLineRequest(Guid LineId, decimal ApprovedQty);

public sealed record ApproveBranchOrderRequest(uint Version, IReadOnlyList<ApproveBranchOrderLineRequest> Lines);

public sealed record RejectBranchOrderRequest(uint Version, string Reason);

/// <summary>Tabs of the branch orders screen (frontend: Por aprobar).</summary>
public enum BranchOrderTab
{
    All,
    ToApprove,
}

public sealed record BranchOrderListQuery : PageQuery
{
    public BranchOrderTab? Tab { get; init; }
    public BranchOrderStatus? Status { get; init; }

    /// <summary>The requesting branch.</summary>
    public Guid? LocationId { get; init; }

    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public sealed record BranchOrderLocationDto(Guid Id, string Code, string Name);

public sealed record BranchOrderListItemDto(
    Guid Id, string Folio, BranchOrderLocationDto RequestingLocation, BranchOrderLocationDto SupplyingLocation, DateOnly RequiredDate,
    BranchOrderStatus Status, int LineCount, DateTimeOffset CreatedAt, string? CreatedByName);

/// <param name="SupplyingStock">Current stock at the plant, to approve with it in view (no stock is reserved).</param>
public sealed record BranchOrderLineDto(
    Guid Id, int LineNumber, Guid ItemId, string Sku, string ItemName, string UomCode, decimal RequestedQty, decimal? ApprovedQty,
    decimal ShippedQty, decimal SupplyingStock);

public sealed record BranchOrderTransferDto(Guid Id, string Folio, TransferStatus Status);

public sealed record BranchOrderDto(
    Guid Id, string Folio, BranchOrderLocationDto RequestingLocation, BranchOrderLocationDto SupplyingLocation, DateOnly RequiredDate,
    BranchOrderStatus Status, string? Notes, IReadOnlyList<BranchOrderLineDto> Lines, IReadOnlyList<BranchOrderTransferDto> Transfers,
    DateTimeOffset? SubmittedAt, string? SubmittedByName, DateTimeOffset? ApprovedAt, string? ApprovedByName, DateTimeOffset? RejectedAt,
    string? RejectedByName, string? RejectionReason, DateTimeOffset? CancelledAt, DateTimeOffset CreatedAt, string? CreatedByName,
    DateTimeOffset? UpdatedAt, string? UpdatedByName, uint Version);

/// <param name="OnOrder">Submitted (requested) plus approved not yet dispatched.</param>
/// <param name="Projected">Stock + in transit + on order (RN-20).</param>
public sealed record BranchOrderSuggestionDto(
    Guid ItemId, string Sku, string ItemName, string UomCode, decimal MinQty, decimal MaxQty, decimal Stock, decimal InTransit,
    decimal OnOrder, decimal Projected, decimal SuggestedQty);

public sealed class BranchOrderLineRequestValidator : AbstractValidator<BranchOrderLineRequest>
{
    public BranchOrderLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.RequestedQty).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
    }
}

public sealed class CreateBranchOrderRequestValidator : AbstractValidator<CreateBranchOrderRequest>
{
    public CreateBranchOrderRequestValidator()
    {
        RuleFor(x => x.RequestingLocationId).NotEmpty().WithName("Sucursal");
        RuleFor(x => x.Notes).MaximumLength(BranchOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en el pedido.");
        RuleForEach(x => x.Lines).SetValidator(new BranchOrderLineRequestValidator());
    }
}

public sealed class UpdateBranchOrderRequestValidator : AbstractValidator<UpdateBranchOrderRequest>
{
    public UpdateBranchOrderRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(BranchOrder.NotesMaxLength).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en el pedido.");
        RuleForEach(x => x.Lines).SetValidator(new BranchOrderLineRequestValidator());
    }
}

public sealed class ApproveBranchOrderRequestValidator : AbstractValidator<ApproveBranchOrderRequest>
{
    public ApproveBranchOrderRequestValidator()
    {
        RuleFor(x => x.Lines).NotEmpty().WithMessage("Indica la cantidad aprobada de cada línea.");
        RuleForEach(x => x.Lines).ChildRules(line =>
            line.RuleFor(l => l.ApprovedQty).GreaterThanOrEqualTo(0).WithName("Cantidad aprobada")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales."));
    }
}

public sealed class RejectBranchOrderRequestValidator : AbstractValidator<RejectBranchOrderRequest>
{
    public RejectBranchOrderRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public interface IBranchOrderService
{
    Task<PagedResult<BranchOrderListItemDto>> ListAsync(BranchOrderListQuery query, CancellationToken ct = default);
    Task<BranchOrderDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<BranchOrderDto> CreateAsync(CreateBranchOrderRequest request, CancellationToken ct = default);
    Task<BranchOrderDto> UpdateAsync(Guid id, UpdateBranchOrderRequest request, CancellationToken ct = default);
    Task<BranchOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default);
    Task<BranchOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-20: sets the approved quantities and creates one draft transfer with the approved lines.</summary>
    Task<BranchOrderDto> ApproveAsync(Guid id, ApproveBranchOrderRequest request, CancellationToken ct = default);
    Task<BranchOrderDto> RejectAsync(Guid id, RejectBranchOrderRequest request, CancellationToken ct = default);

    /// <summary>RN-20: items at or below their minimum at the branch, with the quantity to reach the maximum.</summary>
    Task<IReadOnlyList<BranchOrderSuggestionDto>> SuggestAsync(Guid locationId, CancellationToken ct = default);
}

public sealed class BranchOrderService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IBranchOrderService
{
    private static readonly Dictionary<string, Expression<Func<BranchOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["requiredDate"] = o => o.RequiredDate,
        ["createdAt"] = o => o.CreatedAt,
        ["status"] = o => o.Status,
    };

    /// <summary>An order is visible to whoever can see the branch or the plant.</summary>
    private IQueryable<BranchOrder> Visible()
    {
        var allowed = scope.AllowedLocationIds;
        return db.BranchOrders.AsNoTracking()
            .Where(o => allowed.Contains(o.RequestingLocationId) || allowed.Contains(o.SupplyingLocationId));
    }

    public async Task<PagedResult<BranchOrderListItemDto>> ListAsync(BranchOrderListQuery query, CancellationToken ct = default)
    {
        var orders = Visible();
        if (query.Tab == BranchOrderTab.ToApprove)
            orders = orders.Where(o => o.Status == BranchOrderStatus.Submitted);
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.LocationId is { } locationId)
            orders = orders.Where(o => o.RequestingLocationId == locationId);
        if (query.From is { } from)
            orders = orders.Where(o => o.RequiredDate >= from);
        if (query.To is { } to)
            orders = orders.Where(o => o.RequiredDate <= to);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term));

        var page = await orders.Include(o => o.Lines).ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var locations = await LocationsAsync(page.Items.SelectMany(o => new[] { o.RequestingLocationId, o.SupplyingLocationId }), ct);
        var names = await userDirectory.GetNamesAsync(page.Items.Select(o => o.CreatedBy), ct);

        return new PagedResult<BranchOrderListItemDto>(page.Items.Select(o => new BranchOrderListItemDto(o.Id, o.Folio,
                locations[o.RequestingLocationId], locations[o.SupplyingLocationId], o.RequiredDate, o.Status, o.Lines.Count, o.CreatedAt,
                names.Of(o.CreatedBy))).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<BranchOrderDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var order = await db.BranchOrders.AsNoTracking().Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("el pedido", id);
        if (!scope.AllowedLocationIds.Contains(order.RequestingLocationId) && !scope.AllowedLocationIds.Contains(order.SupplyingLocationId))
            throw new ForbiddenException(LocationScope.OutOfScopeMessage);
        return await ToDtoAsync(order, ct);
    }

    public async Task<BranchOrderDto> CreateAsync(CreateBranchOrderRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.RequestingLocationId);
        var branch = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.RequestingLocationId, ct)
                     ?? throw new NotFoundException("la ubicación", request.RequestingLocationId);
        if (branch.Type != LocationType.Branch)
            throw new BusinessRuleException("branch_order_branch_only", "Solo las sucursales hacen pedidos a la Planta (RN-20).");
        if (!branch.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {branch.Code} está inactiva.");
        var plant = await db.Locations.AsNoTracking().Where(l => l.Type == LocationType.Plant && l.IsActive).OrderBy(l => l.Code)
                        .FirstOrDefaultAsync(ct)
                    ?? throw new BusinessRuleException("plant_not_found", "No hay una Planta activa que surta el pedido.");
        var lines = await ValidateLinesAsync(request.Lines, ct);

        var order = new BranchOrder(await folios.NextAsync(DocType.BranchOrder, ct), branch.Id, plant.Id, request.RequiredDate,
            request.Notes, lines, clock.BusinessDate());
        db.BranchOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<BranchOrderDto> UpdateAsync(Guid id, UpdateBranchOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindForBranchAsync(id, ct);
        db.EnsureVersion(order, request.Version);
        var lines = await ValidateLinesAsync(request.Lines, ct);
        order.UpdateDraft(request.RequiredDate, request.Notes, lines, clock.BusinessDate());
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<BranchOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default) =>
        await ChangeAsync(await FindForBranchAsync(id, ct), version, o => o.Submit(clock.BusinessDate(), clock.UtcNow, currentUser.UserId), ct);

    public async Task<BranchOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        await ChangeAsync(await FindForBranchAsync(id, ct), version, o => o.Cancel(clock.UtcNow), ct);

    public async Task<BranchOrderDto> RejectAsync(Guid id, RejectBranchOrderRequest request, CancellationToken ct = default) =>
        await ChangeAsync(await FindForPlantAsync(id, ct), request.Version, o => o.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public async Task<BranchOrderDto> ApproveAsync(Guid id, ApproveBranchOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindForPlantAsync(id, ct);
        db.EnsureVersion(order, request.Version);

        var itemIds = order.Lines.Select(l => l.ItemId).ToList();
        var pieces = await (from i in db.Items
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where itemIds.Contains(i.Id) && u.Code == UnitOfMeasure.PieceCode
                            select new { i.Id, i.Sku })
            .ToDictionaryAsync(x => x.Id, x => x.Sku, ct);
        foreach (var approval in request.Lines)
            if (order.Lines.SingleOrDefault(l => l.Id == approval.LineId) is { } line
                && pieces.TryGetValue(line.ItemId, out var sku) && !InventoryMath.IsWhole(approval.ApprovedQty))
                throw new BusinessRuleException("whole_quantity_required", $"{sku} se maneja en piezas: la cantidad aprobada debe ser entera.");

        order.Approve(request.Lines.Select(l => new BranchOrderApproval(l.LineId, l.ApprovedQty)).ToList(), clock.UtcNow, currentUser.UserId);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Claims the order with its version first: a concurrent approval waits and then gets 409 without a second transfer.
        await db.SaveChangesAsync(ct);
        var transfer = new Transfer(await folios.NextAsync(DocType.Transfer, ct), order.SupplyingLocationId, order.RequestingLocationId,
            order.Id, $"Pedido {order.Folio}",
            order.Lines.Where(l => l.ApprovedQty > 0).Select(l => new TransferLineInput(l.ItemId, null, l.ApprovedQty!.Value)).ToList());
        db.Transfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<IReadOnlyList<BranchOrderSuggestionDto>> SuggestAsync(Guid locationId, CancellationToken ct = default)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (location.Type != LocationType.Branch)
            throw new BusinessRuleException("branch_order_branch_only", "Solo las sucursales hacen pedidos a la Planta (RN-20).");

        var settings = await (from s in db.ItemLocationSettings.AsNoTracking()
                              join i in db.Items on s.ItemId equals i.Id
                              join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                              where s.LocationId == locationId && i.IsActive
                              select new { s.ItemId, s.MinQty, s.MaxQty, i.Sku, i.Name, i.Type, i.Presentation, Uom = u.Code })
            .ToListAsync(ct);
        settings = settings.Where(s => BranchOrderRules.IsOrderable(s.Type, s.Presentation)).ToList();
        var itemIds = settings.Select(s => s.ItemId).ToList();

        var stock = await db.StockBalances.Where(b => b.LocationId == locationId && itemIds.Contains(b.ItemId))
            .GroupBy(b => b.ItemId).Select(g => new { g.Key, Qty = g.Sum(b => b.Quantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var inTransit = await (from t in db.Transfers
                               from l in t.Lines
                               where t.ToLocationId == locationId && t.Status == TransferStatus.Dispatched && itemIds.Contains(l.ItemId)
                               group l by l.ItemId into g
                               select new { g.Key, Qty = g.Sum(l => l.ShippedQty) })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var onOrder = await (from o in db.BranchOrders
                             from l in o.Lines
                             where o.RequestingLocationId == locationId && itemIds.Contains(l.ItemId)
                                   && (o.Status == BranchOrderStatus.Submitted || o.Status == BranchOrderStatus.Approved)
                             group new { o.Status, l.RequestedQty, l.ApprovedQty, l.ShippedQty } by l.ItemId into g
                             select new
                             {
                                 g.Key,
                                 Qty = g.Sum(x => x.Status == BranchOrderStatus.Submitted ? x.RequestedQty : (x.ApprovedQty ?? 0) - x.ShippedQty),
                             })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);

        var suggestions = new List<BranchOrderSuggestionDto>();
        foreach (var s in settings.OrderBy(s => s.Sku))
        {
            var (onHand, transit, ordered) = (stock.GetValueOrDefault(s.ItemId), inTransit.GetValueOrDefault(s.ItemId), onOrder.GetValueOrDefault(s.ItemId));
            var projected = onHand + transit + ordered;
            if (BranchOrderRules.Suggest(s.MinQty, s.MaxQty, projected, s.Uom == UnitOfMeasure.PieceCode) is { } qty)
                suggestions.Add(new BranchOrderSuggestionDto(s.ItemId, s.Sku, s.Name, s.Uom, s.MinQty, s.MaxQty, onHand, transit, ordered,
                    projected, qty));
        }
        return suggestions;
    }

    private async Task<BranchOrderDto> ChangeAsync(BranchOrder order, uint version, Action<BranchOrder> change, CancellationToken ct)
    {
        db.EnsureVersion(order, version);
        change(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    /// <summary>RN-20: active bulk finished goods and supplies; whole quantities in pieces (RN-03b).</summary>
    private async Task<List<BranchOrderLineInput>> ValidateLinesAsync(IReadOnlyList<BranchOrderLineRequest> lines, CancellationToken ct)
    {
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, Pieces = u.Code == UnitOfMeasure.PieceCode })
            .ToDictionaryAsync(x => x.Item.Id, ct);

        var notOrderable = items.Values.Where(x => !BranchOrderRules.IsOrderable(x.Item.Type, x.Item.Presentation))
            .Select(x => x.Item.Sku).Order().ToList();
        if (notOrderable.Count > 0)
            throw new BusinessRuleException("branch_order_item_not_allowed",
                $"Las sucursales piden productos a granel e insumos; no empaquetados ni semiterminados: {string.Join(", ", notOrderable)} (RN-20).");

        var errors = new List<string>();
        foreach (var line in lines)
        {
            if (!items.TryGetValue(line.ItemId, out var entry))
                errors.Add("Uno o más artículos no existen.");
            else if (!entry.Item.IsActive)
                errors.Add($"El artículo {entry.Item.Sku} está inactivo.");
            else if (entry.Pieces && !InventoryMath.IsWhole(line.RequestedQty))
                errors.Add($"{entry.Item.Sku} se maneja en piezas: la cantidad debe ser entera.");
        }
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });

        return lines.Select(l => new BranchOrderLineInput(l.ItemId, l.RequestedQty)).ToList();
    }

    /// <summary>Creating, editing, sending and cancelling require the branch.</summary>
    private async Task<BranchOrder> FindForBranchAsync(Guid id, CancellationToken ct)
    {
        var order = await FindAsync(id, ct);
        scope.EnsureAccess(order.RequestingLocationId);
        return order;
    }

    /// <summary>Approving and rejecting require the plant (backend §9).</summary>
    private async Task<BranchOrder> FindForPlantAsync(Guid id, CancellationToken ct)
    {
        var order = await FindAsync(id, ct);
        scope.EnsureAccess(order.SupplyingLocationId);
        return order;
    }

    private async Task<BranchOrder> FindAsync(Guid id, CancellationToken ct) =>
        await db.BranchOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct) ?? throw new NotFoundException("el pedido", id);

    private async Task<Dictionary<Guid, BranchOrderLocationDto>> LocationsAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Locations.AsNoTracking().Where(l => list.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new BranchOrderLocationDto(l.Id, l.Code, l.Name), ct);
    }

    private async Task<BranchOrderDto> ToDtoAsync(BranchOrder o, CancellationToken ct)
    {
        var locations = await LocationsAsync([o.RequestingLocationId, o.SupplyingLocationId], ct);
        var itemIds = o.Lines.Select(l => l.ItemId).ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code })
            .ToDictionaryAsync(x => x.Id, ct);
        var stock = await db.StockBalances.Where(b => b.LocationId == o.SupplyingLocationId && itemIds.Contains(b.ItemId))
            .GroupBy(b => b.ItemId).Select(g => new { g.Key, Qty = g.Sum(b => b.Quantity) })
            .ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var transfers = await db.Transfers.AsNoTracking().Where(t => t.BranchOrderId == o.Id).OrderBy(t => t.CreatedAt)
            .Select(t => new BranchOrderTransferDto(t.Id, t.Folio, t.Status)).ToListAsync(ct);
        var names = await userDirectory.GetNamesAsync([o.CreatedBy, o.UpdatedBy, o.SubmittedBy, o.ApprovedBy, o.RejectedBy], ct);

        var lines = o.Lines.OrderBy(l => l.LineNumber).Select(l => new BranchOrderLineDto(l.Id, l.LineNumber, l.ItemId, items[l.ItemId].Sku,
            items[l.ItemId].Name, items[l.ItemId].Uom, l.RequestedQty, l.ApprovedQty, l.ShippedQty, stock.GetValueOrDefault(l.ItemId))).ToList();

        return new BranchOrderDto(o.Id, o.Folio, locations[o.RequestingLocationId], locations[o.SupplyingLocationId], o.RequiredDate, o.Status,
            o.Notes, lines, transfers, o.SubmittedAt, names.Of(o.SubmittedBy), o.ApprovedAt, names.Of(o.ApprovedBy), o.RejectedAt,
            names.Of(o.RejectedBy), o.RejectionReason, o.CancelledAt, o.CreatedAt, names.Of(o.CreatedBy), o.UpdatedAt, names.Of(o.UpdatedBy),
            o.Version);
    }
}

/// <summary>
/// RN-20/RN-24 hooks of a transfer created by approving a branch order. Called by <see cref="TransferService"/> inside
/// its transaction; a transfer without order passes through.
/// </summary>
public sealed class BranchOrderTransferLinks(IAppDbContext db, IClock clock) : ITransferLinks
{
    public async Task EnsureEditAllowedAsync(Transfer transfer, Guid toLocationId, IReadOnlyList<TransferLineRequest> lines, CancellationToken ct)
    {
        if (await OrderOfAsync(transfer, ct) is not { } order)
            return;
        if (toLocationId != transfer.ToLocationId)
            throw new BusinessRuleException("branch_order_transfer_destination",
                $"El traspaso surte el pedido {order.Folio}: no puedes cambiar su destino.");

        var approved = order.Lines.Where(l => l.ApprovedQty > 0).ToDictionary(l => l.ItemId, l => l.ApprovedQty!.Value);
        foreach (var group in lines.GroupBy(l => l.ItemId))
        {
            if (!approved.TryGetValue(group.Key, out var max))
                throw new BusinessRuleException("transfer_item_not_in_order",
                    $"El traspaso surte el pedido {order.Folio}: no agregues artículos que no se aprobaron.");
            if (group.Sum(l => l.Quantity) > max)
                throw new BusinessRuleException("transfer_over_approved",
                    $"El traspaso surte el pedido {order.Folio}: no puedes enviar más de lo aprobado ({max:0.####}).");
        }
    }

    public async Task OnCancelledAsync(Transfer transfer, CancellationToken ct)
    {
        if (await OrderOfAsync(transfer, ct) is { } order)
            order.CancelWithTransfer(clock.UtcNow);
    }

    public async Task OnDispatchedAsync(Transfer transfer, CancellationToken ct)
    {
        if (await OrderOfAsync(transfer, ct) is { } order)
            order.RegisterShipment(transfer.ShippedByItem());
    }

    private async Task<BranchOrder?> OrderOfAsync(Transfer transfer, CancellationToken ct) =>
        transfer.BranchOrderId is { } id ? await db.BranchOrders.Include(o => o.Lines).SingleAsync(o => o.Id == id, ct) : null;
}
