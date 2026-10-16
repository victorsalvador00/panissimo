using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Production;

namespace Sgo.UnitTests.Domain.Production;

public class ProductionOrderTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;
    private static readonly DateOnly Today = DateOnly.FromDateTime(Now.UtcDateTime);
    private static readonly Guid Location = Guid.NewGuid();
    private static readonly Guid Bread = Guid.NewGuid();
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Butter = Guid.NewGuid();

    // 1 kg of flour and 0.1 kg of butter per piece.
    private static readonly Recipe BreadRecipe = new(Bread, 1, 1, null, [new(Flour, 1, 0), new(Butter, 0.1m, 0)]);

    private static ProductionOrder Draft(decimal planned = 100) => new("OP-000001", Location, BreadRecipe, planned, Today, null);

    private static ProductionOrder Released()
    {
        var order = Draft();
        order.Release(Now);
        return order;
    }

    /// <summary>Runs the requests through the real posting core with stock of 200 flour at $10 and 20 butter at $50.</summary>
    private static IReadOnlyList<InventoryMovement> Post(IReadOnlyList<MovementRequest> requests)
    {
        var state = new PostingState
        {
            Items = new Dictionary<Guid, PostingItem>
            {
                [Flour] = new(Flour, "HAR", "Harina", false),
                [Butter] = new(Butter, "MAN", "Mantequilla", false),
                [Bread] = new(Bread, "PAN", "Pan", false),
            },
            Lots = new Dictionary<Guid, PostingLot>(),
            Balances = [],
            Costs = [],
            OccurredAt = Now,
            BusinessDate = Today,
        };
        InventoryPostingCalculator.Calculate(
            [new(Location, Flour, null, MovementType.PurchaseReceipt, 200, 10, "T", Guid.NewGuid(), "T", null),
             new(Location, Butter, null, MovementType.PurchaseReceipt, 20, 50, "T", Guid.NewGuid(), "T", null)], state);
        return InventoryPostingCalculator.Calculate(requests, state).Movements;
    }

    [Fact]
    public void Lines_hold_the_theoretical_consumption_of_the_planned_quantity()
    {
        var order = Draft(100);
        Assert.Equal([(Flour, 100m), (Butter, 10m)], order.Lines.Select(l => (l.ComponentItemId, l.TheoreticalQty)));
        Assert.Equal(BreadRecipe.Id, order.RecipeId);
    }

    [Fact]
    public void RN12_unit_cost_is_consumed_cost_over_produced_quantity()
    {
        var order = Released();
        var consumption = Post(order.ConsumptionRequests(BreadRecipe, 90, [new(Flour, 95, null)]));

        var output = order.Complete(BreadRecipe, 90, consumption, null, Now, null);

        // flour 95 × 10 + butter (default: theoretical for 90 = 9) × 50 = 1400 → 1400 / 90
        Assert.Equal(ProductionOrderStatus.Completed, order.Status);
        Assert.Equal((90m, 15.5556m), (order.ProducedQty!.Value, order.UnitCost!.Value));
        Assert.Equal((MovementType.ProductionOutput, 90m, (decimal?)15.5556m, Bread), (output.Type, output.Quantity, output.UnitCost, output.ItemId));
    }

    [Fact]
    public void RN13_waste_is_measured_against_the_theoretical_for_the_produced_quantity()
    {
        var order = Released();
        order.Complete(BreadRecipe, 90, Post(order.ConsumptionRequests(BreadRecipe, 90, [new(Flour, 95, null)])), null, Now, null);

        var flour = order.Lines.Single(l => l.ComponentItemId == Flour);
        Assert.Equal((100m, 90m, 95m, 5m), (flour.TheoreticalQty, flour.TheoreticalProducedQty!.Value, flour.ActualQty!.Value, flour.WasteQty!.Value));
        var butter = order.Lines.Single(l => l.ComponentItemId == Butter);
        Assert.Equal(0m, butter.WasteQty); // defaulted to the theoretical for 90
    }

    [Fact]
    public void Chosen_lots_must_add_up_to_the_actual_consumption()
    {
        var order = Released();
        var ex = Assert.Throws<BusinessRuleException>(() =>
            order.ConsumptionRequests(BreadRecipe, 10, [new(Flour, 10, [new ComponentLotInput(Guid.NewGuid(), 4)])]));
        Assert.Equal("production_lots_mismatch", ex.Code);
    }

    [Fact]
    public void Only_recipe_components_can_be_consumed_and_zero_consumes_nothing()
    {
        var order = Released();
        Assert.Equal("production_unknown_component",
            Assert.Throws<BusinessRuleException>(() => order.ConsumptionRequests(BreadRecipe, 10, [new(Guid.NewGuid(), 1, null)])).Code);

        var requests = order.ConsumptionRequests(BreadRecipe, 10, [new(Butter, 0, null)]);
        Assert.Equal([Flour], requests.Select(r => r.ItemId));
    }

    [Fact]
    public void RN14_produced_quantity_must_be_positive() =>
        Assert.Equal("production_invalid_quantity",
            Assert.Throws<BusinessRuleException>(() => Released().ConsumptionRequests(BreadRecipe, 0, [])).Code);

    [Fact]
    public void Editing_the_draft_recomputes_the_theoretical_consumption()
    {
        var order = Draft(100);
        order.UpdateDraft(BreadRecipe, 50, Today.AddDays(1), "Menos");
        Assert.Equal(50m, order.Lines.Single(l => l.ComponentItemId == Flour).TheoreticalQty);
    }

    [Fact]
    public void The_order_keeps_its_recipe_version()
    {
        var v2 = new Recipe(Bread, 2, 1, null, [new(Flour, 2, 0)]);
        Assert.Throws<ArgumentException>(() => Draft().UpdateDraft(v2, 10, Today, null));
    }

    private static ProductionOrder Completed()
    {
        var order = Released();
        order.Complete(BreadRecipe, 10, Post(order.ConsumptionRequests(BreadRecipe, 10, [])), null, Now, null);
        return order;
    }

    private static ProductionOrder Cancelled()
    {
        var order = Draft();
        order.Cancel();
        return order;
    }

    public static TheoryData<string, Func<ProductionOrder>, Action<ProductionOrder>> InvalidTransitions => new()
    {
        { "release released", Released, o => o.Release(Now) },
        { "release completed", Completed, o => o.Release(Now) },
        { "release cancelled", Cancelled, o => o.Release(Now) },
        { "complete draft", () => Draft(), o => o.ConsumptionRequests(BreadRecipe, 1, []) },
        { "complete completed", Completed, o => o.ConsumptionRequests(BreadRecipe, 1, []) },
        { "complete cancelled", Cancelled, o => o.ConsumptionRequests(BreadRecipe, 1, []) },
        { "edit released", Released, o => o.UpdateDraft(BreadRecipe, 1, Today, null) },
        { "edit completed", Completed, o => o.UpdateDraft(BreadRecipe, 1, Today, null) },
        { "cancel completed", Completed, o => o.Cancel() },
        { "cancel cancelled", Cancelled, o => o.Cancel() },
    };

    [Theory]
    [MemberData(nameof(InvalidTransitions))]
    public void Invalid_transitions_throw(string name, Func<ProductionOrder> create, Action<ProductionOrder> act)
    {
        var order = create();
        Assert.False(string.IsNullOrEmpty(Assert.Throws<BusinessRuleException>(() => act(order)).Code), name);
    }

    [Fact]
    public void Released_orders_can_still_be_cancelled()
    {
        var order = Released();
        order.Cancel();
        Assert.Equal(ProductionOrderStatus.Cancelled, order.Status);
    }
}
