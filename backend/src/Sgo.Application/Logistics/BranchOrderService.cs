using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Logistics;
using Sgo.Domain.Organization;

namespace Sgo.Application.Logistics;

/// <param name="RequestedQty">In the item's base unit.</param>
public sealed record BranchOrderLineRequest(Guid ItemId, decimal RequestedQty);

public sealed record CreateBranchOrderRequest(
    Guid RequestingLocationId, Guid SupplyingLocationId, DateOnly RequiredDate, string? Notes, IReadOnlyList<BranchOrderLineRequest> Lines);

public sealed record UpdateBranchOrderRequest(
    uint Version, Guid SupplyingLocationId, DateOnly RequiredDate, string? Notes, IReadOnlyList<BranchOrderLineRequest> Lines);

public sealed record ApproveLineRequest(Guid LineId, decimal ApprovedQty);

public sealed record ApproveBranchOrderRequest(uint Version, IReadOnlyList<ApproveLineRequest> Lines);

public sealed record RejectBranchOrderRequest(uint Version, string Reason);

public sealed record BranchOrderListQuery : PageQuery
{
    public BranchOrderStatus? Status { get; init; }
    public Guid? RequestingLocationId { get; init; }
    public Guid? SupplyingLocationId { get; init; }

    /// <summary>Either requesting or supplying.</summary>
    public Guid? LocationId { get; init; }
}

public sealed record BranchOrderListItemDto(
    Guid Id, string Folio, TransferLocationDto RequestingLocation, TransferLocationDto SupplyingLocation, DateOnly RequiredDate,
    BranchOrderStatus Status, int LineCount, DateTimeOffset CreatedAt);

/// <param name="OnHandAtOrigin">Current stock at the supplying location, to decide the approved quantity.</param>
public sealed record BranchOrderLineDto(
    Guid Id, Guid ItemId, string Sku, string ItemName, string BaseUomCode, decimal RequestedQty, decimal? ApprovedQty, decimal ShippedQty,
    decimal OnHandAtOrigin);

public sealed record BranchOrderTransferDto(Guid Id, string Folio, TransferStatus Status);

public sealed record BranchOrderDto(
    Guid Id, string Folio, TransferLocationDto RequestingLocation, TransferLocationDto SupplyingLocation, DateOnly RequiredDate,
    BranchOrderStatus Status, string? Notes, IReadOnlyList<BranchOrderLineDto> Lines, IReadOnlyList<BranchOrderTransferDto> Transfers,
    DateTimeOffset? SubmittedAt, Guid? SubmittedBy, string? SubmittedByName, DateTimeOffset? ApprovedAt, Guid? ApprovedBy,
    string? ApprovedByName, DateTimeOffset? RejectedAt, Guid? RejectedBy, string? RejectedByName, string? RejectionReason,
    DateTimeOffset? FulfilledAt, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version);

/// <param name="Pending">Submitted orders, and approved ones whose transfer has not been dispatched.</param>
public sealed record BranchOrderSuggestionDto(
    Guid ItemId, string Sku, string ItemName, string BaseUomCode, decimal MinQty, decimal MaxQty, decimal OnHand, decimal InTransit,
    decimal Pending, decimal SuggestedQty);

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
        RuleFor(x => x.SupplyingLocationId).NotEqual(x => x.RequestingLocationId).WithMessage("La sucursal no puede pedirse a sí misma.");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en el pedido.");
        RuleForEach(x => x.Lines).SetValidator(new BranchOrderLineRequestValidator());
    }
}

public sealed class UpdateBranchOrderRequestValidator : AbstractValidator<UpdateBranchOrderRequest>
{
    public UpdateBranchOrderRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
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
    Task<IReadOnlyList<BranchOrderSuggestionDto>> SuggestAsync(Guid locationId, CancellationToken ct = default);
    Task<BranchOrderDto> CreateAsync(CreateBranchOrderRequest request, CancellationToken ct = default);
    Task<BranchOrderDto> UpdateAsync(Guid id, UpdateBranchOrderRequest request, CancellationToken ct = default);
    Task<BranchOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default);
    Task<BranchOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-20: approves and creates the order's draft transfer, in one transaction.</summary>
    Task<BranchOrderDto> ApproveAsync(Guid id, ApproveBranchOrderRequest request, CancellationToken ct = default);

    Task<BranchOrderDto> RejectAsync(Guid id, RejectBranchOrderRequest request, CancellationToken ct = default);
}

