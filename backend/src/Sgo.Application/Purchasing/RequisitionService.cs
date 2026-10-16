using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Purchasing;

namespace Sgo.Application.Purchasing;

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="SuggestedSupplierId">Optional: empty takes the item's preferred supplier.</param>
public sealed record RequisitionLineRequest(Guid ItemId, decimal Quantity, Guid? SuggestedSupplierId);

public sealed record CreateRequisitionRequest(Guid LocationId, DateOnly NeededBy, string? Notes, IReadOnlyList<RequisitionLineRequest> Lines);

public sealed record UpdateRequisitionRequest(uint Version, DateOnly NeededBy, string? Notes, IReadOnlyList<RequisitionLineRequest> Lines);

public sealed record RejectRequisitionRequest(uint Version, string Reason);

public sealed record ConvertRequisitionsRequest(IReadOnlyList<Guid> RequisitionIds);

public sealed record RequisitionListQuery : PageQuery
{
    public RequisitionStatus? Status { get; init; }
    public Guid? LocationId { get; init; }
}

public sealed record RequisitionListItemDto(
    Guid Id, string Folio, PurchasingLocationDto Location, DateOnly NeededBy, RequisitionStatus Status, int LineCount, DateTimeOffset CreatedAt);

public sealed record RequisitionSupplierDto(Guid Id, string Name);

/// <param name="PurchaseUomCode">Unit of Quantity: the item's purchase unit, or its base unit.</param>
/// <param name="EstimatedPrice">Current price of the suggested supplier per purchase unit, without VAT.</param>
public sealed record RequisitionLineDto(
    Guid Id, Guid ItemId, string Sku, string ItemName, string PurchaseUomCode, decimal Quantity,
    RequisitionSupplierDto? SuggestedSupplier, decimal? EstimatedPrice);

public sealed record RequisitionPurchaseOrderDto(Guid Id, string Folio);

public sealed record RequisitionDto(
    Guid Id, string Folio, PurchasingLocationDto Location, DateOnly NeededBy, RequisitionStatus Status, string? Notes,
    IReadOnlyList<RequisitionLineDto> Lines, DateTimeOffset? SubmittedAt, Guid? SubmittedBy, string? SubmittedByName,
    DateTimeOffset? ApprovedAt, Guid? ApprovedBy, string? ApprovedByName, DateTimeOffset? RejectedAt, Guid? RejectedBy,
    string? RejectedByName, string? RejectionReason, DateTimeOffset? ConvertedAt, Guid? ConvertedBy, string? ConvertedByName,
    IReadOnlyList<RequisitionPurchaseOrderDto> PurchaseOrders, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName,
    uint Version);

public sealed class RequisitionLineRequestValidator : AbstractValidator<RequisitionLineRequest>
{
    public RequisitionLineRequestValidator()
    {
        RuleFor(l => l.ItemId).NotEmpty().WithName("Artículo");
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
    }
}

public sealed class CreateRequisitionRequestValidator : AbstractValidator<CreateRequisitionRequest>
{
    public CreateRequisitionRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en la requisición.");
        RuleForEach(x => x.Lines).SetValidator(new RequisitionLineRequestValidator());
    }
}

public sealed class UpdateRequisitionRequestValidator : AbstractValidator<UpdateRequisitionRequest>
{
    public UpdateRequisitionRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.")
            .Must(l => l.Select(x => x.ItemId).Distinct().Count() == l.Count).WithMessage("Hay artículos repetidos en la requisición.");
        RuleForEach(x => x.Lines).SetValidator(new RequisitionLineRequestValidator());
    }
}

public sealed class RejectRequisitionRequestValidator : AbstractValidator<RejectRequisitionRequest>
{
    public RejectRequisitionRequestValidator() => RuleFor(x => x.Reason).NotEmpty().MaximumLength(500).WithName("Motivo");
}

public sealed class ConvertRequisitionsRequestValidator : AbstractValidator<ConvertRequisitionsRequest>
{
    public const int MaxRequisitions = 50;

