using Panissimo.Application.Purchasing;

namespace Panissimo.UnitTests.Domain;

public class MaterialRequirementRulesTests
{
    [Theory]
    [InlineData(66, 20, 10, 44, 32)]   // required + min − stock − in transit
    [InlineData(66, 0, 100, 0, 0)]     // never negative
    [InlineData(10, 5, 0, 15, 0)]
    public void Shortage_is_required_plus_min_minus_stock_and_transit(decimal required, decimal min, decimal stock, decimal transit, decimal expected) =>
        Assert.Equal(expected, MaterialRequirementRules.Shortage(required, min, stock, transit));

    [Theory]
    [InlineData(32, 44, 1)]
    [InlineData(44, 44, 1)]
    [InlineData(44.0001, 44, 2)]
    [InlineData(0, 44, 0)]
    [InlineData(7.5, 1, 8)]            // without purchase unit: whole base units
    public void Purchase_quantity_is_rounded_up_to_whole_purchase_units(decimal shortage, decimal factor, decimal expected) =>
        Assert.Equal(expected, MaterialRequirementRules.PurchaseUnits(shortage, factor));
}
