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

    /// <summary>RN-34: approved requisitions → draft purchase orders grouped by supplier + delivery. All or nothing.</summary>
    Task<ConvertRequisitionsResult> ConvertAsync(ConvertRequisitionsRequest request, CancellationToken ct = default);
}

public sealed class RequisitionService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory) : IRequisitionService
{
    private static readonly Dictionary<string, Expression<Func<PurchaseRequisition, object?>>> SortColumns = new()
    {
        ["folio"] = r => r.Folio,
        ["neededBy"] = r => r.NeededBy,
        ["createdAt"] = r => r.CreatedAt,
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
        if (query.From is { } from)
            requisitions = requisitions.Where(r => r.NeededBy >= from);
        if (query.To is { } to)
            requisitions = requisitions.Where(r => r.NeededBy <= to);
        if (query.SearchTerm() is { } term)
            requisitions = requisitions.Where(r => r.Folio.ToLower().Contains(term));

        var page = await requisitions.Include(r => r.Lines)
            .ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);

        var locations = await LocationsAsync(page.Items.Select(r => r.LocationId), ct);
        var prices = await PricesAsync(page.Items.SelectMany(r => r.Lines), ct);
        var names = await userDirectory.GetNamesAsync(page.Items.Select(r => r.CreatedBy), ct);