    public ConvertRequisitionsRequestValidator() =>
        RuleFor(x => x.RequisitionIds).Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Selecciona al menos una requisición.")
            .Must(ids => ids.Count <= MaxRequisitions).WithMessage($"Convierte máximo {MaxRequisitions} requisiciones a la vez.")
            .Must(ids => ids.Distinct().Count() == ids.Count).WithMessage("Hay requisiciones repetidas.");
}

public interface IRequisitionService
{
    Task<PagedResult<RequisitionListItemDto>> ListAsync(RequisitionListQuery query, CancellationToken ct = default);
    Task<RequisitionDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<RequisitionDto> CreateAsync(CreateRequisitionRequest request, CancellationToken ct = default);
    Task<RequisitionDto> UpdateAsync(Guid id, UpdateRequisitionRequest request, CancellationToken ct = default);
    Task<RequisitionDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default);
    Task<RequisitionDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default);
    Task<RequisitionDto> RejectAsync(Guid id, RejectRequisitionRequest request, CancellationToken ct = default);
    Task<RequisitionDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-34: one draft PO per suggested supplier and delivery location. All or nothing.</summary>
    Task<IReadOnlyList<PurchaseOrderListItemDto>> ConvertAsync(ConvertRequisitionsRequest request, CancellationToken ct = default);
}

public sealed class RequisitionService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IRequisitionService
{
    private static readonly Dictionary<string, Expression<Func<PurchaseRequisition, object?>>> SortColumns = new()
    {
        ["folio"] = r => r.Folio,
        ["createdAt"] = r => r.CreatedAt,
        ["neededBy"] = r => r.NeededBy,
        ["status"] = r => r.Status,
    };

