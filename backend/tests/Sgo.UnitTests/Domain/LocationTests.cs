using Sgo.Domain.Organization;

namespace Sgo.UnitTests.Domain;

public class LocationTests
{
    [Theory]
    [InlineData(LocationType.Branch, false)]
    [InlineData(LocationType.Factory, true)]
    [InlineData(LocationType.Commissary, true)]
    public void Only_factory_and_commissary_produce_supply_and_purchase(LocationType type, bool expected)
    {
        var location = new Location("X", "X", type);
        Assert.Equal(expected, location.CanProduce);
        Assert.Equal(expected, location.CanSupplyBranches);
        Assert.Equal(expected, location.CanPurchase);
    }

    [Fact]
    public void Code_is_normalized_and_new_location_is_active()
    {
        var location = new Location(" suc-11 ", " Sucursal 11 ", LocationType.Branch, "  ");
        Assert.Equal("SUC-11", location.Code);
        Assert.Equal("Sucursal 11", location.Name);
        Assert.Null(location.Address);
        Assert.True(location.IsActive);
    }
}
