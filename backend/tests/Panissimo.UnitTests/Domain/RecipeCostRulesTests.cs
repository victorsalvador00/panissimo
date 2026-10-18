using Panissimo.Application.Production;

namespace Panissimo.UnitTests.Domain;

public class RecipeCostRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);

    [Theory]
    [InlineData(10.5, 10, 5, 0, 5.0)]       // exactly the threshold counts
    [InlineData(10.49, 10, 5, 0, null)]   // below it does not
    [InlineData(12, 10, 5, 30, 20.0)]       // 30 days old still counts
    [InlineData(12, 10, 5, 31, null)]     // 31 days old does not
    [InlineData(9, 10, 0, 0, null)]       // a decrease never counts
    [InlineData(10, 10, 0, 0, null)]      // nor the same cost
    [InlineData(10, 0, 5, 0, null)]       // without a previous cost there is nothing to compare
    public void A_component_rose_if_its_last_receipt_cost_exceeds_the_previous_by_the_threshold_within_30_days(
        decimal last, decimal previous, decimal alertPct, int daysAgo, double? expected)
    {
        var increase = RecipeCostRules.Increase(new ReceiptCost(last, Today.AddDays(-daysAgo)), new ReceiptCost(previous, Today.AddDays(-60)),
            alertPct, Today);
        Assert.Equal(expected is null ? null : (decimal)expected, increase);
    }

    [Fact]
    public void A_single_receipt_is_not_an_increase() =>
        Assert.Null(RecipeCostRules.Increase(new ReceiptCost(12, Today), null, 5, Today));

    [Theory]
    [InlineData(105, 10, 10.5)]   // lots of one receipt count once, at their weighted cost
    [InlineData(0, 0, 0)]
    public void Receipt_cost_is_weighted_by_quantity(decimal total, decimal quantity, decimal expected) =>
        Assert.Equal(expected, RecipeCostRules.UnitCost(total, quantity));
}
