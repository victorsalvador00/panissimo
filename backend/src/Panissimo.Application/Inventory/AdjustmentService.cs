using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Inventory;

/// <summary>
/// For lot items: an existing <paramref name="LotId"/>, or <paramref name="LotNumber"/> (+ optional expiration) —
/// created on entries, looked up on exits. Without either, exits follow FEFO.
/// </summary>
/// <param name="WasteQty">D-08, customer returns only: part of the returned quantity that goes straight to waste.</param>
/// <param name="WasteReason">Waste, Expired or Damaged; required with <paramref name="WasteQty"/>.</param>
public sealed record AdjustmentLineRequest(
    Guid ItemId, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate, decimal Quantity, decimal? UnitCost, string? Notes,
    decimal? WasteQty = null, AdjustmentReason? WasteReason = null);

public sealed record CreateAdjustmentRequest(Guid LocationId, AdjustmentReason Reason, string? Notes, IReadOnlyList<AdjustmentLineRequest> Lines);

public sealed record AdjustmentListQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public AdjustmentReason? Reason { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}

public sealed record AdjustmentListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, AdjustmentReason Reason, AdjustmentStatus Status,
    int LineCount, decimal TotalCost, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName);

public sealed record AdjustmentLineDto(Guid Id, Guid ItemId, string Sku, string ItemName, Guid? LotId, string? LotNumber, decimal Quantity,
    decimal? UnitCost, string? Notes, decimal? WasteQty, AdjustmentReason? WasteReason);

/// <summary>What was actually posted: a lot exit without lot is split by FEFO across several lots.</summary>
public sealed record PostedMovementDto(Guid ItemId, string Sku, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate,
    decimal Quantity, decimal UnitCost, decimal TotalCost);

public sealed record AdjustmentDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, AdjustmentReason Reason, AdjustmentStatus Status, string? Notes,
    IReadOnlyList<AdjustmentLineDto> Lines, IReadOnlyList<PostedMovementDto> Movements, decimal TotalCost,
    DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version);

public sealed class CreateAdjustmentRequestValidator : AbstractValidator<CreateAdjustmentRequest>
{
    public CreateAdjustmentRequestValidator()
    {
        RuleFor(x => x.Reason).IsInEnum().WithName("Motivo");
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.Quantity).NotEqual(0).WithMessage("La cantidad no puede ser cero.")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales.");
            line.RuleFor(l => l.UnitCost).GreaterThanOrEqualTo(0).When(l => l.UnitCost is not null).WithName("Costo unitario");
            line.RuleFor(l => l.UnitCost).Null().When(l => l.Quantity < 0)
                .WithMessage("Las salidas se valúan al costo promedio vigente; no captures costo.");
            line.RuleFor(l => l.LotNumber).MaximumLength(50).WithName("Lote");
            line.RuleFor(l => l.LotId).Null().When(l => !string.IsNullOrWhiteSpace(l.LotNumber))
                .WithMessage("Indica el lote por identificador o por número, no ambos.");
            line.RuleFor(l => l.Notes).MaximumLength(500).WithName("Notas");
            line.RuleFor(l => l.WasteQty).GreaterThan(0).LessThanOrEqualTo(l => l.Quantity).When(l => l.WasteQty is not null)
                .WithName("Merma");
            line.RuleFor(l => l.WasteReason).NotNull().Must(r => r!.Value.IsWaste()).When(l => l.WasteQty is not null)
                .WithMessage("Indica el motivo de la merma: merma, caducado o dañado.");
        });
        RuleFor(x => x).Must(x => x.Reason == AdjustmentReason.CustomerReturn || x.Lines?.All(l => l.WasteQty is null) != false)
            .WithName("lines").WithMessage("Solo una devolución de cliente separa una parte como merma.");
        RuleFor(x => x).Must(x => !x.Reason.OnlyEntries() || x.Lines?.All(l => l.Quantity > 0) != false)
            .WithName("lines").WithMessage("Una devolución de cliente solo registra entradas.");
        RuleFor(x => x).Must(x => x.Reason.AllowsEntries() || x.Lines?.All(l => l.Quantity < 0) != false)
            .WithName("lines").WithMessage("Solo los ajustes por corrección admiten cantidades positivas.");
    }
}