        return new PagedResult<RequisitionListItemDto>(
            page.Items.Select(r => new RequisitionListItemDto(r.Id, r.Folio, r.LocationId, locations[r.LocationId].Code,
                locations[r.LocationId].Name, r.NeededBy, r.Status, r.Lines.Count, EstimatedSubtotal(r.Lines, prices),
                r.CreatedAt, names.Of(r.CreatedBy))).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<RequisitionDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var requisition = await db.PurchaseRequisitions.AsNoTracking().Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct)
                          ?? throw new NotFoundException("la requisición", id);
        scope.EnsureAccess(requisition.LocationId);
        return await ToDtoAsync(requisition, ct);
    }

    public async Task<RequisitionDto> CreateAsync(CreateRequisitionRequest request, CancellationToken ct = default)
    {
        await EnsurePlantAsync(request.LocationId, ct);
        var lines = await ResolveLinesAsync(request.Lines, ct);

        var requisition = new PurchaseRequisition(await folios.NextAsync(DocType.Requisition, ct), request.LocationId,
            request.NeededBy, request.Notes, lines, clock.BusinessDate());
        db.PurchaseRequisitions.Add(requisition);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    public async Task<RequisitionDto> UpdateAsync(Guid id, UpdateRequisitionRequest request, CancellationToken ct = default)
    {
        var requisition = await FindAsync(id, ct);
        db.EnsureVersion(requisition, request.Version);
        var lines = await ResolveLinesAsync(request.Lines, ct);

        requisition.UpdateDraft(request.NeededBy, request.Notes, lines, clock.BusinessDate());
        db.Entry(requisition).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    public Task<RequisitionDto> SubmitAsync(Guid id, uint version, CancellationToken ct = default) =>
        ChangeAsync(id, version, r => r.Submit(clock.BusinessDate(), clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> ApproveAsync(Guid id, uint version, CancellationToken ct = default) =>
        ChangeAsync(id, version, r => r.Approve(clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> RejectAsync(Guid id, RejectRequisitionRequest request, CancellationToken ct = default) =>
        ChangeAsync(id, request.Version, r => r.Reject(request.Reason, clock.UtcNow, currentUser.UserId), ct);

    public Task<RequisitionDto> CancelAsync(Guid id, uint version, CancellationToken ct = default) =>
        ChangeAsync(id, version, r => r.Cancel(), ct);

    public async Task<ConvertRequisitionsResult> ConvertAsync(ConvertRequisitionsRequest request, CancellationToken ct = default)
    {
        var requisitions = await db.PurchaseRequisitions.Include(r => r.Lines)
            .Where(r => request.RequisitionIds.Contains(r.Id)).ToListAsync(ct);
        foreach (var id in request.RequisitionIds.Where(id => requisitions.All(r => r.Id != id)))
            throw new NotFoundException("la requisición", id);
        foreach (var requisition in requisitions)
            scope.EnsureAccess(requisition.LocationId);

        var notApproved = requisitions.Where(r => r.Status != RequisitionStatus.Approved).Select(r => r.Folio).Order().ToList();
        if (notApproved.Count > 0)
            throw new BusinessRuleException("requisition_not_approved",
                $"Solo las requisiciones aprobadas se convierten en OC: {string.Join(", ", notApproved)}.");

        var (prices, taxRates) = await ConversionCatalogAsync(requisitions, ct);
        var drafts = RequisitionConversion.Group(requisitions, prices, taxRates);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Claim first: a concurrent conversion of the same requisition waits on the row and then fails its version (409).
        var now = clock.UtcNow;
        foreach (var requisition in requisitions.OrderBy(r => r.Id))
            requisition.MarkConverted(now);
        await db.SaveChangesAsync(ct);

        var numbers = await folios.NextManyAsync(DocType.PurchaseOrder, drafts.Count, ct);
        var orders = drafts.Select((d, i) => new PurchaseOrder(numbers[i], d.SupplierId, d.DeliveryLocationId, d.ExpectedDate,
            OriginNotes(d.RequisitionFolios), d.Lines)).ToList();
        db.PurchaseOrders.AddRange(orders);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        var supplierIds = orders.Select(o => o.SupplierId).Distinct().ToList();
        var supplierNames = await db.Suppliers.Where(s => supplierIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        return new ConvertRequisitionsResult(orders.Zip(drafts, (o, d) => new ConvertedPurchaseOrderDto(o.Id, o.Folio, o.SupplierId,
            supplierNames[o.SupplierId], o.DeliveryLocationId, o.ExpectedDate, o.Lines.Count, o.Subtotal, o.TaxTotal, o.Total,
            d.RequisitionFolios)).ToList());
    }

    /// <summary>
    /// Catalog prices and VAT for the conversion. Suppliers, their catalog rows and the items may have changed since
    /// approval, so every line is checked again and any problem stops the whole conversion.
    /// </summary>
    private async Task<(Dictionary<(Guid, Guid), decimal> Prices, Dictionary<Guid, decimal> TaxRates)> ConversionCatalogAsync(
        IReadOnlyList<PurchaseRequisition> requisitions, CancellationToken ct)
    {
        var lines = requisitions.SelectMany(r => r.Lines.Select(l => (r.Folio, Line: l))).ToList();
        var supplierIds = lines.Select(x => x.Line.SuggestedSupplierId).OfType<Guid>().Distinct().ToList();
        var itemIds = lines.Select(x => x.Line.ItemId).Distinct().ToList();

        var suppliers = await db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var offers = await db.SupplierItems.AsNoTracking()
            .Where(o => supplierIds.Contains(o.SupplierId) && itemIds.Contains(o.ItemId) && o.IsActive)
            .ToDictionaryAsync(o => (o.SupplierId, o.ItemId), o => o.Price, ct);

        var errors = new List<string>();
        foreach (var (folio, line) in lines)
        {
            var item = items[line.ItemId];
            if (line.SuggestedSupplierId is not { } supplierId)
                errors.Add($"{folio}: {item.Sku} no tiene proveedor.");
            else if (!suppliers[supplierId].IsActive)
                errors.Add($"{folio}: el proveedor {suppliers[supplierId].Name} está inactivo.");
            else if (!offers.ContainsKey((supplierId, item.Id)))
                errors.Add($"{folio}: {suppliers[supplierId].Name} ya no vende {item.Sku}.");
            else if (!item.IsActive)
                errors.Add($"{folio}: el artículo {item.Sku} está inactivo.");
        }
        if (errors.Count > 0)
            throw new BusinessRuleException("requisition_conversion_invalid",
                "No se convirtió ninguna requisición. " + string.Join(" ", errors.Distinct()));

        return (offers, items.ToDictionary(i => i.Key, i => i.Value.TaxRate));
    }

    private static string OriginNotes(IReadOnlyList<string> requisitionFolios)
    {
        var notes = "Generada desde " + string.Join(", ", requisitionFolios) + ".";
        return notes.Length <= PurchaseOrder.NotesMaxLength ? notes : notes[..(PurchaseOrder.NotesMaxLength - 1)] + "…";
    }

    private async Task<RequisitionDto> ChangeAsync(Guid id, uint version, Action<PurchaseRequisition> change, CancellationToken ct)
    {
        var requisition = await FindAsync(id, ct);
        db.EnsureVersion(requisition, version);
        change(requisition);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(requisition, ct);
    }

    /// <summary>
    /// RN-34: active raw materials and supplies; whole quantities when the unit is pieces (RN-03b); a line without
    /// supplier takes the preferred one; a supplier given must be active and sell the item.
    /// </summary>
    private async Task<List<RequisitionLineInput>> ResolveLinesAsync(IReadOnlyList<RequisitionLineRequest> lines, CancellationToken ct)
    {
        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, u.Code })
            .ToDictionaryAsync(x => x.Item.Id, ct);

        var givenSupplierIds = lines.Select(l => l.SuggestedSupplierId).OfType<Guid>().Distinct().ToList();
        var activeOffers = await (from o in db.SupplierItems.AsNoTracking()
                                  join s in db.Suppliers on o.SupplierId equals s.Id
                                  where itemIds.Contains(o.ItemId) && o.IsActive && s.IsActive
                                        && (o.IsPreferred || givenSupplierIds.Contains(o.SupplierId))
                                  select new { o.SupplierId, o.ItemId, o.IsPreferred })
            .ToListAsync(ct);

        var errors = new List<string>();
        var resolved = new List<RequisitionLineInput>();
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
            else if (!SupplierRules.IsPurchasable(entry.Item.Type))
                errors.Add($"{sku} no se compra: solo las materias primas y los insumos.");
            else if (entry.Code == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(line.Quantity))
                errors.Add($"{sku} se compra en piezas: la cantidad debe ser entera.");

            var supplierId = line.SuggestedSupplierId;
            if (supplierId is { } given)
            {
                if (!activeOffers.Any(o => o.SupplierId == given && o.ItemId == line.ItemId))
                    errors.Add($"El proveedor indicado para {sku} está inactivo o no vende el artículo.");
            }
            else
            {
                supplierId = activeOffers.FirstOrDefault(o => o.ItemId == line.ItemId && o.IsPreferred)?.SupplierId;
            }
            resolved.Add(new RequisitionLineInput(line.ItemId, line.Quantity, supplierId, line.Notes));
        }

        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });
        return resolved;
    }

    /// <summary>RN-34: requisitions only at the plant, in the caller's scope.</summary>
    private Task EnsurePlantAsync(Guid locationId, CancellationToken ct) =>
        PurchasingLocations.EnsurePlantAsync(db, scope, locationId, "requisition_plant_only",
            "Las requisiciones solo se hacen en la Planta (RN-34).", ct);

    private async Task<PurchaseRequisition> FindAsync(Guid id, CancellationToken ct)
    {
        var requisition = await db.PurchaseRequisitions.Include(r => r.Lines).SingleOrDefaultAsync(r => r.Id == id, ct)
                          ?? throw new NotFoundException("la requisición", id);
        scope.EnsureAccess(requisition.LocationId);
        return requisition;
    }

    /// <summary>Current catalog price per (supplier, item) of the lines' suggested suppliers.</summary>
    private async Task<Dictionary<(Guid SupplierId, Guid ItemId), decimal>> PricesAsync(
        IEnumerable<PurchaseRequisitionLine> lines, CancellationToken ct)
    {
        var list = lines.Where(l => l.SuggestedSupplierId is not null).ToList();
        var supplierIds = list.Select(l => l.SuggestedSupplierId!.Value).Distinct().ToList();
        var itemIds = list.Select(l => l.ItemId).Distinct().ToList();
        return await db.SupplierItems.AsNoTracking()
            .Where(o => supplierIds.Contains(o.SupplierId) && itemIds.Contains(o.ItemId))
            .ToDictionaryAsync(o => (o.SupplierId, o.ItemId), o => o.Price, ct);
    }

    private static decimal? EstimatedAmount(PurchaseRequisitionLine line, IReadOnlyDictionary<(Guid, Guid), decimal> prices) =>
        line.SuggestedSupplierId is { } s && prices.TryGetValue((s, line.ItemId), out var price)
            ? PurchaseOrderMath.LineSubtotal(line.Quantity, price)
            : null;

    private static decimal EstimatedSubtotal(IEnumerable<PurchaseRequisitionLine> lines, IReadOnlyDictionary<(Guid, Guid), decimal> prices) =>
        lines.Sum(l => EstimatedAmount(l, prices) ?? 0m);

    private async Task<Dictionary<Guid, Location>> LocationsAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Locations.AsNoTracking().Where(l => list.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);
    }

    private async Task<RequisitionDto> ToDtoAsync(PurchaseRequisition r, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().SingleAsync(l => l.Id == r.LocationId, ct);
        var itemIds = r.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, u.Code })
            .ToDictionaryAsync(x => x.Id, ct);
        var supplierIds = r.Lines.Select(l => l.SuggestedSupplierId).OfType<Guid>().Distinct().ToList();
        var suppliers = await db.Suppliers.AsNoTracking().Where(s => supplierIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name, ct);
        var prices = await PricesAsync(r.Lines, ct);
        var lineIds = r.Lines.Select(l => (Guid?)l.Id).ToList();
        var orders = await (from o in db.PurchaseOrders.AsNoTracking()
                            from pl in o.Lines
                            where lineIds.Contains(pl.RequisitionLineId)
                            select new { pl.RequisitionLineId, o.Id, o.Folio })
            .ToDictionaryAsync(x => x.RequisitionLineId!.Value, ct);
        var names = await userDirectory.GetNamesAsync([r.CreatedBy, r.UpdatedBy, r.SubmittedBy, r.ApprovedBy, r.RejectedBy], ct);

        var lines = r.Lines.OrderBy(l => l.LineNumber).Select(l =>
        {
            var item = items[l.ItemId];
            var order = orders.GetValueOrDefault(l.Id);
            decimal? price = l.SuggestedSupplierId is { } s && prices.TryGetValue((s, l.ItemId), out var p) ? p : null;
            return new RequisitionLineDto(l.Id, l.LineNumber, l.ItemId, item.Sku, item.Name, item.Code, l.Quantity, l.Notes,
                l.SuggestedSupplierId, l.SuggestedSupplierId is { } sid ? suppliers.GetValueOrDefault(sid) : null,
                price, EstimatedAmount(l, prices), order?.Id, order?.Folio);
        }).ToList();

        return new RequisitionDto(r.Id, r.Folio, r.LocationId, location.Code, location.Name, r.NeededBy, r.Status, r.Notes, lines,
            EstimatedSubtotal(r.Lines, prices), r.SubmittedAt, names.Of(r.SubmittedBy), r.ApprovedAt, names.Of(r.ApprovedBy),
            r.RejectedAt, names.Of(r.RejectedBy), r.RejectionReason, r.ConvertedAt, r.CreatedAt, names.Of(r.CreatedBy),
            r.UpdatedAt, names.Of(r.UpdatedBy), r.Version);
    }
}
