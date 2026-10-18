using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Inventory;

public sealed record ConsumptionAnalysisQuery
{
    public Guid LocationId { get; init; }

    /// <summary>Complete weeks up to yesterday: 8 by default, 26 at most.</summary>
    public int Weeks { get; init; } = ConsumptionAnalysisRules.DefaultWeeks;

    /// <summary>SKU or name.</summary>
    public string? Q { get; init; }
}

public sealed class ConsumptionAnalysisQueryValidator : AbstractValidator<ConsumptionAnalysisQuery>
{
    public ConsumptionAnalysisQueryValidator()
    {
        RuleFor(x => x.LocationId).NotEmpty().WithName("Ubicación");
        RuleFor(x => x.Weeks).InclusiveBetween(1, ConsumptionAnalysisRules.MaxWeeks).WithName("Semanas");
    }
}

/// <param name="Total">Outflows of the period, in base unit (positive).</param>
/// <param name="ByWeekday">Average per day of the week, Monday to Sunday.</param>
/// <param name="TrendPct">Last 4 weeks against the 4 before, in percent; null with fewer than 8 weeks or nothing before.</param>
/// <param name="CurrentMin">Current minimum of the location; null without setting.</param>
public sealed record ConsumptionAnalysisRowDto(
    Guid ItemId, string Sku, string Name, string BaseUomCode, decimal Total, decimal DailyAverage, IReadOnlyList<decimal> ByWeekday,
    decimal? TrendPct, decimal? CurrentMin, decimal? CurrentMax, decimal SuggestedMin, decimal SuggestedMax);

/// <param name="From">First day of the period (a full number of weeks ending yesterday).</param>
public sealed record ConsumptionAnalysisDto(
    Guid LocationId, int Weeks, DateOnly From, DateOnly To, int MinCoverDays, int MaxCoverDays, IReadOnlyList<ConsumptionAnalysisRowDto> Rows);

public static class ConsumptionAnalysisRules
{
    public const int DefaultWeeks = 8;
    public const int MaxWeeks = 26;
    public const int TrendWeeks = 4;

    /// <summary>RN-52: the movements that count as consumption (exits of the location).</summary>
    public static readonly IReadOnlyList<MovementType> Outflows =
        [MovementType.Consumption, MovementType.ProductionConsumption, MovementType.TransferOut, MovementType.CustomerShipment];

    /// <summary>RN-52: <paramref name="weeks"/> complete weeks up to yesterday.</summary>
    public static (DateOnly From, DateOnly To) Period(DateOnly today, int weeks) =>
        (today.AddDays(-weeks * 7), today.AddDays(-1));

    public static decimal DailyAverage(decimal total, int days) => days <= 0 ? 0 : InventoryMath.Round(total / days);

    /// <summary>RN-52: last 4 weeks against the 4 before; null when there is nothing before.</summary>
    public static decimal? TrendPct(decimal last, decimal previous) =>
        previous <= 0 ? null : Math.Round((last - previous) / previous * 100, 2, MidpointRounding.AwayFromZero);

    /// <summary>RN-52: average × cover days, rounded up (to whole units in pza, else to the 4 decimals of quantities).</summary>
    public static decimal Suggested(decimal dailyAverage, int coverDays, bool wholeQuantities)
    {
        var value = dailyAverage * coverDays;
        return wholeQuantities ? decimal.Ceiling(value) : decimal.Ceiling(value * 10_000m) / 10_000m;
    }

    /// <summary>RN-52: suggested minimum and maximum; the maximum never below the minimum.</summary>
    public static (decimal Min, decimal Max) SuggestedMinMax(decimal dailyAverage, int minCoverDays, int maxCoverDays, bool wholeQuantities)
    {
        var min = Suggested(dailyAverage, minCoverDays, wholeQuantities);
        return (min, Math.Max(min, Suggested(dailyAverage, maxCoverDays, wholeQuantities)));
    }
}

public interface IConsumptionAnalysisService
{
    /// <summary>RN-52 for a location and its sub-warehouses: a query; applying a suggestion uses the normal min/max.</summary>
    Task<ConsumptionAnalysisDto> GetAsync(ConsumptionAnalysisQuery query, CancellationToken ct = default);
}