public interface IAdjustmentService
{
    Task<PagedResult<AdjustmentListItemDto>> ListAsync(AdjustmentListQuery query, CancellationToken ct = default);
    Task<AdjustmentDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>Creates and posts the adjustment in one transaction; on any error nothing is saved.</summary>
    Task<AdjustmentDto> CreateAsync(CreateAdjustmentRequest request, CancellationToken ct = default);

    /// <summary>Same as <see cref="CreateAsync"/> but inside the caller's transaction; the caller saves and commits.</summary>
    Task<InventoryAdjustment> CreateInTransactionAsync(CreateAdjustmentRequest request, CancellationToken ct = default);
}

public sealed class AdjustmentService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    ILotRegistry lots,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IAdjustmentService
{
    private static readonly Dictionary<string, Expression<Func<InventoryAdjustment, object?>>> SortColumns = new()
    {
        ["folio"] = a => a.Folio,
        ["createdAt"] = a => a.CreatedAt,
    };

    public async Task<PagedResult<AdjustmentListItemDto>> ListAsync(AdjustmentListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var adjustments = db.InventoryAdjustments.AsNoTracking().Where(a => allowed.Contains(a.LocationId));
        if (query.LocationId is { } locationId)
        {
            // RN-46: a plant or branch also lists the adjustments of its sub-warehouses.
            var locations = await InventoryLocations.WithWarehousesAsync(db, locationId, ct);
            adjustments = adjustments.Where(a => locations.Contains(a.LocationId));
        }
        if (query.Reason is { } reason)
            adjustments = adjustments.Where(a => a.Reason == reason);
        if (query.From is { } from)
            adjustments = adjustments.Where(a => a.CreatedAt >= from);
        if (query.To is { } to)
            adjustments = adjustments.Where(a => a.CreatedAt <= to);
        if (query.SearchTerm() is { } term)
            adjustments = adjustments.Where(a => a.Folio.ToLower().Contains(term));

        var page = await adjustments.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(a => a.Id).ToList();
        var locationIds = page.Items.Select(a => a.LocationId).Distinct().ToList();
        var codes = await db.Locations.Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);
        var totals = await db.InventoryMovements
            .Where(m => m.SourceDocType == InventoryAdjustment.DocType && ids.Contains(m.SourceDocId))
            .GroupBy(m => m.SourceDocId).Select(g => new { g.Key, Total = g.Sum(m => m.TotalCost) })
            .ToDictionaryAsync(x => x.Key, x => x.Total, ct);
        var lineCounts = await db.InventoryAdjustments.Where(a => ids.Contains(a.Id))
            .Select(a => new { a.Id, Count = a.Lines.Count }).ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var users = await userDirectory.GetNamesAsync(page.Items.Select(a => a.CreatedBy), ct);

        return new PagedResult<AdjustmentListItemDto>(
            page.Items.Select(a => new AdjustmentListItemDto(a.Id, a.Folio, a.LocationId, codes[a.LocationId], a.Reason, a.Status,
                lineCounts[a.Id], totals.GetValueOrDefault(a.Id), a.CreatedAt, a.CreatedBy, users.Of(a.CreatedBy))).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<AdjustmentDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var adjustment = await db.InventoryAdjustments.AsNoTracking().Include(a => a.Lines).SingleOrDefaultAsync(a => a.Id == id, ct)
                         ?? throw new NotFoundException("el ajuste", id);
        scope.EnsureAccess(adjustment.LocationId);
        return await ToDtoAsync(adjustment, ct);
    }

    public async Task<AdjustmentDto> CreateAsync(CreateAdjustmentRequest request, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); // Postgres default: READ COMMITTED (backend §5)
        var adjustment = await CreateInTransactionAsync(request, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(adjustment, ct);
    }

