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

    [Fact]
    public void A_factory_hangs_only_from_a_plant_and_holds_stock_like_a_warehouse()
    {
        var plant = new Location("PLANTA", "Planta", LocationType.Plant);
        var factory = Location.Factory("fabrica", "Fábrica", plant);
        Assert.Equal(("FABRICA", LocationType.Factory, plant.Id, true, true), (factory.Code, factory.Type, factory.ParentLocationId, factory.IsWarehouse, factory.IsFactory));
        Assert.False(factory.CanProduce);

        var branch = new Location("SUC-01", "Centro", LocationType.Branch);
        Assert.Equal("factory_parent_invalid", Code(() => Location.Factory("SUC-01-F", "Fábrica", branch)));
        Assert.Equal("factory_parent_invalid", Code(() => Location.Factory("PLANTA-X", "Fábrica", factory)));
        Assert.Equal("factory_parent_required", Code(() => new Location("F", "Sin padre", LocationType.Factory)));
    }

    [Fact]
    public void With_an_active_factory_a_close_only_consumes_from_and_delivers_to_a_factory()
    {
        var plant = new Location("PLANTA", "Planta", LocationType.Plant);
        var factory = Location.Factory("PLANTA-FAB", "Fábrica", plant);
        var rawMaterials = Location.Warehouse("PLANTA-MP", "Materias primas", plant);
        var children = new[] { factory, rawMaterials };

        Location.EnsureProductionFloor(children, factory, consumption: true);
        Assert.Equal("close_requires_factory", Code(() => Location.EnsureProductionFloor(children, rawMaterials, consumption: true)));
        Assert.Equal("close_requires_factory", Code(() => Location.EnsureProductionFloor(children, rawMaterials, consumption: false)));

        // Without an active factory any sub-warehouse is valid (RN-45).
        factory.Deactivate();
        Location.EnsureProductionFloor(children, rawMaterials, consumption: true);
        Location.EnsureProductionFloor([rawMaterials], rawMaterials, consumption: false);
    }
}
