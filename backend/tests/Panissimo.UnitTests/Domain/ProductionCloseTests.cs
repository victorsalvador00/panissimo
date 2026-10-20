using Panissimo.Domain.Common;
using Panissimo.Domain.Production;

namespace Panissimo.UnitTests.Domain;

public class ProductionCloseTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Sugar = Guid.NewGuid();

    private static ProductionOrder Released(decimal planned = 1000)
    {
        var recipe = new Recipe(Guid.NewGuid(), 1, 100, null, [new RecipeLineInput(Flour, 5, 0), new RecipeLineInput(Sugar, 1, 0)]);
        var order = new ProductionOrder("OP-000123", Guid.NewGuid(), new ProductionOrderPlan(recipe, planned, Today, null, null),
            ProductionOrderSource.Manual, null, Today);
        order.Release(Now, null);
        return order;
    }

    private static ProductionClose Close(ProductionOrder order, ProductionCloseKind kind, decimal produced, decimal flourActual, decimal flourCost = 20) =>
        new(Guid.NewGuid(), $"CP-{order.CloseCount + 1}", order, kind, Today, null, produced, null,
        [
            new CloseConsumption(Flour, produced / 100 * 5, flourActual, flourCost, []),
            new CloseConsumption(Sugar, produced / 100, produced / 100, 30, []),
        ], Now, null, null);

    [Fact]
    public void Lot_number_is_the_order_folio_and_two_digit_sequence() =>
        Assert.Equal(["OP-000123-01", "OP-000123-12"], new[] { 1, 12 }.Select(Released().LotNumberFor));

    [Theory]
    [InlineData(1100, false)]   // exactly planned + 10 %
    [InlineData(1100.0001, true)]
    public void Overrun_beyond_the_tolerance_is_allowed_and_flagged(decimal total, bool exceeds) =>
        Assert.Equal(exceeds, Released().EnsureCanClose(ProductionCloseKind.Partial, total, 10, null, null));

    [Fact]
    public void Overrun_counts_previous_closes()
    {
        var order = Released();
        order.RegisterClose(Close(order, ProductionCloseKind.Partial, 800, 40), null, null);

        Assert.True(order.EnsureCanClose(ProductionCloseKind.Final, 301, 10, null, null));
        Assert.False(order.EnsureCanClose(ProductionCloseKind.Final, 300, 10, null, null));
        Assert.False(order.ExceedsTolerance(10));
    }

    [Fact]
    public void Final_close_below_plan_needs_a_reason_and_notes_for_other()
    {
        var order = Released();

        Assert.Equal("production_shortfall_reason_required", Assert.Throws<BusinessRuleException>(() =>
            order.EnsureCanClose(ProductionCloseKind.Final, 900, 10, null, null)).Code);
        Assert.Equal("production_shortfall_notes_required", Assert.Throws<BusinessRuleException>(() =>
            order.EnsureCanClose(ProductionCloseKind.Final, 900, 10, ShortfallReason.Other, " ")).Code);
        order.EnsureCanClose(ProductionCloseKind.Final, 900, 10, ShortfallReason.MissingStaff, null);
        order.EnsureCanClose(ProductionCloseKind.Final, 1000, 10, null, null);
    }

    [Fact]
    public void Final_close_at_zero_needs_a_previous_close_and_partial_needs_output()
    {
        var order = Released();
        Assert.Equal("production_close_without_output", Assert.Throws<BusinessRuleException>(() =>
            order.EnsureCanClose(ProductionCloseKind.Final, 0, 10, ShortfallReason.DemandChange, null)).Code);
        Assert.Equal("production_close_without_output", Assert.Throws<BusinessRuleException>(() =>
            order.EnsureCanClose(ProductionCloseKind.Partial, 0, 10, null, null)).Code);

        order.RegisterClose(Close(order, ProductionCloseKind.Partial, 500, 25), null, null);
        order.EnsureCanClose(ProductionCloseKind.Final, 0, 10, ShortfallReason.DemandChange, null);
    }

    [Fact]
    public void Close_cost_is_its_real_consumption_and_the_order_accumulates_it()
    {
        var order = Released();

        var first = Close(order, ProductionCloseKind.Partial, 400, 22);   // flour 22 × 20 + sugar 4 × 30 = 560
        order.RegisterClose(first, null, null);
        var second = Close(order, ProductionCloseKind.Final, 500, 25, 21); // flour 25 × 21 + sugar 5 × 30 = 675
        order.RegisterClose(second, ShortfallReason.MissingMaterial, null);

        Assert.Equal((560m, 1.4m), (first.TotalCost, first.UnitCost));
        Assert.Equal((675m, 1.35m), (second.TotalCost, second.UnitCost));
        Assert.Equal((900m, 1235m, 1.3722m), (order.ProducedQty, order.TotalCost, order.UnitCost));
        Assert.Equal(47m, order.Lines.Single(l => l.ComponentItemId == Flour).ActualQty);
        Assert.Equal((ProductionOrderStatus.Completed, ShortfallReason.MissingMaterial), (order.Status, order.ShortfallReason!.Value));
    }

    [Fact]
    public void Waste_is_real_minus_theoretical_of_each_close()
    {
        var order = Released();
        var close = Close(order, ProductionCloseKind.Partial, 400, 22); // theoretical flour 20

        Assert.Equal(2m, close.WasteQty);
        Assert.Equal(40m, close.WasteCost);
        Assert.Equal(1, close.Sequence);
    }

    [Fact]
    public void Partial_close_moves_to_in_progress_which_cannot_be_cancelled()
    {
        var order = Released();
        order.RegisterClose(Close(order, ProductionCloseKind.Partial, 100, 5), null, null);

        Assert.Equal((ProductionOrderStatus.InProgress, 1), (order.Status, order.CloseCount));
        Assert.Equal("production_order_in_progress", Assert.Throws<BusinessRuleException>(() => order.Cancel(Now)).Code);

        order.RegisterClose(Close(order, ProductionCloseKind.Final, 900, 45), null, null);
        Assert.Equal("production_order_not_open", Assert.Throws<BusinessRuleException>(() =>
            order.EnsureCanClose(ProductionCloseKind.Partial, 1, 10, null, null)).Code);
    }

    [Fact]
    public void Draft_orders_cannot_be_closed() =>
        Assert.Equal("production_order_not_open", Assert.Throws<BusinessRuleException>(() =>
            new ProductionOrder("OP-1", Guid.NewGuid(), new ProductionOrderPlan(
                    new Recipe(Guid.NewGuid(), 1, 1, null, [new RecipeLineInput(Flour, 1, 0)]), 10, Today, null, null),
                ProductionOrderSource.Manual, null, Today).EnsureCanClose(ProductionCloseKind.Partial, 1, 10, null, null)).Code);
}
