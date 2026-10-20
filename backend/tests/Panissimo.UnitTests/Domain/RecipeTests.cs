using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.UnitTests.Domain;

public class RecipeTests
{
    private static readonly Guid Bread = Guid.NewGuid();
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Bag = Guid.NewGuid();

    private static Recipe Create(decimal yield = 120) =>
        new(Bread, 1, yield, null, [new RecipeLineInput(Flour, 6, 2), new RecipeLineInput(Bag, 10, 0)]);

    [Fact]
    public void Theoretical_consumption_scales_by_yield_and_adds_waste()
    {
        var consumption = Create().Explode(300).ToDictionary(c => c.ComponentItemId, c => c.Quantity);

        Assert.Equal(15.3m, consumption[Flour]); // 300 / 120 × 6 × 1.02
        Assert.Equal(25m, consumption[Bag]);
    }

    [Fact]
    public void Theoretical_is_rounded_to_four_decimals() =>
        Assert.Equal(0.3333m, RecipeRules.Theoretical(1, 3, 1, 0));

    [Fact]
    public void Unused_recipe_is_edited_in_place()
    {
        var recipe = Create();

        var next = recipe.Revise(100, "nueva", [new RecipeLineInput(Flour, 5, 0)]);

        Assert.Null(next);
        Assert.Equal((100m, 1, true), (recipe.YieldQty, recipe.VersionNumber, recipe.IsActive));
    }

    [Fact]
    public void Used_recipe_creates_version_n_plus_one_and_deactivates_the_old_one()
    {
        var recipe = Create();
        recipe.MarkUsed();

        var next = recipe.Revise(100, null, [new RecipeLineInput(Flour, 5, 0)])!;

        Assert.Equal((2, true, false), (next.VersionNumber, next.IsActive, next.IsUsed));
        Assert.False(recipe.IsActive);
        Assert.Equal(120m, recipe.YieldQty);
        Assert.Equal("recipe_not_active", Assert.Throws<BusinessRuleException>(() => recipe.Revise(1, null, [new RecipeLineInput(Flour, 1, 0)])).Code);
    }

    [Theory]
    [InlineData(-1, "recipe_invalid_waste")]
    [InlineData(100.5, "recipe_invalid_waste")]
    [InlineData(2.555, "recipe_invalid_waste")]
    public void Waste_is_a_percentage_with_two_decimals(double waste, string code) =>
        Assert.Equal(code, Assert.Throws<BusinessRuleException>(() =>
            new Recipe(Bread, 1, 1, null, [new RecipeLineInput(Flour, 1, (decimal)waste)])).Code);

    [Fact]
    public void Lines_cannot_repeat_or_contain_the_product()
    {
        Assert.Equal("recipe_duplicated_component", Assert.Throws<BusinessRuleException>(() =>
            new Recipe(Bread, 1, 1, null, [new RecipeLineInput(Flour, 1, 0), new RecipeLineInput(Flour, 2, 0)])).Code);
        Assert.Equal("recipe_self_component", Assert.Throws<BusinessRuleException>(() =>
            new Recipe(Bread, 1, 1, null, [new RecipeLineInput(Bread, 1, 0)])).Code);
    }

    [Theory]
    [InlineData(ItemType.RawMaterial, false, true)]
    [InlineData(ItemType.Supply, false, true)]
    [InlineData(ItemType.SemiFinished, true, true)]
    public void Produced_items_and_components_follow_d04(ItemType type, bool produced, bool component)
    {
        Assert.Equal(produced, RecipeRules.CanBeProduced(type));
        Assert.Equal(component, RecipeRules.CanBeComponent(type, null, ItemType.FinishedGood, ItemPresentation.Bulk));
        Assert.Equal(component, RecipeRules.CanBeComponent(type, null, ItemType.SemiFinished, null));
    }

    [Theory]
    [InlineData(ItemPresentation.Bulk, ItemType.FinishedGood, ItemPresentation.Packaged, true)]
    [InlineData(ItemPresentation.Bulk, ItemType.FinishedGood, ItemPresentation.Bulk, false)]
    [InlineData(ItemPresentation.Bulk, ItemType.SemiFinished, null, false)]
    [InlineData(ItemPresentation.Packaged, ItemType.FinishedGood, ItemPresentation.Packaged, false)]
    [InlineData(ItemPresentation.Packaged, ItemType.FinishedGood, ItemPresentation.Bulk, false)]
    public void A_finished_good_is_a_component_only_when_bulk_goes_into_packaged_rn119(
        ItemPresentation presentation, ItemType outputType, ItemPresentation? outputPresentation, bool component)
    {
        Assert.True(RecipeRules.CanBeProduced(ItemType.FinishedGood));
        Assert.Equal(component, RecipeRules.CanBeComponent(ItemType.FinishedGood, presentation, outputType, outputPresentation));
    }

    [Fact]
    public void Cycles_through_other_active_recipes_are_detected()
    {
        var dough = Guid.NewGuid();
        var filling = Guid.NewGuid();
        var graph = new Dictionary<Guid, IReadOnlyList<Guid>> { [dough] = [Flour, filling], [filling] = [Bag] };

        Assert.False(RecipeGraph.CreatesCycle(Bread, [dough], graph));
        Assert.True(RecipeGraph.CreatesCycle(filling, [dough], graph));
    }

    [Fact]
    public void Only_the_factory_changing_keeps_the_formula()
    {
        var recipe = Create();
        Assert.True(recipe.HasFormula(120, " ", [new RecipeLineInput(Bag, 10, 0), new RecipeLineInput(Flour, 6, 2)]));
        Assert.False(recipe.HasFormula(120, null, [new RecipeLineInput(Flour, 6, 2)]));
        Assert.False(recipe.HasFormula(120, null, [new RecipeLineInput(Flour, 6, 3), new RecipeLineInput(Bag, 10, 0)]));
        Assert.False(recipe.HasFormula(100, null, [new RecipeLineInput(Flour, 6, 2), new RecipeLineInput(Bag, 10, 0)]));
    }

    [Fact]
    public void A_plant_with_a_factory_only_produces_recipes_of_its_factories()
    {
        static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;
        var plant = new Location("PLANTA", "Planta", LocationType.Plant);
        var other = new Location("PLANTA-2", "Otra planta", LocationType.Plant);
        var factory = Location.Factory("PLANTA-FAB", "Fábrica", plant);

        RecipeRules.EnsureFactory("PAN", factory, plant.Id, plantHasFactory: true);
        RecipeRules.EnsureFactory("PAN", null, other.Id, plantHasFactory: false);
        Assert.Equal("recipe_factory_required", Code(() => RecipeRules.EnsureFactory("PAN", null, plant.Id, plantHasFactory: true)));
        Assert.Equal("recipe_factory_other_plant", Code(() => RecipeRules.EnsureFactory("PAN", factory, other.Id, plantHasFactory: false)));

        factory.Deactivate();
        Assert.Equal("recipe_factory_other_plant", Code(() => RecipeRules.EnsureFactory("PAN", factory, plant.Id, plantHasFactory: false)));
    }
}
