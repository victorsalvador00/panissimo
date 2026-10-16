using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;

namespace Sgo.Application.Inventory;

public sealed record ConsumptionLineRequest(Guid ItemId, Guid? LotId, decimal Quantity);

/// <param name="BusinessDate">Day of the consumption; defaults to today (Mexico City). Cannot be in the future.</param>
public sealed record CreateConsumptionRequest(Guid LocationId, DateOnly? BusinessDate, string? Notes, IReadOnlyList<ConsumptionLineRequest> Lines);

public sealed record ConsumptionListQuery : PageQuery
{
    public Guid? LocationId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

public sealed record ConsumptionListItemDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, DateOnly BusinessDate, ConsumptionStatus Status,
    int LineCount, decimal TotalCost, DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName);

public sealed record ConsumptionLineDto(Guid Id, Guid ItemId, string Sku, string ItemName, Guid? LotId, string? LotNumber, decimal Quantity);

public sealed record ConsumptionDto(
    Guid Id, string Folio, Guid LocationId, string LocationCode, DateOnly BusinessDate, ConsumptionStatus Status, string? Notes,
    IReadOnlyList<ConsumptionLineDto> Lines, IReadOnlyList<PostedMovementDto> Movements, decimal TotalCost,
    DateTimeOffset CreatedAt, Guid? CreatedBy, string? CreatedByName, uint Version);

public sealed class CreateConsumptionRequestValidator : AbstractValidator<CreateConsumptionRequest>
{
    public CreateConsumptionRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(500).WithName("Notas");
        RuleFor(x => x.Lines).Cascade(CascadeMode.Stop).NotEmpty().WithMessage("Agrega al menos una línea.");
        RuleForEach(x => x.Lines).ChildRules(line =>
            line.RuleFor(l => l.Quantity).GreaterThan(0).WithName("Cantidad")
                .Must(q => InventoryMath.Round(q) == q).WithMessage("La cantidad admite máximo 4 decimales."));
    }
}

public interface IConsumptionService
{
    Task<PagedResult<ConsumptionListItemDto>> ListAsync(ConsumptionListQuery query, CancellationToken ct = default);
    Task<ConsumptionDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>Creates and posts the consumption (FEFO when no lot); on any error nothing is saved.</summary>
    Task<ConsumptionDto> CreateAsync(CreateConsumptionRequest request, CancellationToken ct = default);
}