public sealed class BranchOrderService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IBranchOrderService
{
    private static readonly Dictionary<string, Expression<Func<BranchOrder, object?>>> SortColumns = new()
    {
        ["folio"] = o => o.Folio,
        ["createdAt"] = o => o.CreatedAt,
        ["requiredDate"] = o => o.RequiredDate,
        ["status"] = o => o.Status,
    };

    /// <summary>An order is visible to whoever can see the branch or the supplying location.</summary>
    public async Task<PagedResult<BranchOrderListItemDto>> ListAsync(BranchOrderListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var orders = db.BranchOrders.AsNoTracking()
            .Where(o => allowed.Contains(o.RequestingLocationId) || allowed.Contains(o.SupplyingLocationId));
        if (query.Status is { } status)
            orders = orders.Where(o => o.Status == status);
        if (query.RequestingLocationId is { } requesting)
            orders = orders.Where(o => o.RequestingLocationId == requesting);
        if (query.SupplyingLocationId is { } supplying)
            orders = orders.Where(o => o.SupplyingLocationId == supplying);
        if (query.LocationId is { } either)
            orders = orders.Where(o => o.RequestingLocationId == either || o.SupplyingLocationId == either);
        if (query.SearchTerm() is { } term)
            orders = orders.Where(o => o.Folio.ToLower().Contains(term));

        var page = await orders.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(o => o.Id).ToList();
        var lineCounts = await db.BranchOrders.Where(o => ids.Contains(o.Id)).Select(o => new { o.Id, Count = o.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var locations = await LocationsAsync(page.Items.SelectMany(o => new[] { o.RequestingLocationId, o.SupplyingLocationId }), ct);
        var items = page.Items.Select(o => new BranchOrderListItemDto(o.Id, o.Folio, locations[o.RequestingLocationId],
            locations[o.SupplyingLocationId], o.RequiredDate, o.Status, lineCounts[o.Id], o.CreatedAt)).ToList();
        return new PagedResult<BranchOrderListItemDto>(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<BranchOrderDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var order = await db.BranchOrders.AsNoTracking().Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
                    ?? throw new NotFoundException("el pedido", id);
        if (!scope.AllowedLocationIds.Contains(order.RequestingLocationId) && !scope.AllowedLocationIds.Contains(order.SupplyingLocationId))
            throw new ForbiddenException(LocationScope.OutOfScopeMessage);
        return await ToDtoAsync(order, ct);
    }

    public async Task<IReadOnlyList<BranchOrderSuggestionDto>> SuggestAsync(Guid locationId, CancellationToken ct = default)
    {
        scope.EnsureAccess(locationId);
        var settings = await (from s in db.ItemLocationSettings.AsNoTracking()
                              join i in db.Items on s.ItemId equals i.Id
                              join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                              where s.LocationId == locationId && i.IsActive
                              select new { s.ItemId, i.Sku, i.Name, Uom = u.Code, s.MinQty, s.MaxQty }).ToListAsync(ct);
        var itemIds = settings.Select(s => s.ItemId).ToList();

        var onHand = await db.StockBalances.AsNoTracking()
            .Where(b => b.LocationId == locationId && itemIds.Contains(b.ItemId))
            .GroupBy(b => b.ItemId).Select(g => new { g.Key, Qty = g.Sum(b => b.Quantity) }).ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var inTransit = await db.Transfers.AsNoTracking()
            .Where(t => t.ToLocationId == locationId && t.Status == TransferStatus.Dispatched)
            .SelectMany(t => t.Lines).Where(l => itemIds.Contains(l.ItemId))
            .GroupBy(l => l.ItemId).Select(g => new { g.Key, Qty = g.Sum(l => l.ShippedQty) }).ToDictionaryAsync(x => x.Key, x => x.Qty, ct);

        // Submitted orders count what was requested; approved ones what was approved, until their transfer is dispatched
        // (from then on it is in transit).
        var submitted = db.BranchOrders.Where(o => o.RequestingLocationId == locationId && o.Status == BranchOrderStatus.Submitted)
            .SelectMany(o => o.Lines).Select(l => new { l.ItemId, Qty = l.RequestedQty });
        var approved = db.BranchOrders
            .Where(o => o.RequestingLocationId == locationId && o.Status == BranchOrderStatus.Approved
                        && !db.Transfers.Any(t => t.BranchOrderId == o.Id && t.Status != TransferStatus.Draft))
            .SelectMany(o => o.Lines).Select(l => new { l.ItemId, Qty = l.ApprovedQty ?? 0 });
        var pending = (await submitted.Concat(approved).Where(x => itemIds.Contains(x.ItemId)).ToListAsync(ct))
            .GroupBy(x => x.ItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Qty));

        return settings
            .Select(s =>
            {
                var (stock, transit, orders) = (onHand.GetValueOrDefault(s.ItemId), inTransit.GetValueOrDefault(s.ItemId),
                    pending.GetValueOrDefault(s.ItemId));
                var suggested = BranchOrderSuggestion.Calculate(s.MinQty, s.MaxQty, stock, transit, orders);
                return suggested is null ? null
                    : new BranchOrderSuggestionDto(s.ItemId, s.Sku, s.Name, s.Uom, s.MinQty, s.MaxQty, stock, transit, orders, suggested.Value);
            })
            .OfType<BranchOrderSuggestionDto>()
            .OrderBy(s => s.Sku)
            .ToList();
    }

    public async Task<BranchOrderDto> CreateAsync(CreateBranchOrderRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.RequestingLocationId);
        var requesting = await ActiveLocationAsync(request.RequestingLocationId, ct);
        if (requesting.Type != LocationType.Branch)
            throw new BusinessRuleException("branch_order_requires_branch", "Solo las sucursales hacen pedidos.");
        await EnsureSupplierAsync(request.SupplyingLocationId, ct);
        EnsureNotPast(request.RequiredDate);
        await EnsureItemsAsync(request.Lines, ct);

        var order = new BranchOrder(await folios.NextAsync(DocType.BranchOrder, ct), requesting.Id, request.SupplyingLocationId,
            request.RequiredDate, request.Notes, ToInputs(request.Lines));
        db.BranchOrders.Add(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public async Task<BranchOrderDto> UpdateAsync(Guid id, UpdateBranchOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        scope.EnsureAccess(order.RequestingLocationId);
        db.EnsureVersion(order, request.Version);
        await EnsureSupplierAsync(request.SupplyingLocationId, ct);
        EnsureNotPast(request.RequiredDate);
        await EnsureItemsAsync(request.Lines, ct);

        order.UpdateDraft(request.SupplyingLocationId, request.RequiredDate, request.Notes, ToInputs(request.Lines));
        db.Entry(order).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    public Task<BranchOrderDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, requesting: true, o => o.Submit(clock.UtcNow, currentUser.UserId), ct);

    public Task<BranchOrderDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, requesting: true, o => o.Cancel(), ct);

    public Task<BranchOrderDto> RejectAsync(Guid id, RejectBranchOrderRequest request, CancellationToken ct = default) =>
        TransitionAsync(id, request.Version, requesting: false, o => o.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public async Task<BranchOrderDto> ApproveAsync(Guid id, ApproveBranchOrderRequest request, CancellationToken ct = default)
    {
        var order = await FindAsync(id, ct);
        scope.EnsureAccess(order.SupplyingLocationId); // the origin approves
        db.EnsureVersion(order, request.Version);
        await ActiveLocationAsync(order.SupplyingLocationId, ct);
        await ActiveLocationAsync(order.RequestingLocationId, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var lines = order.Approve(request.Lines.Select(l => new LineApproval(l.LineId, l.ApprovedQty)).ToList(), clock.UtcNow, currentUser.UserId);
        var transfer = new Transfer(await folios.NextAsync(DocType.Transfer, ct), order.SupplyingLocationId, order.RequestingLocationId,
            order.Id, $"Pedido {order.Folio}", lines);
        db.Transfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    private async Task<BranchOrderDto> TransitionAsync(Guid id, uint version, bool requesting, Action<BranchOrder> transition, CancellationToken ct)
    {
        var order = await FindAsync(id, ct);
        scope.EnsureAccess(requesting ? order.RequestingLocationId : order.SupplyingLocationId);
        db.EnsureVersion(order, version);
        transition(order);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(order, ct);
    }

    private async Task<Location> ActiveLocationAsync(Guid locationId, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        return location;
    }

    private async Task EnsureSupplierAsync(Guid locationId, CancellationToken ct)
    {
        if (!(await ActiveLocationAsync(locationId, ct)).CanSupplyBranches)
            throw new BusinessRuleException("branch_order_invalid_supplier", "Los pedidos se surten desde la fábrica o el comisariato.");
    }

    private void EnsureNotPast(DateOnly requiredDate)
    {
        if (requiredDate < clock.BusinessDate())
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["requiredDate"] = ["La fecha requerida no puede ser anterior a hoy."],
            });
    }

    private async Task EnsureItemsAsync(IReadOnlyList<BranchOrderLineRequest> lines, CancellationToken ct)
    {
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToListAsync(ct);
        var errors = new List<string>();
        if (items.Count != itemIds.Count)
            errors.Add("Uno o más artículos no existen.");
        errors.AddRange(items.Where(i => !i.IsActive).Select(i => $"El artículo {i.Sku} está inactivo."));
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors] });
    }

