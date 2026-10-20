using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.UnitTests.Domain;

public class ProductionOrderTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid Flour = Guid.NewGuid();

    private static Recipe ActiveRecipe() => new(Guid.NewGuid(), 1, 120, null, [new RecipeLineInput(Flour, 6, 2)]);

    private static ProductionOrder Draft(Recipe? recipe = null) =>
        new("OP-000001", Guid.NewGuid(), new ProductionOrderPlan(recipe ?? ActiveRecipe(), 240, Today, Shift.Night, null),
            ProductionOrderSource.Manual, null, Today);

    [Fact]
    public void Draft_takes_the_theoretical_consumption_of_the_planned_quantity()
    {
        var order = Draft();

        Assert.Equal(ProductionOrderStatus.Draft, order.Status);
        Assert.Equal(12.24m, order.Lines.Single().TheoreticalQty); // 240 / 120 × 6 × 1.02
        Assert.Equal((240m, true), (order.PendingQty, order.IsOpen));
    }

    [Fact]
    public void An_inactive_recipe_cannot_be_used()
    {
        var recipe = ActiveRecipe();
        recipe.Deactivate();

        Assert.Equal("recipe_not_active", Assert.Throws<BusinessRuleException>(() => Draft(recipe)).Code);
    }

    [Fact]
    public void Past_dates_and_invalid_quantities_are_rejected()
    {
        Assert.Equal("production_order_past_date", Assert.Throws<BusinessRuleException>(() =>
            new ProductionOrder("OP-1", Guid.NewGuid(), new ProductionOrderPlan(ActiveRecipe(), 10, Today.AddDays(-1), null, null),
                ProductionOrderSource.Manual, null, Today)).Code);
        Assert.Equal("invalid_quantity", Assert.Throws<BusinessRuleException>(() =>
            new ProductionOrder("OP-1", Guid.NewGuid(), new ProductionOrderPlan(ActiveRecipe(), 0, Today, null, null),
                ProductionOrderSource.Manual, null, Today)).Code);
    }

    [Fact]
    public void Draft_is_edited_released_and_then_no_longer_edited()
    {
        var order = Draft();
        order.UpdateDraft(new ProductionOrderPlan(ActiveRecipe(), 120, Today.AddDays(1), Shift.Day, "x"), Today);
        Assert.Equal((120m, Shift.Day), (order.PlannedQty, order.Shift));

        order.Release(Now, Guid.NewGuid());

        Assert.Equal(ProductionOrderStatus.Released, order.Status);
        Assert.Equal("production_order_not_draft", Assert.Throws<BusinessRuleException>(() =>
            order.UpdateDraft(new ProductionOrderPlan(ActiveRecipe(), 1, Today, null, null), Today)).Code);
        Assert.Equal("production_order_not_draft", Assert.Throws<BusinessRuleException>(() => order.Release(Now, null)).Code);
    }

    [Fact]
    public void Draft_and_released_orders_without_closes_can_be_cancelled_once()
    {
        var draft = Draft();
        draft.Cancel(Now);
        Assert.Equal((ProductionOrderStatus.Cancelled, false), (draft.Status, draft.IsOpen));
        Assert.Equal("production_order_finished", Assert.Throws<BusinessRuleException>(() => draft.Cancel(Now)).Code);

        var released = Draft();
        released.Release(Now, null);
        released.Cancel(Now);
        Assert.Equal(ProductionOrderStatus.Cancelled, released.Status);
        Assert.Equal("production_order_not_draft", Assert.Throws<BusinessRuleException>(() => released.Release(Now, null)).Code);
    }
}