public sealed class ConsumptionService(
    ISgoDbContext db,
    ILocationScope scope,
    IFolioGenerator folios,
    IClock clock,
    IUserDirectory userDirectory,
    IInventoryPostingService posting) : IConsumptionService
{
    private static readonly Dictionary<string, Expression<Func<ConsumptionEntry, object?>>> SortColumns = new()
    {
        ["folio"] = c => c.Folio,
        ["businessDate"] = c => c.BusinessDate,
        ["createdAt"] = c => c.CreatedAt,
    };

    public async Task<PagedResult<ConsumptionListItemDto>> ListAsync(ConsumptionListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var entries = db.Consumptions.AsNoTracking().Where(c => allowed.Contains(c.LocationId));
        if (query.LocationId is { } locationId)
            entries = entries.Where(c => c.LocationId == locationId);
        if (query.From is { } from)
            entries = entries.Where(c => c.BusinessDate >= from);
        if (query.To is { } to)
            entries = entries.Where(c => c.BusinessDate <= to);
        if (query.SearchTerm() is { } term)
            entries = entries.Where(c => c.Folio.ToLower().Contains(term));

        var page = await entries.ApplySort(query.Sort, SortColumns, "createdAt:desc").ToPagedResultAsync(query, ct);
        var ids = page.Items.Select(c => c.Id).ToList();
        var lineCounts = await db.Consumptions.Where(c => ids.Contains(c.Id)).Select(c => new { c.Id, Count = c.Lines.Count })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var totals = await db.InventoryMovements
            .Where(m => m.SourceDocType == ConsumptionEntry.DocType && ids.Contains(m.SourceDocId))
            .GroupBy(m => m.SourceDocId).Select(g => new { g.Key, Total = g.Sum(m => m.TotalCost) })
            .ToDictionaryAsync(x => x.Key, x => x.Total, ct);
        var locationIds = page.Items.Select(c => c.LocationId).Distinct().ToList();
        var codes = await db.Locations.Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Code, ct);
        var users = await userDirectory.GetNamesAsync(page.Items.Select(c => c.CreatedBy), ct);

        return new PagedResult<ConsumptionListItemDto>(page.Items.Select(c => new ConsumptionListItemDto(c.Id, c.Folio, c.LocationId,
                codes[c.LocationId], c.BusinessDate, c.Status, lineCounts[c.Id], totals.GetValueOrDefault(c.Id), c.CreatedAt, c.CreatedBy, users.Of(c.CreatedBy))).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<ConsumptionDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var entry = await db.Consumptions.AsNoTracking().Include(c => c.Lines).SingleOrDefaultAsync(c => c.Id == id, ct)
                    ?? throw new NotFoundException("el consumo", id);
        scope.EnsureAccess(entry.LocationId);
        return await ToDtoAsync(entry, ct);
    }

    public async Task<ConsumptionDto> CreateAsync(CreateConsumptionRequest request, CancellationToken ct = default)
    {
        scope.EnsureAccess(request.LocationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.LocationId, ct)
                       ?? throw new NotFoundException("la ubicación", request.LocationId);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        if (location.Type != LocationType.Branch)
            throw new BusinessRuleException("consumption_branch_only",
                "El consumo solo se registra en sucursales. En fábrica y comisariato usa producción, traspasos o ajustes.");

        var today = clock.BusinessDate();
        var lines = request.Lines.Select(l => new ConsumptionLineInput(l.ItemId, l.LotId, l.Quantity)).ToList();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var entry = new ConsumptionEntry(await folios.NextAsync(DocType.Consumption, ct), request.LocationId,
            request.BusinessDate ?? today, today, request.Notes, lines);
        db.Consumptions.Add(entry);
        await posting.PostAsync(entry.ToMovementRequests(), ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return await ToDtoAsync(entry, ct);
    }

    private async Task<ConsumptionDto> ToDtoAsync(ConsumptionEntry c, CancellationToken ct)
    {
        var location = await db.Locations.AsNoTracking().Where(l => l.Id == c.LocationId).Select(l => l.Code).SingleAsync(ct);
        var itemIds = c.Lines.Select(l => l.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => itemIds.Contains(i.Id)).ToDictionaryAsync(i => i.Id, ct);
        var movements = await db.InventoryMovements.AsNoTracking()
            .Where(m => m.SourceDocType == ConsumptionEntry.DocType && m.SourceDocId == c.Id)
            .OrderBy(m => m.Sequence).ToListAsync(ct);
        var lotIds = c.Lines.Select(l => l.LotId).Concat(movements.Select(m => m.LotId)).OfType<Guid>().Distinct().ToList();
        var lotNumbers = await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.LotNumber, ct);
        string? LotNumber(Guid? id) => id is { } lotId ? lotNumbers.GetValueOrDefault(lotId) : null;
        var users = await userDirectory.GetNamesAsync([c.CreatedBy], ct);

        return new ConsumptionDto(c.Id, c.Folio, c.LocationId, location, c.BusinessDate, c.Status, c.Notes,
            c.Lines.Select(l => new ConsumptionLineDto(l.Id, l.ItemId, items[l.ItemId].Sku, items[l.ItemId].Name, l.LotId, LotNumber(l.LotId), l.Quantity)).ToList(),
            movements.Select(m => new PostedMovementDto(m.ItemId, items[m.ItemId].Sku, m.LotId, LotNumber(m.LotId), m.Quantity, m.UnitCost, m.TotalCost)).ToList(),
            movements.Sum(m => m.TotalCost), c.CreatedAt, c.CreatedBy, users.Of(c.CreatedBy), c.Version);
    }
}
