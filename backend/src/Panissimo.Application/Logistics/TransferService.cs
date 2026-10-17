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

public sealed record UpdateTransferRequest(uint Version, Guid ToLocationId, string? Notes, IReadOnlyList<TransferLineRequest> Lines);

public sealed record DispatchLineRequest(Guid LineId, IReadOnlyList<LotQuantity> Lots);

/// <param name="Lines">Optional: lots chosen per line. Lines not listed use their planned lot or FEFO.</param>
public sealed record DispatchTransferRequest(uint Version, string VehicleDescription, string DriverName, IReadOnlyList<DispatchLineRequest>? Lines);

public sealed record ReceiveLineRequest(Guid LineId, decimal ReceivedQty, DiscrepancyReason? DiscrepancyReason, string? DiscrepancyNotes);

public sealed record ReceiveTransferRequest(uint Version, IReadOnlyList<ReceiveLineRequest> Lines);

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
    Guid Id, string Folio, TransferLocationDto From, TransferLocationDto To, TransferStatus Status, Guid? BranchOrderId,
    int LineCount, DateTimeOffset CreatedAt, DateTimeOffset? DispatchedAt, DateTimeOffset? ReceivedAt);

/// <param name="ShortQty">Loss in transit (RN-22).</param>
public sealed record TransferLineDto(
    Guid Id, Guid ItemId, string Sku, string ItemName, string BaseUomCode, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate,
    decimal ShippedQty, decimal? ReceivedQty, decimal ShortQty, decimal? UnitCost, decimal? ShortValue,
    DiscrepancyReason? DiscrepancyReason, string? DiscrepancyNotes);

public sealed record TransferDto(
    Guid Id, string Folio, TransferLocationDto From, TransferLocationDto To, Guid? BranchOrderId,
    TransferStatus Status, string? Notes,
    string? VehicleDescription, string? DriverName, DateTimeOffset? DispatchedAt, Guid? DispatchedBy, string? DispatchedByName,
    DateTimeOffset? ReceivedAt, Guid? ReceivedBy, string? ReceivedByName, IReadOnlyList<TransferLineDto> Lines,
    decimal ShippedValue, decimal TransitLossValue, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version);

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

public interface ITransferService
{
    Task<PagedResult<TransferListItemDto>> ListAsync(TransferListQuery query, CancellationToken ct = default);
    Task<TransferDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<TransferDto> CreateAsync(CreateTransferRequest request, CancellationToken ct = default);
    Task<TransferDto> UpdateAsync(Guid id, UpdateTransferRequest request, CancellationToken ct = default);
    Task<TransferDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-21: posts TransferOut at the origin. A concurrent dispatch of the same transfer gets 409.</summary>
    Task<TransferDto> DispatchAsync(Guid id, DispatchTransferRequest request, CancellationToken ct = default);

    /// <summary>RN-22: posts TransferIn at the destination with the origin's lots and cost.</summary>
    Task<TransferDto> ReceiveAsync(Guid id, ReceiveTransferRequest request, CancellationToken ct = default);
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
        var transfers = Visible();
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
            transfers = transfers.Where(t => t.FromLocationId == either || t.ToLocationId == either);
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