    private static List<BranchOrderLineInput> ToInputs(IEnumerable<BranchOrderLineRequest> lines) =>
        lines.Select(l => new BranchOrderLineInput(l.ItemId, l.RequestedQty)).ToList();

    private async Task<BranchOrder> FindAsync(Guid id, CancellationToken ct) =>
        await db.BranchOrders.Include(o => o.Lines).SingleOrDefaultAsync(o => o.Id == id, ct)
        ?? throw new NotFoundException("el pedido", id);

    private async Task<Dictionary<Guid, TransferLocationDto>> LocationsAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Locations.AsNoTracking().Where(l => list.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new TransferLocationDto(l.Id, l.Code, l.Name), ct);
    }

    private async Task<BranchOrderDto> ToDtoAsync(BranchOrder o, CancellationToken ct)
    {
        var locations = await LocationsAsync([o.RequestingLocationId, o.SupplyingLocationId], ct);
        var itemIds = o.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var atOrigin = await db.StockBalances.AsNoTracking()
            .Where(b => b.LocationId == o.SupplyingLocationId && itemIds.Contains(b.ItemId))
            .GroupBy(b => b.ItemId).Select(g => new { g.Key, Qty = g.Sum(b => b.Quantity) }).ToDictionaryAsync(x => x.Key, x => x.Qty, ct);
        var transfers = await db.Transfers.AsNoTracking().Where(t => t.BranchOrderId == o.Id).OrderBy(t => t.Folio)
            .Select(t => new BranchOrderTransferDto(t.Id, t.Folio, t.Status)).ToListAsync(ct);

        var lines = o.Lines.Select(l => new BranchOrderLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, items[l.ItemId].Uom,
                l.RequestedQty, l.ApprovedQty, l.ShippedQty, atOrigin.GetValueOrDefault(l.ItemId)))
            .OrderBy(l => l.Sku).ToList();
        var users = await userDirectory.GetNamesAsync([o.SubmittedBy, o.ApprovedBy, o.RejectedBy, o.CreatedBy], ct);

        return new BranchOrderDto(o.Id, o.Folio, locations[o.RequestingLocationId], locations[o.SupplyingLocationId], o.RequiredDate, o.Status,
            o.Notes, lines, transfers, o.SubmittedAt, o.SubmittedBy, users.Of(o.SubmittedBy), o.ApprovedAt, o.ApprovedBy,
            users.Of(o.ApprovedBy), o.RejectedAt, o.RejectedBy, users.Of(o.RejectedBy), o.RejectionReason, o.FulfilledAt, o.CreatedAt,
            o.CreatedBy, users.Of(o.CreatedBy), o.Version);
    }
}