    public async Task<InventoryAdjustment> CreateInTransactionAsync(CreateAdjustmentRequest request, CancellationToken ct = default)
    {
        scope.EnsureStockAccess(request.LocationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.LocationId, ct)
                       ?? throw new NotFoundException("la ubicación", request.LocationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");

        var itemIds = request.Lines.Select(l => l.ItemId).Distinct().ToList();
        if (await db.Items.CountAsync(i => itemIds.Contains(i.Id), ct) != itemIds.Count)
            throw new RequestValidationException(new Dictionary<string, string[]> { ["lines"] = ["Uno o más artículos no existen."] });

        var adjustmentId = Guid.CreateVersion7();
        var lines = new List<AdjustmentLineInput>();
        foreach (var line in request.Lines)
        {
            var lotId = line.LotId;
            if (!string.IsNullOrWhiteSpace(line.LotNumber))
            {
                if (line.Quantity > 0)
                    lotId = (await lots.GetOrCreateAsync(line.ItemId, line.LotNumber, line.ExpirationDate,
                        InventoryAdjustment.DocType, adjustmentId, ct)).Id;
                else
                    lotId = await db.Lots.Where(l => l.ItemId == line.ItemId && l.LotNumber == line.LotNumber.Trim())
                                .Select(l => (Guid?)l.Id).SingleOrDefaultAsync(ct)
                            ?? throw new BusinessRuleException("lot_not_found", $"El lote {line.LotNumber.Trim()} no existe para ese artículo.");
            }
            lines.Add(new AdjustmentLineInput(line.ItemId, lotId, line.Quantity, line.UnitCost, line.Notes, line.WasteQty, line.WasteReason));
        }

        var folio = await folios.NextAsync(DocType.Adjustment, ct);
        var adjustment = new InventoryAdjustment(adjustmentId, folio, request.LocationId, request.Reason, request.Notes, lines);
        db.InventoryAdjustments.Add(adjustment);

        await posting.PostAsync(adjustment.ToMovementRequests(), ct);
        // D-08: the waste part leaves after the return entered, so it can take from the same lot.
        if (adjustment.WasteMovementRequests() is { Count: > 0 } waste)
            await posting.PostAsync(waste, ct);
        return adjustment;
    }

    private async Task<AdjustmentDto> ToDtoAsync(InventoryAdjustment a, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == a.LocationId).Select(l => l.Code).SingleAsync(ct);
        var itemIds = a.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);

        var movements = await db.InventoryMovements.AsNoTracking()
            .Where(m => m.SourceDocType == InventoryAdjustment.DocType && m.SourceDocId == a.Id)
            .OrderBy(m => m.Sequence).ToListAsync(ct);
        var lotIds = a.Lines.Select(l => l.LotId).Concat(movements.Select(m => m.LotId)).OfType<Guid>().Distinct().ToList();
        var lotInfo = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);

        string? LotNumber(Guid? id) => id is { } lotId ? lotInfo.GetValueOrDefault(lotId)?.LotNumber : null;
        DateOnly? Expiration(Guid? id) => id is { } lotId ? lotInfo.GetValueOrDefault(lotId)?.ExpirationDate : null;
        var users = await userDirectory.GetNamesAsync([a.CreatedBy], ct);

        return new AdjustmentDto(a.Id, a.Folio, a.LocationId, location, a.Reason, a.Status, a.Notes,
            a.Lines.Select(l => new AdjustmentLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, l.LotId, LotNumber(l.LotId),
                l.Quantity, l.UnitCost, l.Notes, l.WasteQty, l.WasteReason)).ToList(),
            movements.Select(m => new PostedMovementDto(m.ItemId, items[m.ItemId].Sku, m.LotId, LotNumber(m.LotId), Expiration(m.LotId),
                m.Quantity, m.UnitCost, m.TotalCost)).ToList(),
            movements.Sum(m => m.TotalCost), a.CreatedAt, a.CreatedBy, users.Of(a.CreatedBy), a.Version);
    }
}