    public async Task<TransferDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var transfer = await db.Transfers.AsNoTracking().Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id, ct)
                       ?? throw new NotFoundException("el traspaso", id);
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

    public async Task<TransferDto> UpdateAsync(Guid id, UpdateTransferRequest request, CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, ct);
        db.EnsureVersion(transfer, request.Version);
        await ValidatePlanAsync(transfer.FromLocationId, request.ToLocationId, request.Lines, ct);
        await links.EnsureEditAllowedAsync(transfer, request.ToLocationId, request.Lines, ct);

        transfer.UpdateDraft(request.ToLocationId, request.Notes, ToInputs(request.Lines));
        db.Entry(transfer).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, ct);
        db.EnsureVersion(transfer, version);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        transfer.Cancel();
        await links.OnCancelledAsync(transfer, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> DispatchAsync(Guid id, DispatchTransferRequest request, CancellationToken ct = default)
    {
        var transfer = await FindForOriginAsync(id, ct);
        db.EnsureVersion(transfer, request.Version);
        await EnsureActiveAsync(transfer.ToLocationId, ct);

        var chosen = (request.Lines ?? []).ToDictionary(l => l.LineId, l => l.Lots);
        var requests = transfer.DispatchRequests(chosen);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ClaimAsync(transfer, ct);
        var movements = await posting.PostAsync(requests, ct);
        transfer.Dispatch(request.VehicleDescription, request.DriverName, clock.UtcNow, currentUser.UserId, movements);
        await links.OnDispatchedAsync(transfer, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(transfer, ct);
    }

    public async Task<TransferDto> ReceiveAsync(Guid id, ReceiveTransferRequest request, CancellationToken ct = default)
    {
        var transfer = await db.Transfers.Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id, ct)
                       ?? throw new NotFoundException("el traspaso", id);
        scope.EnsureAccess(transfer.ToLocationId); // receiving requires the destination
        db.EnsureVersion(transfer, request.Version);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await ClaimAsync(transfer, ct);
        var receipts = request.Lines.Select(l => new ReceiptInput(l.LineId, l.ReceivedQty, l.DiscrepancyReason, l.DiscrepancyNotes)).ToList();
        var requests = transfer.Receive(receipts, clock.UtcNow, currentUser.UserId);
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

    private async Task<Transfer> FindForOriginAsync(Guid id, CancellationToken ct)
    {
        var transfer = await db.Transfers.Include(t => t.Lines).SingleOrDefaultAsync(t => t.Id == id, ct)
                       ?? throw new NotFoundException("el traspaso", id);
        scope.EnsureAccess(transfer.FromLocationId); // planning and dispatching require the origin
        return transfer;
    }

    private async Task ValidatePlanAsync(Guid fromId, Guid toId, IReadOnlyList<TransferLineRequest> lines, CancellationToken ct)
    {
        var from = await EnsureActiveAsync(fromId, ct);
        var to = await EnsureActiveAsync(toId, ct);
        if (!TransferRoutes.IsStandard(from.Type, to.Type) && access.Access?.Has(Permissions.LogisticsTransfersSpecial) != true)
            throw new ForbiddenException(SpecialRouteMessage);

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
        return transfers.Select(t => new TransferListItemDto(t.Id, t.Folio, locations[t.FromLocationId], locations[t.ToLocationId],
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

        var lines = t.Lines.Select(l => new TransferLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, items[l.ItemId].Uom,
                l.LotId, l.LotId is { } a ? lots[a].LotNumber : null, l.LotId is { } b ? lots[b].ExpirationDate : null,
                l.ShippedQty, l.ReceivedQty, l.ShortQty, l.UnitCost, l.UnitCost is { } cost ? InventoryMath.Round(l.ShortQty * cost) : null,
                l.DiscrepancyReason, l.DiscrepancyNotes))
            .OrderBy(l => l.Sku).ThenBy(l => l.ExpirationDate).ToList();

        var users = await userDirectory.GetNamesAsync([t.DispatchedBy, t.ReceivedBy, t.CreatedBy], ct);
        return new TransferDto(t.Id, t.Folio, locations[t.FromLocationId], locations[t.ToLocationId], t.BranchOrderId, t.Status, t.Notes,
            t.VehicleDescription, t.DriverName, t.DispatchedAt, t.DispatchedBy, users.Of(t.DispatchedBy), t.ReceivedAt, t.ReceivedBy,
            users.Of(t.ReceivedBy), lines,
            lines.Sum(l => InventoryMath.Round(l.ShippedQty * (l.UnitCost ?? 0))), lines.Sum(l => l.ShortValue ?? 0),
            t.CreatedAt, t.CreatedBy, users.Of(t.CreatedBy), t.Version);
    }
}