    public async Task<PagedResult<RequisitionListItemDto>> ListAsync(RequisitionListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var requisitions = db.PurchaseRequisitions.AsNoTracking().Where(r => allowed.Contains(r.LocationId));
        if (query.Status is { } status)
            requisitions = requisitions.Where(r => r.Status == status);
        if (query.LocationId is { } locationId)
            requisitions = requisitions.Where(r => r.LocationId == locationId);
        if (query.SearchTerm() is { } term)
            requisitions = requisitions.Where(r => r.Folio.ToLower().Contains(term));

        var page = await requisitions.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(r => r.Id).ToList();
        var lineCounts = await db.PurchaseRequisitions.Where(r => ids.Contains(r.Id)).Select(r => new { r.Id, Count = r.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var locations = await PurchaseOrderService.LocationsAsync(db, page.Items.Select(r => r.LocationId), ct);
        var items = page.Items.Select(r => new RequisitionListItemDto(r.Id, r.Folio, locations[r.LocationId], r.NeededBy, r.Status,
            lineCounts[r.Id], r.CreatedAt)).ToList();
        return new PagedResult<RequisitionListItemDto>(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<RequisitionDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<RequisitionDto> CreateAsync(CreateRequisitionRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.LocationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.LocationId, ct)
                       ?? throw new NotFoundException("la ubicación", request.LocationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        if (!location.CanPurchase)
            throw new BusinessRuleException("requisition_location_cannot_purchase",
                "Solo la fábrica y el comisariato hacen requisiciones de compra; las sucursales piden al comisariato.");
        EnsureNotPast(request.NeededBy);

        var lines = await ResolveLinesAsync(request.Lines, ct);
        var requisition = new PurchaseRequisition(await folios.NextAsync(DocType.Requisition, ct), location.Id, request.NeededBy,
            request.Notes, lines);
        db.PurchaseRequisitions.Add(requisition);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    public async Task<RequisitionDto> UpdateAsync(Guid id, UpdateRequisitionRequest request, CancellationToken ct = default)
    {
        var requisition = await FindAsync(id, ct);
        db.EnsureVersion(requisition, request.Version);
        EnsureNotPast(request.NeededBy);

        requisition.UpdateDraft(request.NeededBy, request.Notes, await ResolveLinesAsync(request.Lines, ct));
        db.Entry(requisition).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    public Task<RequisitionDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, r => r.Submit(clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, r => r.Approve(clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> RejectAsync(Guid id, RejectRequisitionRequest request, CancellationToken ct = default) =>
        TransitionAsync(id, request.Version, r => r.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        TransitionAsync(id, version, r => r.Cancel(), ct);

    public async Task<IReadOnlyList<PurchaseOrderListItemDto>> ConvertAsync(ConvertRequisitionsRequest request, CancellationToken ct = default)
    {
        var ids = request.RequisitionIds.Distinct().ToList();
        var requisitions = await db.PurchaseRequisitions.Include(r => r.Lines).Where(r => ids.Contains(r.Id)).ToListAsync(ct);
        var missing = ids.Except(requisitions.Select(r => r.Id)).FirstOrDefault();
        if (missing != Guid.Empty)
            throw new NotFoundException("la requisición", missing);
        foreach (var requisition in requisitions)
            scope.EnsureAccess(requisition.LocationId);
        requisitions = [.. requisitions.OrderBy(r => r.Folio)];

        var lines = requisitions.SelectMany(r => r.Lines).ToList();
        var supplierIds = lines.Select(l => l.SuggestedSupplierId).OfType<Guid>().Distinct().ToList();
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();

        var inactiveSupplier = await db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id) && !s.IsActive)
            .Select(s => s.Name).FirstOrDefaultAsync(ct);
        if (inactiveSupplier is not null)
            throw new BusinessRuleException("supplier_inactive",
                $"El proveedor {inactiveSupplier} está inactivo; reactívalo o cancela la requisición y captúrala con otro proveedor.");
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        if (items.Values.FirstOrDefault(i => !i.IsActive) is { } inactiveItem)
            throw new BusinessRuleException("item_inactive", $"El artículo {inactiveItem.Sku} está inactivo.");

        // Supplier rows are never deleted, so the price exists even if the row was later deactivated (RN-30: editable in the PO).
        var prices = await db.SupplierItems.AsNoTracking()
            .Where(si => supplierIds.Contains(si.SupplierId) && itemIds.Contains(si.ItemId))
            .ToDictionaryAsync(si => (si.SupplierId, si.ItemId), si => si.Price, ct);
        var plans = RequisitionConversion.Plan(requisitions,
            (supplierId, itemId) => prices.GetValueOrDefault((supplierId, itemId)), itemId => items[itemId].TaxRate);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Claim every requisition first: a concurrent conversion waits on these row locks and then fails the version check (409).
        foreach (var requisition in requisitions)
            db.Entry(requisition).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);

        var now = clock.UtcNow;
        foreach (var requisition in requisitions)
            requisition.MarkConverted(now, currentUser.UserId);

        var orders = new List<PurchaseOrder>();
        foreach (var plan in plans)
        {
            var order = new PurchaseOrder(await folios.NextAsync(DocType.PurchaseOrder, ct), plan.SupplierId, plan.DeliveryLocationId,
                plan.ExpectedDate, $"Generada desde {string.Join(", ", plan.RequisitionFolios)}", plan.Lines);
            db.PurchaseOrders.Add(order);
            orders.Add(order);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await PurchaseOrderService.ToListItemsAsync(db, orders, ct);
    }

    private async Task<RequisitionDto> TransitionAsync(Guid id, uint version, Action<PurchaseRequisition> transition, CancellationToken ct)
    {
        var requisition = await FindAsync(id, ct);
        db.EnsureVersion(requisition, version);
        transition(requisition);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    private void EnsureNotPast(DateOnly neededBy)
    {
        if (neededBy < clock.BusinessDate())
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["neededBy"] = ["La fecha requerida no puede ser anterior a hoy."],
            });
    }

    /// <summary>
    /// Items must be active. A given supplier must be active and sell the item (active row); an empty one takes the
    /// item's preferred supplier, or stays empty (then the requisition cannot be submitted).
    /// </summary>
    private async Task<List<RequisitionLineInput>> ResolveLinesAsync(IReadOnlyList<RequisitionLineRequest> lines, CancellationToken ct)
    {
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var offers = await (from si in db.SupplierItems.AsNoTracking()
                            join s in db.Suppliers on si.SupplierId equals s.Id
                            where itemIds.Contains(si.ItemId) && si.IsActive && s.IsActive
                            select new { si.SupplierId, si.ItemId, si.IsPreferred, SupplierName = s.Name }).ToListAsync(ct);

        var errors = new List<string>();
        var result = new List<RequisitionLineInput>();
        foreach (var line in lines)
        {
            if (!items.TryGetValue(line.ItemId, out var item))
            {
                errors.Add("Uno o más artículos no existen.");
                continue;
            }
            if (!item.IsActive)
            {
                errors.Add($"El artículo {item.Sku} está inactivo.");
                continue;
            }

            var supplierId = line.SuggestedSupplierId;
            if (supplierId is { } given)
            {
                if (!offers.Any(o => o.ItemId == item.Id && o.SupplierId == given))
                    errors.Add($"El proveedor indicado para {item.Sku} no existe, está inactivo o no tiene el artículo en su catálogo.");
            }
            else
            {
                supplierId = offers.FirstOrDefault(o => o.ItemId == item.Id && o.IsPreferred)?.SupplierId;
            }
            result.Add(new RequisitionLineInput(item.Id, line.Quantity, supplierId));
        }

        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });
        return result;
    }

    private async Task<PurchaseRequisition> FindAsync(Guid id, CancellationToken ct)
    {
        var requisition = await db.PurchaseRequisitions.Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct)
                          ?? throw new NotFoundException("la requisición", id);
        scope.EnsureAccess(requisition.LocationId);
        return requisition;
    }

    private async Task<RequisitionDto> ToDtoAsync(PurchaseRequisition r, CancellationToken ct)
    {
        var locations = await PurchaseOrderService.LocationsAsync(db, [r.LocationId], ct);
        var itemIds = r.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var supplierIds = r.Lines.Select(l => l.SuggestedSupplierId).OfType<Guid>().Distinct().ToList();
        var suppliers = await db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id))
            .ToDictionaryAsync(s => s.Id, s => new RequisitionSupplierDto(s.Id, s.Name), ct);
        var prices = await db.SupplierItems.AsNoTracking()
            .Where(si => supplierIds.Contains(si.SupplierId) && itemIds.Contains(si.ItemId))
            .ToDictionaryAsync(si => (si.SupplierId, si.ItemId), si => si.Price, ct);
        var lineIds = r.Lines.Select(l => l.Id).ToList();
        var orders = await db.PurchaseOrders.AsNoTracking()
            .Where(o => o.Lines.Any(l => l.RequisitionLineId != null && lineIds.Contains(l.RequisitionLineId.Value)))
            .OrderBy(o => o.Folio).Select(o => new RequisitionPurchaseOrderDto(o.Id, o.Folio)).ToListAsync(ct);

        var lines = r.Lines.Select(l => new RequisitionLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, items[l.ItemId].Uom,
                l.Quantity,
                l.SuggestedSupplierId is { } s ? suppliers[s] : null,
                l.SuggestedSupplierId is { } p && prices.TryGetValue((p, l.ItemId), out var price) ? price : null))
            .OrderBy(l => l.Sku).ToList();
        var users = await userDirectory.GetNamesAsync([r.SubmittedBy, r.ApprovedBy, r.RejectedBy, r.ConvertedBy, r.CreatedBy], ct);

        return new RequisitionDto(r.Id, r.Folio, locations[r.LocationId], r.NeededBy, r.Status, r.Notes, lines, r.SubmittedAt, r.SubmittedBy,
            users.Of(r.SubmittedBy), r.ApprovedAt, r.ApprovedBy, users.Of(r.ApprovedBy), r.RejectedAt, r.RejectedBy, users.Of(r.RejectedBy),
            r.RejectionReason, r.ConvertedAt, r.ConvertedBy, users.Of(r.ConvertedBy), orders,
            r.CreatedAt, r.CreatedBy, users.Of(r.CreatedBy), r.Version);
    }
}
