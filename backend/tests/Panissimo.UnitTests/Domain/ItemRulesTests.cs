using Panissimo.Application.Catalog;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.UnitTests.Domain;

public class ItemRulesTests
{
    private static ItemDefinition Definition(ItemType type = ItemType.RawMaterial, ItemPresentation? presentation = null) =>
        new("har-001", "Harina", type, Guid.NewGuid(), Guid.NewGuid(), null, null, false, null, StorageCondition.Ambient, 0m, presentation);

    private static IEnumerable<string> Fields(ItemDefinition d) => ItemRules.Check(d).Select(e => e.Field);

    [Fact]
    public void Raw_material_without_presentation_is_valid() => Assert.Empty(ItemRules.Check(Definition()));

    [Fact]
    public void Finished_goods_require_a_presentation_and_nothing_else_has_one()
    {
        Assert.Contains("presentation", Fields(Definition(ItemType.FinishedGood)));
        Assert.Empty(ItemRules.Check(Definition(ItemType.FinishedGood, ItemPresentation.Bulk)));
        Assert.Contains("presentation", Fields(Definition(ItemType.SemiFinished, ItemPresentation.Bulk)));
        Assert.Contains("presentation", Fields(Definition(ItemType.Supply, ItemPresentation.Packaged)));
    }

    [Fact]
    public void Only_packaged_items_link_to_a_bulk_item_and_have_units_per_package()
    {
        var bulk = Definition(ItemType.FinishedGood, ItemPresentation.Bulk) with { BulkItemId = Guid.NewGuid(), UnitsPerPackage = 6 };
        Assert.Contains("bulkItemId", Fields(bulk));
        Assert.Contains("unitsPerPackage", Fields(bulk));

        var packaged = Definition(ItemType.FinishedGood, ItemPresentation.Packaged) with { BulkItemId = Guid.NewGuid(), UnitsPerPackage = 6 };
        Assert.Empty(ItemRules.Check(packaged));
        Assert.Contains("unitsPerPackage", Fields(packaged with { UnitsPerPackage = 0 }));
    }

    [Theory]
    [InlineData(ItemType.RawMaterial, true)]
    [InlineData(ItemType.Supply, true)]
    [InlineData(ItemType.SemiFinished, false)]
    public void Only_produced_items_have_a_production_area(ItemType type, bool error)
    {
        var definition = Definition(type) with { ProductionAreaId = Guid.NewGuid() };
        Assert.Equal(error, Fields(definition).Contains("productionAreaId"));
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(-1, true)]
    [InlineData(0.12345, true)]
    [InlineData(12, false)]
    [InlineData(2.5, false)]
    public void Production_multiple_is_positive_with_four_decimals(double multiple, bool error) =>
        Assert.Equal(error, Fields(Definition() with { ProductionMultiple = (decimal)multiple }).Contains("productionMultiple"));

    [Fact]
    public void Unit_weight_is_positive_with_two_decimals()
    {
        Assert.Contains("unitWeightGrams", Fields(Definition() with { UnitWeightGrams = 0 }));
        Assert.Contains("unitWeightGrams", Fields(Definition() with { UnitWeightGrams = 85.125m }));
        Assert.Empty(ItemRules.Check(Definition() with { UnitWeightGrams = 85.5m }));
    }

    [Fact]
    public void Entity_defaults_the_multiple_to_one_and_normalizes_the_sku()
    {
        var item = new Item(Definition());

        Assert.Equal(1m, item.ProductionMultiple);
        Assert.Equal("HAR-001", item.Sku);
        Assert.Throws<BusinessRuleException>(() => item.Update(Definition(ItemType.FinishedGood)));
    }

    [Fact]
    public void Piece_counted_items_need_a_whole_multiple()
    {
        var piece = new UnitOfMeasure("pza", "Pieza", UomKind.Unit);
        var kilo = new UnitOfMeasure("kg", "Kilogramo", UomKind.Mass);

        Assert.False(ItemReferenceRules.MultipleFitsUnit(piece, 2.5m));
        Assert.True(ItemReferenceRules.MultipleFitsUnit(piece, 12m));
        Assert.True(ItemReferenceRules.MultipleFitsUnit(kilo, 2.5m));
        Assert.True(ItemReferenceRules.MultipleFitsUnit(piece, null));
    }

    [Fact]
    public void Min_max_must_be_ordered_and_not_negative()
    {
        Assert.Throws<BusinessRuleException>(() => new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), -1, 5));
        Assert.Throws<BusinessRuleException>(() => new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), 10, 5));
        Assert.Equal(5, new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), 5, 5).MaxQty);
    }

    [Fact]
    public void The_matriz_code_is_optional_upper_case_and_shaped_like_a_sku()
    {
        Assert.Empty(ItemRules.Check(Definition() with { InternalCode = " " }));
        Assert.Equal("SKU0001", ItemRules.NormalizeInternalCode(" sku0001 "));
        Assert.Null(ItemRules.NormalizeInternalCode(""));
        Assert.Contains("internalCode", Fields(Definition() with { InternalCode = "SKU 0001" }));
        Assert.Contains("internalCode", Fields(Definition() with { InternalCode = new string('A', ItemRules.SkuMaxLength + 1) }));

        var item = new Item(Definition() with { InternalCode = "sku0001" });
        Assert.Equal("SKU0001", item.InternalCode);
    }
}
