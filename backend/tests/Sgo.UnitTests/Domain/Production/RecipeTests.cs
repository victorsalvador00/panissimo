using Sgo.Domain.Common;
using Sgo.Domain.Production;

namespace Sgo.UnitTests.Domain.Production;

public class RecipeTests
{
    private static readonly Guid Bread = Guid.NewGuid();
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Sugar = Guid.NewGuid();

    private static Recipe Create() => new(Bread, 1, 12, null, [new(Flour, 1.2m, 3), new(Sugar, 0.25m, 0)]);

    [Fact]
    public void RN11_theoretical_consumption_includes_waste()
    {
        var consumption = Create().Explode(30);

        // 30 / 12 × 1.2 × 1.03 = 3.09 ; 30 / 12 × 0.25 = 0.625
        Assert.Equal([(Flour, 3.09m), (Sugar, 0.625m)], consumption.Select(c => (c.ComponentItemId, c.Quantity)));
    }

    [Fact]
    public void RN11_consumption_is_rounded_to_four_decimals()
    {
        var recipe = new Recipe(Bread, 1, 7, null, [new(Flour, 1, 0)]);
        Assert.Equal(0.1429m, recipe.Explode(1).Single().Quantity); // 1/7
    }

    [Fact]
    public void RN10_editing_an_unused_recipe_changes_it_in_place()
    {
        var recipe = Create();

        var next = recipe.Revise(10, "Ajuste", [new(Flour, 1, 0)]);

        Assert.Null(next);
        Assert.Equal((1, 10m, true, 1), (recipe.VersionNumber, recipe.YieldQty, recipe.IsActive, recipe.Lines.Count));
    }

    [Fact]
    public void RN10_editing_a_used_recipe_creates_version_n_plus_1_and_keeps_the_old_one()
    {
        var recipe = Create();
        recipe.MarkUsed();

        var next = recipe.Revise(10, "Menos azúcar", [new(Flour, 1.2m, 3), new(Sugar, 0.2m, 0)]);

        Assert.NotNull(next);
        Assert.Equal((2, true, false, 10m), (next.VersionNumber, next.IsActive, next.IsUsed, next.YieldQty));
        Assert.False(recipe.IsActive);
        Assert.Equal((1, 12m, 0.25m), (recipe.VersionNumber, recipe.YieldQty, recipe.Lines.Single(l => l.ComponentItemId == Sugar).Quantity));
    }

    [Fact]
    public void Only_the_active_version_can_be_revised()
    {
        var recipe = Create();
        recipe.Deactivate();
        Assert.Equal("recipe_not_active", Assert.Throws<BusinessRuleException>(() => recipe.Revise(1, null, [new(Flour, 1, 0)])).Code);
    }

    [Theory]
    [InlineData(0, 1, 0, "recipe_invalid_yield")]
    [InlineData(12, 0, 0, "invalid_quantity")]
    [InlineData(12, 1, 101, "recipe_invalid_waste")]
    [InlineData(12, 1, -1, "recipe_invalid_waste")]
    public void Line_and_yield_rules(decimal yield, decimal qty, decimal waste, string code) =>
        Assert.Equal(code, Assert.Throws<BusinessRuleException>(() => new Recipe(Bread, 1, yield, null, [new(Flour, qty, waste)])).Code);

    [Fact]
    public void Components_cannot_repeat_nor_be_the_product_itself()
    {
        Assert.Equal("recipe_duplicated_component",
            Assert.Throws<BusinessRuleException>(() => new Recipe(Bread, 1, 1, null, [new(Flour, 1, 0), new(Flour, 2, 0)])).Code);
        Assert.Equal("recipe_self_component",
            Assert.Throws<BusinessRuleException>(() => new Recipe(Bread, 1, 1, null, [new(Bread, 1, 0)])).Code);
    }

    [Fact]
    public void Graph_detects_direct_and_indirect_cycles()
    {
        var dough = Guid.NewGuid();
        var filling = Guid.NewGuid();
        var graph = new Dictionary<Guid, IReadOnlyList<Guid>>
        {
            [dough] = [Flour, filling],
            [filling] = [Sugar],
        };

        Assert.False(RecipeGraph.CreatesCycle(Bread, [dough], graph));
        Assert.True(RecipeGraph.CreatesCycle(Sugar, [filling], new Dictionary<Guid, IReadOnlyList<Guid>> { [filling] = [Sugar] }));
        Assert.True(RecipeGraph.CreatesCycle(filling, [dough], graph)); // dough → filling
    }

    [Fact]
    public void Same_content_ignores_line_order()
    {
        var recipe = Create();
        Assert.True(recipe.HasSameContent(12, [new(Sugar, 0.25m, 0), new(Flour, 1.2m, 3)]));
        Assert.False(recipe.HasSameContent(12, [new(Flour, 1.2m, 3)]));
    }
}
