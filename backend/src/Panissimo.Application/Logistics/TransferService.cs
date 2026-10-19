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
using Panissimo.Domain.Security;

namespace Panissimo.Application.Logistics;

public sealed record TransferLineRequest(Guid ItemId, Guid? LotId, decimal Quantity);

public sealed record CreateTransferRequest(Guid FromLocationId, Guid ToLocationId, string? Notes, IReadOnlyList<TransferLineRequest> Lines);

/// <summary>RN-47: a voucher between two sub-warehouses of the same plant or branch.</summary>
public sealed record CreateInternalTransferRequest(Guid FromWarehouseId, Guid ToWarehouseId, string? Notes, IReadOnlyList<TransferLineRequest> Lines);

/// <summary>Sending a voucher: no vehicle or driver. <paramref name="Lines"/> as in a transfer dispatch.</summary>
public sealed record DispatchInternalTransferRequest(uint Version, IReadOnlyList<DispatchLineRequest>? Lines);

public sealed record UpdateTransferRequest(uint Version, Guid ToLocationId, string? Notes, IReadOnlyList<TransferLineRequest> Lines);

/// <param name="WarehouseId">Sub-warehouse this line leaves; empty takes the dispatch's (RN-45).</param>
public sealed record DispatchLineRequest(Guid LineId, IReadOnlyList<LotQuantity> Lots, Guid? WarehouseId = null);

/// <param name="Lines">Optional: lots chosen per line. Lines not listed use their planned lot or FEFO.</param>
/// <param name="FromWarehouseId">Sub-warehouse of the origin every line leaves (RN-45); required when the origin has sub-warehouses.</param>
public sealed record DispatchTransferRequest(uint Version, string VehicleDescription, string DriverName, IReadOnlyList<DispatchLineRequest>? Lines,
    Guid? FromWarehouseId = null);

/// <param name="WarehouseId">Sub-warehouse this line enters; empty takes the receipt's (RN-45).</param>
public sealed record ReceiveLineRequest(Guid LineId, decimal ReceivedQty, DiscrepancyReason? DiscrepancyReason, string? DiscrepancyNotes,
    Guid? WarehouseId = null);

/// <param name="ToWarehouseId">Sub-warehouse of the destination every line enters (RN-45); required when the destination has sub-warehouses.</param>
public sealed record ReceiveTransferRequest(uint Version, IReadOnlyList<ReceiveLineRequest> Lines, Guid? ToWarehouseId = null);

/// <summary>Tabs of the transfers screen (frontend §7.5).</summary>
public enum TransferTab
{
    ToDispatch,
    InTransit,
    Received,
    All,
}

public sealed record TransferListQuery : PageQuery
{
    /// <summary>Set by the endpoint: transfers and internal vouchers are listed apart.</summary>
    public TransferKind Kind { get; init; }

    public TransferTab? Tab { get; init; }
    public TransferStatus? Status { get; init; }

    /// <summary>true: received with or without discrepancies (same as <c>tab=Received</c>).</summary>
    public bool? Received { get; init; }

    public Guid? FromLocationId { get; init; }
    public Guid? ToLocationId { get; init; }

    /// <summary>Either origin or destination.</summary>
    public Guid? LocationId { get; init; }

    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record TransferLocationDto(Guid Id, string Code, string Name, LocationType Type);

public sealed record TransferListItemDto(
    Guid Id, string Folio, TransferKind Kind, TransferLocationDto From, TransferLocationDto To, TransferStatus Status, Guid? BranchOrderId,
    int LineCount, DateTimeOffset CreatedAt, DateTimeOffset? DispatchedAt, DateTimeOffset? ReceivedAt);

/// <param name="ShortQty">Loss in transit (RN-22).</param>
/// <param name="FromStockLocationCode">Sub-warehouse it left (or the origin), once dispatched.</param>
/// <param name="ToStockLocationCode">Sub-warehouse it entered (or the destination), once received.</param>
public sealed record TransferLineDto(
    Guid Id, string? FromStockLocationCode, string? ToStockLocationCode, Guid ItemId, string Sku, string ItemName, string BaseUomCode, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate,
    decimal ShippedQty, decimal? ReceivedQty, decimal ShortQty, decimal? UnitCost, decimal? ShortValue,
    DiscrepancyReason? DiscrepancyReason, string? DiscrepancyNotes);

public sealed record TransferDto(
    Guid Id, string Folio, TransferKind Kind, TransferLocationDto From, TransferLocationDto To, Guid? BranchOrderId,
    TransferStatus Status, string? Notes,
    string? VehicleDescription, string? DriverName, DateTimeOffset? DispatchedAt, Guid? DispatchedBy, string? DispatchedByName,
    DateTimeOffset? ReceivedAt, Guid? ReceivedBy, string? ReceivedByName, IReadOnlyList<TransferLineDto> Lines,
    decimal ShippedValue, decimal TransitLossValue, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version,
    Guid? ProductionOrderId = null, string? ProductionOrderFolio = null);

public sealed class TransferLineRequestValidator : AbstractValidator<TransferLineRequest>
{
    public TransferLineRequestValidator() =>
        RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
            .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
}

public sealed class CreateTransferRequestValidator : AbstractValidator<CreateTransferRequest>
{
    public CreateTransferRequestValidator()
    {
        RuleFor(x => x.ToLocationId).NotEqual(x => x.FromLocationId).WithMessage("El origen y el destino deben ser distintos.");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).SetValidator(new TransferLineRequestValidator());
    }
}

