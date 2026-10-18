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

        // Everything is grouped in the database by the chosen key and the unit: a year has ~80,000 closes
        // (docs/rendimiento.md). The flags turn into CASE expressions of the GROUP BY.
        var (byArea, byItem, byDay) = (groupBy == ProductionSummaryGroupBy.Area, groupBy == ProductionSummaryGroupBy.Item,
            groupBy == ProductionSummaryGroupBy.Day);

        // Planned: orders scheduled in the range, not cancelled.
        var planned = await (from o in db.ProductionOrders.AsNoTracking()
                             join i in db.Items on o.OutputItemId equals i.Id
                             join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                             where o.LocationId == query.LocationId && o.ScheduledDate >= start && o.ScheduledDate <= end
                                   && o.Status != ProductionOrderStatus.Cancelled
                             group o by new
                             {
                                 Key = byArea ? o.ProductionAreaId : byItem ? (Guid?)o.OutputItemId : null,
                                 Date = byDay ? (DateOnly?)o.ScheduledDate : null,
                                 Uom = u.Code,
                             } into g
                             select new { g.Key.Key, g.Key.Date, g.Key.Uom, Orders = g.Count(), Qty = g.Sum(o => o.PlannedQty) })
            .ToListAsync(ct);

        // Produced: closes of the range, whatever the date of their order; their waste in pesos (RN-13) from the lines.
        var produced = await (from c in db.ProductionCloses.AsNoTracking()
                              join o in db.ProductionOrders on c.ProductionOrderId equals o.Id
                              join i in db.Items on o.OutputItemId equals i.Id
                              join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                              where o.LocationId == query.LocationId && c.BusinessDate >= start && c.BusinessDate <= end
                              group c by new
                              {
                                  Key = byArea ? o.ProductionAreaId : byItem ? (Guid?)o.OutputItemId : null,
                                  Date = byDay ? (DateOnly?)c.BusinessDate : null,
                                  Uom = u.Code,
                              } into g
                              select new { g.Key.Key, g.Key.Date, g.Key.Uom, Qty = g.Sum(c => c.ProducedQty), Cost = g.Sum(c => c.TotalCost) })
            .ToListAsync(ct);
        var waste = await (from c in db.ProductionCloses.AsNoTracking()
                           join o in db.ProductionOrders on c.ProductionOrderId equals o.Id
                           join i in db.Items on o.OutputItemId equals i.Id
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           from l in c.Lines
                           where o.LocationId == query.LocationId && c.BusinessDate >= start && c.BusinessDate <= end && l.WasteQty != 0
                           group l by new
                           {
                               Key = byArea ? o.ProductionAreaId : byItem ? (Guid?)o.OutputItemId : null,
                               Date = byDay ? (DateOnly?)c.BusinessDate : null,
                               Uom = u.Code,
                           } into g
                           select new { g.Key.Key, g.Key.Date, g.Key.Uom, Waste = g.Sum(l => l.WasteQty * l.UnitCost) })
            .ToListAsync(ct);

        var plannedBy = planned.ToDictionary(p => new GroupKey(p.Key, p.Date, p.Uom), p => (p.Orders, p.Qty));
        var wasteBy = waste.ToDictionary(w => new GroupKey(w.Key, w.Date, w.Uom), w => w.Waste);
        var producedBy = produced.ToDictionary(d => new GroupKey(d.Key, d.Date, d.Uom),
            d => (d.Qty, d.Cost, Waste: wasteBy.GetValueOrDefault(new GroupKey(d.Key, d.Date, d.Uom))));

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
            InventoryMath.Round(produced.Sum(d => d.Cost)), InventoryMath.Round(waste.Sum(w => w.Waste)));
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