public sealed class ConsumptionAnalysisService(IAppDbContext db, ILocationScope scope, IClock clock) : IConsumptionAnalysisService
{
    public async Task<ConsumptionAnalysisDto> GetAsync(ConsumptionAnalysisQuery query, CancellationToken ct = default)
    {
        scope.EnsureAccess(query.LocationId);
        var weeks = query.Weeks;
        var (from, to) = ConsumptionAnalysisRules.Period(clock.BusinessDate(), weeks);
        var locationIds = await InventoryLocations.WithWarehousesAsync(db, query.LocationId, ct);
        var types = ConsumptionAnalysisRules.Outflows.ToList();

        // Exits per item and day; an internal voucher only moves stock between the location and its sub-warehouses.
        var movements = db.InventoryMovements.AsNoTracking()
            .Where(m => locationIds.Contains(m.LocationId) && types.Contains(m.Type) && m.BusinessDate >= from && m.BusinessDate <= to
                        && m.SourceDocType != Transfer.InternalDocType);
        if (query.Q?.Trim().ToLowerInvariant() is { Length: > 0 } term)
            movements = movements.Where(m => db.Items.Any(i => i.Id == m.ItemId && (i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term))));
        var daily = await movements
            .GroupBy(m => new { m.ItemId, m.BusinessDate })
            .Select(g => new { g.Key.ItemId, g.Key.BusinessDate, Qty = -g.Sum(m => m.Quantity) })
            .ToListAsync(ct);

        var itemIds = daily.Select(d => d.ItemId).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where itemIds.Contains(i.Id)
                           select new { i.Id, i.Sku, i.Name, Uom = u.Code })
            .ToDictionaryAsync(i => i.Id, ct);
        var settings = await db.ItemLocationSettings.AsNoTracking()
            .Where(s => s.LocationId == query.LocationId && itemIds.Contains(s.ItemId))
            .ToDictionaryAsync(s => s.ItemId, s => new { s.MinQty, s.MaxQty }, ct);
        var minCover = (int)await db.GetSettingAsync(AppSettingKeys.MinCoverDays, ct);
        var maxCover = (int)await db.GetSettingAsync(AppSettingKeys.MaxCoverDays, ct);
        var days = to.DayNumber - from.DayNumber + 1;
        var trendStart = to.AddDays(-ConsumptionAnalysisRules.TrendWeeks * 7 + 1);
        var previousStart = trendStart.AddDays(-ConsumptionAnalysisRules.TrendWeeks * 7);

        var rows = daily.GroupBy(d => d.ItemId).Select(g =>
        {
            var item = items[g.Key];
            var total = g.Sum(d => d.Qty);
            var average = ConsumptionAnalysisRules.DailyAverage(total, days);
            // Monday first: DayOfWeek counts from Sunday.
            var byWeekday = Enumerable.Range(0, 7)
                .Select(i => InventoryMath.Round(g.Where(d => ((int)d.BusinessDate.DayOfWeek + 6) % 7 == i).Sum(d => d.Qty) / weeks))
                .ToList();
            decimal? trend = weeks < ConsumptionAnalysisRules.TrendWeeks * 2
                ? null
                : ConsumptionAnalysisRules.TrendPct(g.Where(d => d.BusinessDate >= trendStart).Sum(d => d.Qty),
                    g.Where(d => d.BusinessDate >= previousStart && d.BusinessDate < trendStart).Sum(d => d.Qty));
            var (min, max) = ConsumptionAnalysisRules.SuggestedMinMax(average, minCover, maxCover, item.Uom == UnitOfMeasure.PieceCode);
            var current = settings.GetValueOrDefault(g.Key);
            return new ConsumptionAnalysisRowDto(g.Key, item.Sku, item.Name, item.Uom, total, average, byWeekday, trend,
                current?.MinQty, current?.MaxQty, min, max);
        })
            .Where(r => r.Total > 0)
            .OrderBy(r => r.Sku)
            .ToList();
        return new ConsumptionAnalysisDto(query.LocationId, weeks, from, to, minCover, maxCover, rows);
    }
}
