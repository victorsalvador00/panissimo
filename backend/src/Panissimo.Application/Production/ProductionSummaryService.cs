using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

public enum ProductionSummaryGroupBy
{
    Area,
    Item,
    Day,
}

public sealed record ProductionSummaryQuery
{
    public Guid LocationId { get; init; }
    public DateOnly From { get; init; }
    public DateOnly To { get; init; }
    public ProductionSummaryGroupBy GroupBy { get; init; } = ProductionSummaryGroupBy.Area;
}

public sealed class ProductionSummaryQueryValidator : AbstractValidator<ProductionSummaryQuery>
{
    public const int MaxDays = 366;

    public ProductionSummaryQueryValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithName("Ubicación");
        RuleFor(x => x.From).NotEmpty().WithName("Desde");
        RuleFor(x => x.To).NotEmpty().WithName("Hasta")
            .GreaterThanOrEqualTo(x => x.From).WithMessage("La fecha final no puede ser anterior a la inicial.")
            .Must((x, to) => to.DayNumber - x.From.DayNumber < MaxDays).WithMessage($"El rango no puede pasar de {MaxDays} días.");
        RuleFor(x => x.GroupBy).IsInEnum().WithName("Agrupar por");
    }
}

/// <summary>
/// A row of the production summary (RN-53), in one unit: quantities of different units are never added, so an area or a
/// day with products in kg and in pza has one row per unit.
/// </summary>
/// <param name="Key">Area id, item id or null (orders without area); null for <see cref="ProductionSummaryGroupBy.Day"/>.</param>
/// <param name="Date">Only for <see cref="ProductionSummaryGroupBy.Day"/>.</param>
/// <param name="Planned">Planned quantity of the non-cancelled orders scheduled in the range.</param>
/// <param name="Produced">Produced quantity of the closes of the range.</param>
/// <param name="CompliancePct">Produced / planned × 100; null without planned.</param>
/// <param name="ProducedCost">Cost of the closes of the range.</param>
/// <param name="WasteCost">Production waste of those closes in pesos (RN-13).</param>
public sealed record ProductionSummaryRowDto(Guid? Key, DateOnly? Date, string Label, string? Sku, string BaseUomCode, int Orders,
    decimal Planned, decimal Produced, decimal? CompliancePct, decimal ProducedCost, decimal WasteCost);

public sealed record ProductionSummaryDto(Guid LocationId, DateOnly From, DateOnly To, ProductionSummaryGroupBy GroupBy,
    IReadOnlyList<ProductionSummaryRowDto> Rows, decimal ProducedCost, decimal WasteCost);

public static class ProductionSummaryRules
{
    /// <summary>RN-53: produced / planned in percent, two decimals; null without planned.</summary>
    public static decimal? CompliancePct(decimal planned, decimal produced) =>
        planned <= 0 ? null : Math.Round(produced / planned * 100, 2, MidpointRounding.AwayFromZero);
}

public interface IProductionSummaryService
{
    Task<ProductionSummaryDto> GetAsync(ProductionSummaryQuery query, CancellationToken ct = default);
}

public sealed class ProductionSummaryService(IAppDbContext db, ILocationScope scope) : IProductionSummaryService
{
    private sealed record GroupKey(Guid? Key, DateOnly? Date, string Uom);

