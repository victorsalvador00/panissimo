using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Inventory;

public sealed record InventorySnapshot(long Sequence, IReadOnlyList<SnapshotLine> Lines);

/// <summary>Consistent point-in-time stock reads for physical counts (RN-06).</summary>
public interface IInventorySnapshotReader
{
    /// <summary>
    /// Stock rows ≠ 0 of the location (optionally one category) and the last kardex sequence they include.
    /// Waits for postings in progress at that location so the snapshot and the sequence agree.
    /// </summary>
    Task<InventorySnapshot> TakeAsync(Guid locationId, Guid? categoryId, CancellationToken ct);

    /// <summary>Stock of (location, item, lot) as of kardex <paramref name="sequence"/>.</summary>
    Task<decimal> QuantityAtAsync(Guid locationId, Guid itemId, Guid? lotId, long sequence, CancellationToken ct);
}

public sealed record CreatePhysicalCountRequest(Guid LocationId, Guid? CategoryId, string? Notes);

/// <param name="LineId">Existing line; null adds (or reuses) the line of an item/lot that was not in the snapshot list.</param>
public sealed record CountInput(Guid? LineId, Guid? ItemId, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate, decimal CountedQty);

/// <summary>Draft: category and notes. In progress: notes and captured counts (autosave).</summary>
public sealed record UpdatePhysicalCountRequest(uint Version, Guid? CategoryId, string? Notes, IReadOnlyList<CountInput>? Counts);

/// <summary>RN-06: an item or lot found during the count, added without a counted quantity yet.</summary>
public sealed record AddCountLineRequest(uint Version, Guid ItemId, Guid? LotId, string? LotNumber, DateOnly? ExpirationDate);

public sealed record PhysicalCountListQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public PhysicalCountStatus? Status { get; init; }
}

public sealed record PhysicalCountListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid? CategoryId, PhysicalCountStatus Status,
    int LineCount, int CountedLines, DateTimeOffset CreatedAt, DateTimeOffset? StartedAt, DateTimeOffset? ClosedAt);

public sealed record PhysicalCountLineDto(
    Guid Id, Guid ItemId, string Sku, string ItemName, string BaseUomCode, Guid? LotId, string? LotNumber,
    DateOnly? ExpirationDate, decimal SnapshotQty, decimal? CountedQty, decimal? Difference);

public sealed record PhysicalCountDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, Guid? CategoryId, PhysicalCountStatus Status, string? Notes,
    DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, DateTimeOffset? StartedAt, DateTimeOffset? ClosedAt,
    IReadOnlyList<PhysicalCountLineDto> Lines, IReadOnlyList<PostedMovementDto> Movements, uint Version);

public sealed class CreatePhysicalCountRequestValidator : AbstractValidator<CreatePhysicalCountRequest>
{
    public CreatePhysicalCountRequestValidator() => RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
}

public sealed class UpdatePhysicalCountRequestValidator : AbstractValidator<UpdatePhysicalCountRequest>
{
    public UpdatePhysicalCountRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleForEach(x => x.Counts).ChildRules(count =>
        {
            count.RuleFor(c => c.CountedQty).GreaterThanOrEqualTo(0).WithName("Cantidad contada")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad contada admite máximo 4 decimales.");
            count.RuleFor(c => c.ItemId).NotNull().When(c => c.LineId is null)
                .WithMessage("Para agregar una línea indica el artículo.");
            count.RuleFor(c => c.LotNumber).MaximumLength(50).WithName("Lote");
        });
    }
}

public sealed class AddCountLineRequestValidator : AbstractValidator<AddCountLineRequest>
{
    public AddCountLineRequestValidator() => RuleFor(x => x.LotNumber).MaximumLength(50).WithName("Lote");
}

public interface IPhysicalCountService
{
    Task<PagedResult<PhysicalCountListItemDto>> ListAsync(PhysicalCountListQuery query, CancellationToken ct = default);
    Task<PhysicalCountDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<PhysicalCountDto> CreateAsync(CreatePhysicalCountRequest request, CancellationToken ct = default);
    Task<PhysicalCountDto> UpdateAsync(Guid id, UpdatePhysicalCountRequest request, CancellationToken ct = default);
    Task<PhysicalCountDto> AddLineAsync(Guid id, AddCountLineRequest request, CancellationToken ct = default);
    Task<PhysicalCountDto> StartAsync(Guid id, uint version, CancellationToken ct = default);

    /// <summary>RN-06: posts counted − snapshot of each line as PhysicalCountAdjustment, in one transaction.</summary>
    Task<PhysicalCountDto> CloseAsync(Guid id, uint version, CancellationToken ct = default);

    Task<PhysicalCountDto> CancelAsync(Guid id, uint version, CancellationToken ct = default);
}

