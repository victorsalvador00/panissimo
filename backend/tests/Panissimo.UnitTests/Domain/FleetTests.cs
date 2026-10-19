using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;

namespace Panissimo.UnitTests.Domain;

/// <summary>RN-113: vehicles and drivers of the fleet.</summary>
public class FleetTests
{
    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Fact]
    public void Plates_are_stored_in_upper_case_without_spaces()
    {
        var vehicle = new Vehicle(" gto 12-345 ", " Nissan NP300 ");
        Assert.Equal(("GTO12-345", "Nissan NP300", "Nissan NP300 · GTO12-345", true),
            (vehicle.Plate, vehicle.Description, vehicle.Label, vehicle.IsActive));
        Assert.Equal("vehicle_invalid_plate", Code(() => new Vehicle("GTO_12", "x")));
        Assert.Equal("vehicle_invalid_plate", Code(() => new Vehicle(new string('A', Vehicle.PlateMaxLength + 1), "x")));
        Assert.Equal("vehicle_invalid_description", Code(() => new Vehicle("ABC-1", " ")));
    }

    [Fact]
    public void A_driver_needs_a_name_and_the_phone_is_optional()
    {
        var driver = new Driver(" Juan Pérez ", " ");
        Assert.Equal(("Juan Pérez", null), (driver.Name, driver.Phone));
        Assert.Equal("driver_invalid_name", Code(() => new Driver(" ", null)));
        Assert.Equal("driver_invalid_phone", Code(() => new Driver("Ana", new string('5', Driver.PhoneMaxLength + 1))));
    }

    [Fact]
    public void A_dispatch_needs_an_active_vehicle_and_driver()
    {
        var vehicle = new Vehicle("ABC-123", "Camioneta");
        var driver = new Driver("Ana", null);
        FleetRules.EnsureCanDispatch(vehicle, driver);
        Assert.Equal("vehicle_not_available", Code(() => FleetRules.EnsureCanDispatch(null, driver)));
        driver.Deactivate();
        Assert.Equal("driver_not_available", Code(() => FleetRules.EnsureCanDispatch(vehicle, driver)));
    }
}
