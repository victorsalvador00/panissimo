using Panissimo.Domain.Production;

namespace Panissimo.UnitTests.Domain;

public class ProductionPlanCalculatorTests
{
    private static readonly DateOnly D1 = new(2026, 10, 18);
    private static readonly DateOnly D2 = D1.AddDays(1);
    private static readonly DateOnly D3 = D1.AddDays(2);
    private static readonly Guid Item = Guid.NewGuid();

    private static PlanDemand Branch(DateOnly date, decimal qty, string folio = "PED-1") =>
        new(Item, DemandType.BranchOrderLine, Guid.NewGuid(), Guid.NewGuid(), folio, "Sucursal Centro", date, qty);

    private static PlanDemand Customer(DateOnly date, decimal qty) =>
        new(Item, DemandType.CustomerOrderLine, Guid.NewGuid(), Guid.NewGuid(), "PC-1", "Cafeterías", date, qty);

    private static PlanItemInput Input(decimal stock, IReadOnlyList<PlanDemand> demands, IReadOnlyList<PlanSupply>? supplies = null,
        decimal multiple = 1, bool pieces = false, decimal? min = null, decimal? max = null) =>
        new(Item, stock, multiple, pieces, min, max, demands, supplies ?? []);

    private static IReadOnlyList<PlanDay> Plan(PlanItemInput input, DateOnly? to = null) =>
        ProductionPlanCalculator.Calculate(input, D1, to ?? D3);

    [Fact]
    public void Stock_covers_the_closest_days_first_and_the_shortfall_is_suggested_on_its_day()
    {
        var days = Plan(Input(100, [Branch(D1, 60), Customer(D2, 30), Branch(D3, 50, "PED-2")]));

        Assert.Equal([D1, D2, D3], days.Select(d => d.Date));
        Assert.Equal([0m, 0m, 40m], days.Select(d => d.SuggestedQty));
        Assert.Equal([100m, 40m, 10m], days.Select(d => d.StartingStock));
        Assert.Equal((0m, 30m), (days[1].BranchOrders, days[1].CustomerOrders));
    }

    [Fact]
    public void Suggested_for_a_day_counts_as_covered_for_the_next_ones_and_rounds_up_to_the_multiple()
    {
        var days = Plan(Input(0, [Branch(D1, 10), Branch(D2, 10)], multiple: 24));
        Assert.Equal([24m, 0m], days.Select(d => d.SuggestedQty)); // the 14 left over from day 1 covers day 2
        Assert.Equal(14m, days[1].StartingStock);
    }

    [Fact]
    public void An_open_order_covers_from_its_date_and_later_orders_do_not_cover_earlier_days()
    {
        var days = Plan(Input(0, [Branch(D1, 50), Branch(D3, 50)], [new PlanSupply(Item, D2, 80)]));
        Assert.Equal([50m, 0m, 0m], days.Select(d => d.SuggestedQty));
        Assert.Equal(80m, days.Single(d => d.Date == D2).OpenOrders);
    }

    [Fact]
    public void Orders_and_demand_dated_before_the_range_count_on_the_first_day()
    {
        var days = Plan(Input(0, [Branch(D1.AddDays(-2), 20)], [new PlanSupply(Item, D1.AddDays(-1), 15)]));
        var first = days.Single();
        Assert.Equal((D1, 20m, 15m, 5m), (first.Date, first.BranchOrders, first.OpenOrders, first.SuggestedQty));
    }

    [Fact]
    public void Demand_and_orders_after_the_range_are_ignored()
    {
        Assert.Empty(Plan(Input(0, [Branch(D3.AddDays(1), 20)], [new PlanSupply(Item, D3.AddDays(1), 15)])));
    }

    [Fact]
    public void Pieces_round_to_whole_units()
    {
        var days = Plan(Input(0, [Branch(D1, 10.2m)], pieces: true));
        Assert.Equal(11m, days.Single().SuggestedQty);
        Assert.Equal(48m, ProductionPlanCalculator.RoundUp(25, 24, wholeQuantities: true));
        Assert.Equal(0m, ProductionPlanCalculator.RoundUp(-3, 24, wholeQuantities: false));
    }

    [Fact]
    public void Below_the_minimum_the_first_day_asks_to_end_the_range_at_the_maximum()
    {
        // Stock 30, orders 25 → would end at 5 < min 10: produce what leaves 50 in stock.
        var days = Plan(Input(30, [Branch(D2, 25)], min: 10, max: 50));
        Assert.Equal((50m, 20m), (days[0].StockReplenishment, days[0].SuggestedQty));
        Assert.Equal(25m, days[1].SuggestedQty);
        Assert.Equal(50m, 30 + days.Sum(d => d.SuggestedQty) - 25);
    }

    [Fact]
    public void At_or_above_the_minimum_there_is_no_replenishment()
    {
        Assert.Empty(Plan(Input(40, [Branch(D2, 25)], min: 10, max: 50) with { Demands = [] }));
        var days = Plan(Input(40, [Branch(D2, 30)], min: 10, max: 50));
        Assert.All(days, d => Assert.Equal(0m, d.StockReplenishment));
        Assert.Equal(0m, days.Sum(d => d.SuggestedQty));
    }

    [Fact]
    public void Parent_orders_are_demand_for_a_semi_finished_good()
    {
        var parent = new PlanDemand(Item, DemandType.ParentOrder, Guid.NewGuid(), Guid.NewGuid(), "OP-000010", "Concha", D2, 12.5m);
        var day = Plan(Input(2.5m, [parent])).Single();
        Assert.Equal((12.5m, 10m), (day.ParentOrders, day.SuggestedQty));
    }

    [Fact]
    public void A_demand_link_never_points_to_a_parent_order() =>
        Assert.Throws<ArgumentException>(() => new ProductionOrderDemand(Guid.NewGuid(), DemandType.ParentOrder, Guid.NewGuid(), 1));
}