public sealed class PhysicalCountService(
    IAppDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    IInventorySnapshotReader snapshots,
    ILotRegistry lots,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IPhysicalCountService
{
    private static readonly Dictionary<string, Expression<Func<PhysicalCount, object?>>> SortColumns = new()
    {
        ["folio"] = c => c.Folio,
        ["createdAt"] = c => c.CreatedAt,
        ["status"] = c => c.Status,
    };

    public async Task<PagedResult<PhysicalCountListItemDto>> ListAsync(PhysicalCountListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var counts = db.PhysicalCounts.AsNoTracking().Where(c => allowed.Contains(c.LocationId));
        if (query.LocationId is { } locationId)
            counts = counts.Where(c => c.LocationId == locationId);
        if (query.Status is { } status)
            counts = counts.Where(c => c.Status == status);
        if (query.SearchTerm() is { } term)
            counts = counts.Where(c => c.Folio.ToLower().Contains(term));

        var page = await counts.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(c => c.Id).ToList();
        var stats = await db.PhysicalCounts.Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, Total = c.Lines.Count, Counted = c.Lines.Count(l => l.CountedQty != null) })
            .ToDictionaryAsync(x => x.Id, ct);
        var locationIds = page.Items.Select(c => c.LocationId).Distinct().ToList();
        var codes = await db.Locations.Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);

        return new PagedResult<PhysicalCountListItemDto>(page.Items.Select(c => new PhysicalCountListItemDto(
                c.Id, c.Folio, c.LocationId, codes[c.LocationId], c.CategoryId, c.Status, stats[c.Id].Total, stats[c.Id].Counted,
                c.CreatedAt, c.StartedAt, c.ClosedAt)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<PhysicalCountDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<PhysicalCountDto> CreateAsync(CreatePhysicalCountRequest request, CancellationToken ct = default)
    {
        scope.EnsureStockAccess(request.LocationId);
        await EnsureActiveLocationAsync(request.LocationId, ct);
        if (await db.Locations.AnyAsync(w => w.ParentLocationId == request.LocationId && w.IsActive, ct))
            throw new BusinessRuleException("location_has_warehouses",
                "La ubicación tiene subalmacenes: el conteo se hace por subalmacén (RN-44).");
        await EnsureCategoryAsync(request.CategoryId, ct);

        var count = new PhysicalCount(await folios.NextAsync(DocType.PhysicalCount, ct), request.LocationId, request.CategoryId, request.Notes);
        db.PhysicalCounts.Add(count);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    public async Task<PhysicalCountDto> UpdateAsync(Guid id, UpdatePhysicalCountRequest request, CancellationToken ct = default)
    {
        var count = await FindAsync(id, ct);
        db.EnsureVersion(count, request.Version);
        // A counted lot that does not exist yet is created here; the lot lock needs a transaction.
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        if (count.Status == PhysicalCountStatus.Draft)
        {
            if (request.Counts is { Count: > 0 })
                throw new BusinessRuleException("count_not_in_progress", "Inicia el conteo antes de capturar cantidades.");
            await EnsureCategoryAsync(request.CategoryId, ct);
            count.UpdateDraft(request.CategoryId, request.Notes);
        }
        else
        {
            if (request.CategoryId != count.CategoryId)
                throw new BusinessRuleException("count_not_draft", "La categoría solo puede cambiarse en borrador.");
            count.UpdateNotes(request.Notes);
            foreach (var input in request.Counts ?? [])
            {
                var line = input.LineId is { } lineId
                    ? count.Lines.SingleOrDefault(l => l.Id == lineId)
                      ?? throw new BusinessRuleException("count_line_not_found", "La línea no pertenece a este conteo.")
                    : await FindOrAddLineAsync(count, input.ItemId!.Value, input.LotId, input.LotNumber, input.ExpirationDate, ct);
                await EnsureWholeIfPiecesAsync(line.ItemId, input.CountedQty, ct);
                count.RecordCount(line.Id, input.CountedQty);
            }
        }

        db.Entry(count).State = EntityState.Modified; // line-only edits still bump the version
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    public async Task<PhysicalCountDto> AddLineAsync(Guid id, AddCountLineRequest request, CancellationToken ct = default)
    {
        var count = await FindAsync(id, ct);
        db.EnsureVersion(count, request.Version);
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var before = count.Lines.Count;
        await FindOrAddLineAsync(count, request.ItemId, request.LotId, request.LotNumber, request.ExpirationDate, ct);
        if (count.Lines.Count == before)
            throw new BusinessRuleException("count_line_duplicated", "El artículo y lote ya están en el conteo.");

        db.Entry(count).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    public async Task<PhysicalCountDto> StartAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var count = await FindAsync(id, ct);
        db.EnsureVersion(count, version);
        await EnsureActiveLocationAsync(count.LocationId, ct);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (await db.PhysicalCounts.AnyAsync(c => c.LocationId == count.LocationId && c.Status == PhysicalCountStatus.InProgress, ct))
            throw new BusinessRuleException("count_already_in_progress", "Ya hay un conteo en curso en esta ubicación (RN-06).");

        var snapshot = await snapshots.TakeAsync(count.LocationId, count.CategoryId, ct);
        count.Start(clock.UtcNow, snapshot.Sequence, snapshot.Lines);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    public async Task<PhysicalCountDto> CloseAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var count = await FindAsync(id, ct);
        db.EnsureVersion(count, version);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var movements = count.Close(clock.UtcNow);
        await posting.PostAsync(movements, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    public async Task<PhysicalCountDto> CancelAsync(Guid id, uint version, CancellationToken ct = default)
    {
        var count = await FindAsync(id, ct);
        db.EnsureVersion(count, version);
        count.Cancel(clock.UtcNow);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(count, ct);
    }

    /// <summary>The line of (item, lot); a new one is valued at the snapshot point (RN-06: later movements are respected).</summary>
    private async Task<PhysicalCountLine> FindOrAddLineAsync(PhysicalCount count, Guid itemId, Guid? lotId, string? lotNumber,
        DateOnly? expiration, CancellationToken ct)
    {
        var item = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == itemId, ct)
                   ?? throw new BusinessRuleException("item_not_found", "El artículo no existe.");
        if (count.CategoryId is { } categoryId && item.CategoryId != categoryId)
            throw new BusinessRuleException("count_category_mismatch", $"{item.Sku} no pertenece a la categoría de este conteo.");

        if (item.TracksLots && lotId is null)
        {
            if (string.IsNullOrWhiteSpace(lotNumber))
                throw new BusinessRuleException("lot_required", $"El artículo {item.Sku} maneja lotes: indica el lote contado.");
            lotId = (await lots.GetOrCreateAsync(item.Id, lotNumber, expiration, PhysicalCount.DocType, count.Id, ct)).Id;
        }
        if (!item.TracksLots && (lotId is not null || !string.IsNullOrWhiteSpace(lotNumber)))
            throw new BusinessRuleException("lot_not_allowed", $"El artículo {item.Sku} no maneja lotes.");

        return count.Lines.SingleOrDefault(l => l.ItemId == item.Id && l.LotId == lotId)
               ?? count.AddLine(item.Id, lotId,
                   lotId is { } id && db.Lots.Local.Any(l => l.Id == id && db.Entry(l).State == EntityState.Added)
                       ? 0m // a lot created now has no history
                       : await snapshots.QuantityAtAsync(count.LocationId, item.Id, lotId, count.SnapshotSequence!.Value, ct));
    }

    /// <summary>RN-03b.</summary>
    private async Task EnsureWholeIfPiecesAsync(Guid itemId, decimal quantity, CancellationToken ct)
    {
        if (InventoryMath.IsWhole(quantity))
            return;
        var item = await (from i in db.Items join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                          where i.Id == itemId select new { i.Sku, u.Code }).SingleAsync(ct);
        if (item.Code == UnitOfMeasure.PieceCode)
            throw new BusinessRuleException("whole_quantity_required", $"{item.Sku} se maneja en piezas: la cantidad contada debe ser entera.");
    }

    private async Task<PhysicalCount> FindAsync(Guid id, CancellationToken ct)
    {
        var count = await db.PhysicalCounts.Include(c => c.Lines).SingleOrDefaultAsync(c => c.Id == id, ct)
                    ?? throw new NotFoundException("el conteo", id);
        scope.EnsureStockAccess(count.LocationId);
        return count;
    }

    private async Task EnsureActiveLocationAsync(Guid locationId, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
    }

    private async Task EnsureCategoryAsync(Guid? categoryId, CancellationToken ct)
    {
        if (categoryId is { } id && !await db.ItemCategories.AnyAsync(c => c.Id == id, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["categoryId"] = ["La categoría no existe."] });
    }

    private async Task<PhysicalCountDto> ToDtoAsync(PhysicalCount c, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == c.LocationId).Select(l => l.Code).SingleAsync(ct);
        var itemIds = c.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code }).ToDictionaryAsync(i => i.Id, ct);
        var movements = await db.InventoryMovements.AsNoTracking()
            .Where(m => m.SourceDocType == PhysicalCount.DocType && m.SourceDocId == c.Id)
            .OrderBy(m => m.Sequence).ToListAsync(ct);
        var lotIds = c.Lines.Select(l => l.LotId).OfType<Guid>().Distinct().ToList();
        var lotInfo = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, ct);

        var lines = c.Lines
            .Select(l => new PhysicalCountLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, items[l.ItemId].Uom, l.LotId,
                l.LotId is { } lotId ? lotInfo[lotId].LotNumber : null, l.LotId is { } lid ? lotInfo[lid].ExpirationDate : null,
                l.SnapshotQty, l.CountedQty, l.Difference))
            .OrderBy(l => l.Sku).ThenBy(l => l.LotNumber)
            .ToList();
        var users = await userDirectory.GetNamesAsync([c.CreatedBy], ct);

        return new PhysicalCountDto(c.Id, c.Folio, c.LocationId, location, c.CategoryId, c.Status, c.Notes, c.CreatedAt, c.CreatedBy,
            users.Of(c.CreatedBy), c.StartedAt, c.ClosedAt, lines,
            movements.Select(m => new PostedMovementDto(m.ItemId, items[m.ItemId].Sku, m.LotId,
                m.LotId is { } id ? lotInfo.GetValueOrDefault(id)?.LotNumber : null,
                m.LotId is { } eid ? lotInfo.GetValueOrDefault(eid)?.ExpirationDate : null, m.Quantity, m.UnitCost, m.TotalCost)).ToList(),
            c.Version);
    }
}