    public async Task<ProductionSummaryDto> GetAsync(ProductionSummaryQuery query, CancellationToken ct = default)
    {
        scope.EnsureAccess(query.LocationId);
        var (start, end, groupBy) = (query.From, query.To, query.GroupBy);

        // Planned: orders scheduled in the range, not cancelled.
        var planned = await (from o in db.ProductionOrders.AsNoTracking()
                             join i in db.Items on o.OutputItemId equals i.Id
                             join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                             where o.LocationId == query.LocationId && o.ScheduledDate >= start && o.ScheduledDate <= end
                                   && o.Status != ProductionOrderStatus.Cancelled
                             select new { o.ProductionAreaId, o.OutputItemId, o.ScheduledDate, Uom = u.Code, o.PlannedQty })
            .ToListAsync(ct);

        // Produced: closes of the range, whatever the date of their order.
        var closes = await (from c in db.ProductionCloses.AsNoTracking()
                            join o in db.ProductionOrders on c.ProductionOrderId equals o.Id
                            join i in db.Items on o.OutputItemId equals i.Id
                            join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                            where o.LocationId == query.LocationId && c.BusinessDate >= start && c.BusinessDate <= end
                            select new
                            {
                                o.ProductionAreaId, o.OutputItemId, c.BusinessDate, Uom = u.Code, c.ProducedQty, c.TotalCost,
                                Waste = c.Lines.Sum(l => l.WasteQty * l.UnitCost),
                            })
            .ToListAsync(ct);
        // Each close rounds its waste, as its own detail shows it.
        closes = [.. closes.Select(c => c with { Waste = InventoryMath.Round(c.Waste) })];

        GroupKey Key(Guid? area, Guid item, DateOnly date, string uom) => groupBy switch
        {
            ProductionSummaryGroupBy.Area => new GroupKey(area, null, uom),
            ProductionSummaryGroupBy.Item => new GroupKey(item, null, uom),
            _ => new GroupKey(null, date, uom),
        };
        var plannedBy = planned.GroupBy(p => Key(p.ProductionAreaId, p.OutputItemId, p.ScheduledDate, p.Uom))
            .ToDictionary(g => g.Key, g => (Orders: g.Count(), Qty: g.Sum(p => p.PlannedQty)));
        var producedBy = closes.GroupBy(c => Key(c.ProductionAreaId, c.OutputItemId, c.BusinessDate, c.Uom))
            .ToDictionary(g => g.Key, g => (Qty: g.Sum(c => c.ProducedQty), Cost: g.Sum(c => c.TotalCost), Waste: g.Sum(c => c.Waste)));

        var keys = plannedBy.Keys.Union(producedBy.Keys).ToList();
        var labels = await LabelsAsync(groupBy, keys, ct);
        var rows = keys
            .Select(k =>
            {
                var p = plannedBy.GetValueOrDefault(k);
                var d = producedBy.GetValueOrDefault(k);
                var (label, sku, sort) = groupBy == ProductionSummaryGroupBy.Day
                    ? (k.Date!.Value.ToString("yyyy-MM-dd"), null, 0)
                    : labels.GetValueOrDefault(k.Key ?? Guid.Empty, ("Sin área", null, int.MaxValue));
                return (Sort: sort, Row: new ProductionSummaryRowDto(k.Key, k.Date, label, sku, k.Uom, p.Orders, p.Qty, d.Qty,
                    ProductionSummaryRules.CompliancePct(p.Qty, d.Qty), InventoryMath.Round(d.Cost), InventoryMath.Round(d.Waste)));
            })
            .OrderBy(x => x.Row.Date).ThenBy(x => x.Sort).ThenBy(x => x.Row.Label).ThenBy(x => x.Row.BaseUomCode)
            .Select(x => x.Row)
            .ToList();
        return new ProductionSummaryDto(query.LocationId, start, end, groupBy, rows,
            InventoryMath.Round(closes.Sum(c => c.TotalCost)), InventoryMath.Round(closes.Sum(c => c.Waste)));
    }

    /// <summary>Area (name, sort order) or item (name, SKU) of each key.</summary>
    private async Task<Dictionary<Guid, (string Label, string? Sku, int Sort)>> LabelsAsync(ProductionSummaryGroupBy groupBy,
        IEnumerable<GroupKey> keys, CancellationToken ct)
    {
        var ids = keys.Where(k => k.Key is not null).Select(k => k.Key!.Value).Distinct().ToList();
        return groupBy switch
        {
            ProductionSummaryGroupBy.Area => await db.ProductionAreas.AsNoTracking().Where(a => ids.Contains(a.Id))
                .ToDictionaryAsync(a => a.Id, a => (a.Name, (string?)null, a.SortOrder), ct),
            ProductionSummaryGroupBy.Item => await db.Items.AsNoTracking().Where(i => ids.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id, i => (i.Name, (string?)i.Sku, 0), ct),
            _ => [],
        };
    }
}
