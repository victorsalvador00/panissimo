using Panissimo.Application.Inventory;
using Panissimo.Application.Production;

namespace Panissimo.UnitTests.Domain;

public class ConsumptionAnalysisRulesTests
{
    [Fact]
    public void The_period_is_whole_weeks_ending_yesterday()
    {
        var (from, to) = ConsumptionAnalysisRules.Period(new DateOnly(2026, 10, 17), 8);
        Assert.Equal((new DateOnly(2026, 8, 22), new DateOnly(2026, 10, 16)), (from, to));
        Assert.Equal(56, to.DayNumber - from.DayNumber + 1);
    }

    [Theory]
    [InlineData(560, 56, 10)]
    [InlineData(100, 56, 1.7857)]
    [InlineData(0, 56, 0)]
    public void Daily_average_is_total_over_days(decimal total, int days, decimal expected) =>
        Assert.Equal(expected, ConsumptionAnalysisRules.DailyAverage(total, days));

    [Theory]
    [InlineData(336, 224, 50.0)]
    [InlineData(200, 400, -50.0)]
    [InlineData(100, 0, null)]    // nothing before: no trend
    public void Trend_compares_the_last_four_weeks_with_the_four_before(decimal last, decimal previous, double? expected) =>
        Assert.Equal(expected is null ? null : (decimal)expected, ConsumptionAnalysisRules.TrendPct(last, previous));

    [Theory]
    [InlineData(10, 2, 7, true, 20, 70)]
    [InlineData(1.7857, 2, 7, true, 4, 13)]           // whole pieces, rounded up
    [InlineData(1.7857, 2, 7, false, 3.5714, 12.4999)] // other units keep 4 decimals, rounded up
    [InlineData(0.33333, 2, 7, false, 0.6667, 2.3334)]
    [InlineData(5, 3, 1, true, 15, 15)]               // the maximum never below the minimum
    [InlineData(0, 2, 7, true, 0, 0)]
    public void Suggested_min_and_max_are_the_average_times_the_cover_days_rounded_up(
        decimal average, int minCover, int maxCover, bool whole, decimal expectedMin, decimal expectedMax) =>
        Assert.Equal((expectedMin, expectedMax), ConsumptionAnalysisRules.SuggestedMinMax(average, minCover, maxCover, whole));
}

public class RecipeCostMathTests
{
    [Theory]
    [InlineData(5, 0, 20, 100)]
    [InlineData(1, 10, 11, 12.1)]       // waste raises the quantity costed
    [InlineData(0.333, 2.5, 3, 1.0240)] // 0.333 × 1.025 × 3 = 1.023975
    public void Line_cost_includes_the_expected_waste(decimal quantity, decimal wastePct, decimal cost, decimal expected) =>
        Assert.Equal(expected, RecipeCostMath.LineCost(quantity, wastePct, cost));

    [Theory]
    [InlineData(112.1, 100, 1.121)]
    [InlineData(10, 3, 3.3333)]
    [InlineData(10, 0, 0)]
    public void Unit_cost_is_the_total_over_the_yield(decimal total, decimal yieldQty, decimal expected) =>
        Assert.Equal(expected, RecipeCostMath.UnitCost(total, yieldQty));
}
