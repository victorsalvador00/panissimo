using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.UnitTests.Domain;

public class LocationTests
{
    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Fact]
    public void A_warehouse_hangs_from_a_plant_or_branch()
    {
        var plant = new Location("planta", "Planta", LocationType.Plant);
        var warehouse = Location.Warehouse(" planta-mp ", "Materias primas", plant);
        Assert.Equal(("PLANTA-MP", LocationType.Warehouse, plant.Id, true), (warehouse.Code, warehouse.Type, warehouse.ParentLocationId, warehouse.IsWarehouse));
        Assert.False(warehouse.CanProduce);
        Assert.Null(plant.ParentLocationId);
    }

    [Fact]
    public void A_warehouse_needs_an_active_plant_or_branch_as_parent()
    {
        var branch = new Location("SUC-01", "Centro", LocationType.Branch);
        var warehouse = Location.Warehouse("SUC-01-V", "Vitrina", branch);
        Assert.Equal("warehouse_parent_invalid", Code(() => Location.Warehouse("SUC-01-X", "Sub de sub", warehouse)));
        Assert.Equal("warehouse_parent_required", Code(() => new Location("X", "Sin padre", LocationType.Warehouse)));

        branch.Deactivate();
        Assert.Equal("location_inactive", Code(() => Location.Warehouse("SUC-01-B", "Bodega", branch)));
    }
}