public sealed class CreateInternalTransferRequestValidator : AbstractValidator<CreateInternalTransferRequest>
{
    public CreateInternalTransferRequestValidator()
    {
        RuleFor(x => x.ToWarehouseId).NotEqual(x => x.FromWarehouseId).WithMessage("El subalmacén origen y el destino deben ser distintos.");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).SetValidator(new TransferLineRequestValidator());
    }
}

public sealed class UpdateTransferRequestValidator : AbstractValidator<UpdateTransferRequest>
{
    public UpdateTransferRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).SetValidator(new TransferLineRequestValidator());
    }
}

public sealed class DispatchTransferRequestValidator : AbstractValidator<DispatchTransferRequest>
{
    public DispatchTransferRequestValidator()
    {
        RuleFor(x => x.VehicleDescription).NotEmpty().MaximumLength(150).WithName("Vehículo");
        RuleFor(x => x.DriverName).NotEmpty().MaximumLength(150).WithName("Chofer");
    }
}

public sealed class ReceiveTransferRequestValidator : AbstractValidator<ReceiveTransferRequest>
{
    public ReceiveTransferRequestValidator()
    {
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Captura lo recibido de cada línea.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.ReceivedQty).GreaterThanOrEqualTo(0).WithName("Cantidad recibida");
            line.RuleFor(l => l.DiscrepancyNotes).MaximumLength(500).WithName("Notas de la diferencia");
        });
    }
}

/// <summary>
/// Transfers between the plant and the branches and, with <see cref="TransferKind.Internal"/>, vouchers between
/// sub-warehouses (RN-47). Each endpoint works on its own kind: a voucher is not found through the transfers endpoints.
/// </summary>
public interface ITransferService
{
    Task<PagedResult<TransferListItemDto>> ListAsync(TransferListQuery query, CancellationToken ct = default);
    Task<TransferDto> GetAsync(Guid id, TransferKind kind = TransferKind.Standard, CancellationToken ct = default);
    Task<TransferDto> CreateAsync(CreateTransferRequest request, CancellationToken ct = default);

    /// <summary>RN-47: a draft voucher between two sub-warehouses of the same location; requires the origin.</summary>
    Task<TransferDto> CreateInternalAsync(CreateInternalTransferRequest request, CancellationToken ct = default);

    Task<TransferDto> UpdateAsync(Guid id, UpdateTransferRequest request, TransferKind kind = TransferKind.Standard, CancellationToken ct = default);
    Task<TransferDto> CancelAsync(Guid id, uint version, TransferKind kind = TransferKind.Standard, CancellationToken ct = default);

    /// <summary>RN-21: posts TransferOut at the origin. A concurrent dispatch of the same transfer gets 409.</summary>
    Task<TransferDto> DispatchAsync(Guid id, DispatchTransferRequest request, TransferKind kind = TransferKind.Standard, CancellationToken ct = default);

    /// <summary>RN-22: posts TransferIn at the destination with the origin's lots and cost.</summary>
    Task<TransferDto> ReceiveAsync(Guid id, ReceiveTransferRequest request, TransferKind kind = TransferKind.Standard, CancellationToken ct = default);
}

