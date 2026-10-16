using Sgo.Domain.Catalog;
using Sgo.Domain.Common;

namespace Sgo.UnitTests.Domain;

public class ItemTests
{
    private static ItemDefinition Valid() => new("har-001", " Harina de trigo ", ItemType.RawMaterial, Guid.NewGuid(), Guid.NewGuid(),
        Guid.NewGuid(), 25m, true, 180, StorageCondition.Ambient, 0m);

    private static IEnumerable<string> FieldsWithErrors(ItemDefinition d) => ItemRules.Check(d).Select(e => e.Field);

    [Fact]
    public void Valid_item_normalizes_sku_and_name()
    {
        var item = new Item(Valid());
        Assert.Equal("HAR-001", item.Sku);
        Assert.Equal("Harina de trigo", item.Name);
        Assert.Equal(25m, item.PurchaseToBaseFactor);
        Assert.True(item.IsActive);
    }

    [Fact]
    public void Without_purchase_unit_the_factor_is_one()
    {
        var item = new Item(Valid() with { PurchaseUomId = null, PurchaseToBaseFactor = null });
        Assert.Equal(1m, item.PurchaseToBaseFactor);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(-2)]
    public void Purchase_unit_requires_positive_factor(int? factor) =>
        Assert.Contains("purchaseToBaseFactor", FieldsWithErrors(Valid() with { PurchaseToBaseFactor = factor }));

    [Fact]
    public void Factor_admits_four_decimals_only() =>
        Assert.Contains("purchaseToBaseFactor", FieldsWithErrors(Valid() with { PurchaseToBaseFactor = 1.23456m }));

    [Theory]
    [InlineData("0.08")]
    [InlineData("16")]
    public void Tax_rate_must_be_zero_or_sixteen_percent(string rate) =>
        Assert.Contains("taxRate", FieldsWithErrors(Valid() with { TaxRate = decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture) }));

    [Fact]
    public void Shelf_life_must_be_positive() =>
        Assert.Contains("shelfLifeDays", FieldsWithErrors(Valid() with { ShelfLifeDays = 0 }));

    [Theory]
    [InlineData("")]
    [InlineData("HAR 001")]
    [InlineData("HAR/001")]
    public void Sku_is_required_and_without_spaces_or_symbols(string sku) =>
        Assert.Contains("sku", FieldsWithErrors(Valid() with { Sku = sku }));

    [Fact]
    public void Entity_refuses_invalid_definition() =>
        Assert.Throws<BusinessRuleException>(() => new Item(Valid() with { TaxRate = 0.5m }));

    [Fact]
    public void Min_max_rules()
    {
        Assert.Throws<BusinessRuleException>(() => new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), -1, 5));
        Assert.Throws<BusinessRuleException>(() => new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), 10, 5));
        var setting = new ItemLocationSetting(Guid.NewGuid(), Guid.NewGuid(), 5, 5);
        Assert.Equal(5, setting.MaxQty);
    }
}