/// <summary>
/// Hooks for documents linked to a transfer (the branch order, <see cref="BranchOrderTransferLinks"/>). The transfer
/// service calls them inside its transaction; without a link they do nothing.
/// </summary>
public interface ITransferLinks
{
    /// <summary>Checks a draft edit of a linked transfer (destination and approved quantities).</summary>
    Task EnsureEditAllowedAsync(Transfer transfer, Guid toLocationId, IReadOnlyList<TransferLineRequest> lines, CancellationToken ct);

    Task OnCancelledAsync(Transfer transfer, CancellationToken ct);

    Task OnDispatchedAsync(Transfer transfer, CancellationToken ct);
}

public sealed class TransferService(
    IAppDbContext db,
    ILocationScope scope,
    UserAccessContext access,
    IFolioGenerator folios,
    IClock clock,
    ICurrentUser currentUser,
    IUserDirectory userDirectory,
    IInventoryPostingService posting,
    ITransferLinks links) : ITransferService
{
    public const string SpecialRouteMessage =
        "Esta ruta (entre sucursales o devolución a la Planta) requiere el permiso de traspasos especiales.";

    private static readonly Dictionary<string, Expression<Func<Transfer, object?>>> SortColumns = new()
    {
        ["folio"] = t => t.Folio,
        ["createdAt"] = t => t.CreatedAt,
        ["dispatchedAt"] = t => t.DispatchedAt,
        ["status"] = t => t.Status,
    };

    /// <summary>A transfer is visible to whoever can see its origin or its destination.</summary>
    private IQueryable<Transfer> Visible()
    {
        var allowed = scope.AllowedLocationIds;
        return db.Transfers.AsNoTracking().Where(t => allowed.Contains(t.FromLocationId) || allowed.Contains(t.ToLocationId));
    }

    public async Task<PagedResult<TransferListItemDto>> ListAsync(TransferListQuery query, CancellationToken ct = default)
    {
        var transfers = Visible().Where(t => t.Kind == query.Kind);
        transfers = query.Tab switch
        {
            TransferTab.ToDispatch => transfers.Where(t => t.Status == TransferStatus.Draft),
            TransferTab.InTransit => transfers.Where(t => t.Status == TransferStatus.Dispatched),
            TransferTab.Received => transfers.Where(t => t.Status == TransferStatus.Received || t.Status == TransferStatus.ReceivedWithDiscrepancies),
            _ => transfers,
        };
        if (query.Status is { } status)
            transfers = transfers.Where(t => t.Status == status);
        if (query.Received is true)
            transfers = transfers.Where(t => t.Status == TransferStatus.Received || t.Status == TransferStatus.ReceivedWithDiscrepancies);
        if (query.FromLocationId is { } from)
            transfers = transfers.Where(t => t.FromLocationId == from);
        if (query.ToLocationId is { } to)
            transfers = transfers.Where(t => t.ToLocationId == to);
        if (query.LocationId is { } either)
        {
            // RN-46: a plant or branch also covers its sub-warehouses (the ends of an internal voucher).
            var ids = await InventoryLocations.WithWarehousesAsync(db, either, ct);
            transfers = transfers.Where(t => ids.Contains(t.FromLocationId) || ids.Contains(t.ToLocationId));
        }
        if (query.From is { } fromDate)
            transfers = transfers.Where(t => t.CreatedAt >= fromDate);
        if (query.To is { } toDate)
            transfers = transfers.Where(t => t.CreatedAt <= toDate);
        if (query.SearchTerm() is { } term)
            transfers = transfers.Where(t => t.Folio.ToLower().Contains(term));

        var page = await transfers.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var items = await ToListItemsAsync(page.Items, ct);
        return new PagedResult<TransferListItemDto>(items, page.Page, page.PageSize, page.Total);
    }

    public async Task<TransferDto> GetAsync(Guid id, TransferKind kind = TransferKind.Standard, CancellationToken ct = default)
    {
        var transfer = await db.Transfers.AsNoTracking().Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id && t.Kind == kind, ct)
                       ?? throw new NotFoundException(Noun(kind), id);
        if (!scope.AllowedLocationIds.Contains(transfer.FromLocationId) && !scope.AllowedLocationIds.Contains(transfer.ToLocationId))
            throw new ForbiddenException(LocationScope.OutOfScopeMessage);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> CreateAsync(CreateTransferRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.FromLocationId);
        await ValidatePlanAsync(request.FromLocationId, request.ToLocationId, request.Lines, ct);

        var transfer = new Transfer(await folios.NextAsync(DocType.Transfer, ct), request.FromLocationId, request.ToLocationId,
            null, request.Notes, ToInputs(request.Lines));
        db.Transfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> CreateInternalAsync(CreateInternalTransferRequest request, CancellationToken ct = default)
    {
        scope.EnsureStockAccess(request.FromWarehouseId);
        await ValidateInternalPlanAsync(request.FromWarehouseId, request.ToWarehouseId, request.Lines, ct);

        var transfer = new Transfer(await folios.NextAsync(DocType.InternalTransfer, ct), request.FromWarehouseId, request.ToWarehouseId,
            null, request.Notes, ToInputs(request.Lines), TransferKind.Internal);
        db.Transfers.Add(transfer);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> UpdateAsync(Guid id, UpdateTransferRequest request, TransferKind kind = TransferKind.Standard,
        CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, kind, ct);
        db.EnsureVersion(transfer, request.Version);
        if (kind == TransferKind.Internal)
            await ValidateInternalPlanAsync(transfer.FromLocationId, request.ToLocationId, request.Lines, ct);
        else
            await ValidatePlanAsync(transfer.FromLocationId, request.ToLocationId, request.Lines, ct);
        await links.EnsureEditAllowedAsync(transfer, request.ToLocationId, request.Lines, ct);

        transfer.UpdateDraft(request.ToLocationId, request.Notes, ToInputs(request.Lines));
        db.Entry(transfer).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> CancelAsync(Guid id, uint version, TransferKind kind = TransferKind.Standard, CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, kind, ct);
        db.EnsureVersion(transfer, version);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        transfer.Cancel();
        await ReleaseReservationsAsync(transfer, ct);
        await links.OnCancelledAsync(transfer, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> DispatchAsync(Guid id, DispatchTransferRequest request, TransferKind kind = TransferKind.Standard,
        CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, kind, ct);
        db.EnsureVersion(transfer, request.Version);
        await EnsureActiveAsync(transfer.ToLocationId, ct);

        var chosen = (request.Lines ?? []).Where(l => l.Lots.Count > 0).ToDictionary(l => l.LineId, l => l.Lots);
        // RN-45: the origin's sub-warehouse per line (a voucher's origin is already a sub-warehouse).
        var picker = await WarehousePicker.LoadAsync(db, scope, transfer.FromLocationId, ct);
        var lineWarehouses = (request.Lines ?? []).ToDictionary(l => l.LineId, l => l.WarehouseId);
        var sources = transfer.Lines.ToDictionary(l => l.Id, l => picker.Resolve(request.FromWarehouseId, lineWarehouses.GetValueOrDefault(l.Id)));
        var requests = transfer.DispatchRequests(chosen, lineId => sources[lineId]);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ClaimAsync(transfer, ct);
        // RN-110: an ingredients voucher takes out what it reserved; the reservation goes before the exit is checked.
        await ReleaseReservationsAsync(transfer, ct);
        var movements = await posting.PostAsync(requests, ct);
        transfer.Dispatch(request.VehicleDescription, request.DriverName, clock.UtcNow, currentUser.UserId, movements);
        await links.OnDispatchedAsync(transfer, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> ReceiveAsync(Guid id, ReceiveTransferRequest request, TransferKind kind = TransferKind.Standard,
        CancellationToken ct = default)
    {
        var transfer = await db.Transfers.Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id && t.Kind == kind, ct)
                       ?? throw new NotFoundException(Noun(kind), id);
        // Receiving requires the destination; a voucher, the destination sub-warehouse (RN-47).
        if (kind == TransferKind.Internal)
            scope.EnsureStockAccess(transfer.ToLocationId);
        else
            scope.EnsureAccess(transfer.ToLocationId);
        db.EnsureVersion(transfer, request.Version);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ClaimAsync(transfer, ct);
        var receipts = request.Lines.Select(l => new ReceiptInput(l.LineId, l.ReceivedQty, l.DiscrepancyReason, l.DiscrepancyNotes)).ToList();
        // RN-45: the destination's sub-warehouse per line.
        var picker = await WarehousePicker.LoadAsync(db, scope, transfer.ToLocationId, ct);
        var targets = request.Lines.ToDictionary(l => l.LineId, l => picker.Resolve(request.ToWarehouseId, l.WarehouseId));
        var requests = transfer.Receive(receipts, clock.UtcNow, currentUser.UserId, lineId => targets[lineId]);
        await posting.PostAsync(requests, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    /// <summary>
    /// First write of the transaction: updates the transfer row checking its version. A concurrent operation on the
    /// same transfer waits for this row lock and then fails the version check (409), rolling back its movements.
    /// </summary>
    private async Task ClaimAsync(Transfer transfer, CancellationToken ct)
    {
        db.Entry(transfer).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
    }

    private async Task<Transfer> FindForOriginAsync(Guid id, TransferKind kind, CancellationToken ct)
    {
        var transfer = await db.Transfers.Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id && t.Kind == kind, ct)
                       ?? throw new NotFoundException(Noun(kind), id);
        // Planning and dispatching require the origin; a voucher, the origin sub-warehouse (RN-47).
        if (kind == TransferKind.Internal)
            scope.EnsureStockAccess(transfer.FromLocationId);
        else
            scope.EnsureAccess(transfer.FromLocationId);
        return transfer;
    }

    private static string Noun(TransferKind kind) => kind == TransferKind.Internal ? "el vale interno" : "el traspaso";

    /// <summary>RN-110: dispatching or cancelling an ingredients voucher frees what it held.</summary>
    private async Task ReleaseReservationsAsync(Transfer transfer, CancellationToken ct)
    {
        if (transfer.ProductionOrderId is not null)
            db.StockReservations.RemoveRange(await db.StockReservations.Where(r => r.TransferId == transfer.Id).ToListAsync(ct));
    }

    /// <summary>
    /// RN-47: two different active sub-warehouses of the same plant or branch; active items, whole pieces and lots of
    /// the item, like any transfer.
    /// </summary>
    private async Task ValidateInternalPlanAsync(Guid fromId, Guid toId, IReadOnlyList<TransferLineRequest> lines, CancellationToken ct)
    {
        var from = await EnsureActiveAsync(fromId, ct);
        var to = await EnsureActiveAsync(toId, ct);
        if (!from.IsWarehouse || !to.IsWarehouse || from.ParentLocationId != to.ParentLocationId)
            throw new BusinessRuleException("internal_transfer_route",
                "Un vale interno va entre dos subalmacenes de la misma planta o sucursal (RN-47).");
        if (from.Id == to.Id)
            throw new BusinessRuleException("transfer_same_location", "El origen y el destino deben ser distintos.");
        await ValidateLinesAsync(lines, ct);
    }

    private async Task ValidatePlanAsync(Guid fromId, Guid toId, IReadOnlyList<TransferLineRequest> lines, CancellationToken ct)
    {
        var from = await EnsureActiveAsync(fromId, ct);
        var to = await EnsureActiveAsync(toId, ct);
        if (from.IsWarehouse || to.IsWarehouse)
            throw new BusinessRuleException("transfer_warehouse_not_allowed",
                "Un traspaso va entre la Planta y las sucursales; entre subalmacenes se usa un vale interno.");
        if (!TransferRoutes.IsStandard(from.Type, to.Type) && access.Access?.Has(Permissions.LogisticsTransfersSpecial) != true)
            throw new ForbiddenException(SpecialRouteMessage);
        await ValidateLinesAsync(lines, ct);
    }

    private async Task ValidateLinesAsync(IReadOnlyList<TransferLineRequest> lines, CancellationToken ct)
    {

        var itemIds = lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { Item = i, Pieces = u.Code == UnitOfMeasure.PieceCode })
            .ToDictionaryAsync(x => x.Item.Id, ct);
        var errors = new List<string>();
        foreach (var line in lines)
        {
            if (!items.TryGetValue(line.ItemId, out var entry))
                errors.Add("Uno o más artículos no existen.");
            else if (!entry.Item.IsActive)
                errors.Add($"El artículo {entry.Item.Sku} está inactivo.");
            else if (line.LotId is not null && !entry.Item.TracksLots)
                errors.Add($"El artículo {entry.Item.Sku} no maneja lotes.");
            else if (entry.Pieces && !InventoryMath.IsWhole(line.Quantity))
                errors.Add($"{entry.Item.Sku} se maneja en piezas: la cantidad debe ser entera.");
        }
        var lotIds = lines.Where(l => l.LotId is not null).Select(l => l.LotId!.Value).Distinct().ToList();
        var lots = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.ItemId, ct);
        if (lines.Any(l => l.LotId is { } lotId && (!lots.TryGetValue(lotId, out var itemId) || itemId != l.ItemId)))
            errors.Add("Un lote indicado no pertenece a su artículo.");
        if (errors.Count > 0)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = [.. errors.Distinct()] });
    }

    private async Task<Location> EnsureActiveAsync(Guid locationId, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        return location;
    }

    private static List<TransferLineInput> ToInputs(IEnumerable<TransferLineRequest> lines) =>
        lines.Select(l => new TransferLineInput(l.ItemId, l.LotId, l.Quantity)).ToList();

    private async Task<Dictionary<Guid, TransferLocationDto>> LocationsAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var list = ids.Distinct().ToList();
        return await db.Locations.AsNoTracking().Where(l => list.Contains(l.Id))
            .ToDictionaryAsync(l => l.Id, l => new TransferLocationDto(l.Id, l.Code, l.Name, l.Type), ct);
    }

    private async Task<List<TransferListItemDto>> ToListItemsAsync(IReadOnlyList<Transfer> transfers, CancellationToken ct)
    {
        var ids = transfers.Select(t => t.Id).ToList();
        var lineCounts = await db.Transfers.Where(t => ids.Contains(t.Id)).Select(t => new { t.Id, Count = t.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var locations = await LocationsAsync(transfers.SelectMany(t => new[] { t.FromLocationId, t.ToLocationId }), ct);
        return transfers.Select(t => new TransferListItemDto(t.Id, t.Folio, t.Kind, locations[t.FromLocationId], locations[t.ToLocationId],
            t.Status, t.BranchOrderId, lineCounts[t.Id], t.CreatedAt, t.DispatchedAt, t.ReceivedAt)).ToList();
    }

    private async Task<TransferDto> ToDtoAsync(Transfer t, CancellationToken ct)
    {
        var locations = await LocationsAsync([t.FromLocationId, t.ToLocationId], ct);
        var itemIds = t.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var lotIds = t.Lines.Select(l => l.LotId).OfType<Guid>().Distinct().ToList();
        var lots = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);

        var stockIds = t.Lines.SelectMany(l => new[] { l.FromStockLocationId, l.ToStockLocationId }).OfType<Guid>().Distinct().ToList();
        var stockCodes = await db.Locations.AsNoTracking().Where(l => stockIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);
        var lines = t.Lines.Select(l => new TransferLineDto(l.Id,
                l.FromStockLocationId is { } fromStock ? stockCodes[fromStock] : null, l.ToStockLocationId is { } toStock ? stockCodes[toStock] : null,
                l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, items[l.ItemId].Uom,
                l.LotId, l.LotId is { } a ? lots[a].LotNumber : null, l.LotId is { } b ? lots[b].ExpirationDate : null,
                l.ShippedQty, l.ReceivedQty, l.ShortQty, l.UnitCost, l.UnitCost is { } cost ? InventoryMath.Round(l.ShortQty * cost) : null,
                l.DiscrepancyReason, l.DiscrepancyNotes))
            .OrderBy(l => l.Sku).ThenBy(l => l.ExpirationDate).ToList();

        var users = await userDirectory.GetNamesAsync([t.DispatchedBy, t.ReceivedBy, t.CreatedBy], ct);
        return new TransferDto(t.Id, t.Folio, t.Kind, locations[t.FromLocationId], locations[t.ToLocationId], t.BranchOrderId, t.Status, t.Notes,
            t.VehicleDescription, t.DriverName, t.DispatchedAt, t.DispatchedBy, users.Of(t.DispatchedBy), t.ReceivedAt, t.ReceivedBy,
            users.Of(t.ReceivedBy), lines,
            lines.Sum(l => InventoryMath.Round(l.ShippedQty * (l.UnitCost ?? 0))), lines.Sum(l => l.ShortValue ?? 0),
            t.CreatedAt, t.CreatedBy, users.Of(t.CreatedBy), t.Version, t.ProductionOrderId,
            t.ProductionOrderId is { } orderId
                ? await db.ProductionOrders.AsNoTracking().Where(o => o.Id == orderId).Select(o => o.Folio).SingleAsync(ct)
                : null);
    }
}
