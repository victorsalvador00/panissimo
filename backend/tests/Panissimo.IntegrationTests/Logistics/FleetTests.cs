using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Catalog;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Logistics;

/// <summary>RN-113: vehicle and driver catalogs, chosen at dispatch.</summary>
[Collection(ApiCollection.Name)]
public class FleetTests(ApiFactory factory)
{
    private static string Plate() => $"T{Guid.NewGuid():N}"[..8].ToUpperInvariant();

    [Fact]
    public async Task A_dispatch_takes_an_active_vehicle_and_driver_and_keeps_their_text()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plate = Plate();
        var created = await admin.PostJsonAsync("/api/v1/vehicles", new CreateVehicleRequest($" {plate[..4].ToLowerInvariant()} {plate[4..]} ", "Nissan NP300"));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var vehicle = (await created.Content.ReadJsonAsync<VehicleDto>())!;
        Assert.Equal(plate, vehicle.Plate);
        var repeated = await admin.PostJsonAsync("/api/v1/vehicles", new CreateVehicleRequest(plate, "Otra"));
        Assert.Equal(HttpStatusCode.BadRequest, repeated.StatusCode);
        var driver = (await (await admin.PostJsonAsync("/api/v1/drivers", new CreateDriverRequest("Juan Pérez", "477 123 4567")))
            .Content.ReadJsonAsync<DriverDto>())!;

        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza");
        await factory.AddStockAsync(plant, bread.Id, 20, 2m);
        var transfer = (await (await admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(plant, branch, null, [new TransferLineRequest(bread.Id, null, 5)]))).Content.ReadJsonAsync<TransferDto>())!;

        // An inactive vehicle cannot dispatch.
        vehicle = (await (await admin.PutJsonAsync($"/api/v1/vehicles/{vehicle.Id}", new UpdateVehicleRequest(vehicle.Version, "Nissan NP300", false)))
            .Content.ReadJsonAsync<VehicleDto>())!;
        var inactive = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, vehicle.Id, driver.Id, null));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, inactive.StatusCode);
        Assert.Contains("vehicle_not_available", await inactive.Content.ReadAsStringAsync());
        Assert.DoesNotContain(await admin.GetJsonAsync<PagedResult<VehicleDto>>("/api/v1/vehicles?pageSize=100") is { } active ? active.Items : [],
            v => v.Id == vehicle.Id);

        await admin.PutJsonAsync($"/api/v1/vehicles/{vehicle.Id}", new UpdateVehicleRequest(vehicle.Version, "Nissan NP300", true));
        var dispatched = await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, vehicle.Id, driver.Id, null));
        Assert.Equal(HttpStatusCode.OK, dispatched.StatusCode);
        var result = (await dispatched.Content.ReadJsonAsync<TransferDto>())!;
        Assert.Equal(($"Nissan NP300 · {plate}", "Juan Pérez"), (result.VehicleDescription, result.DriverName));
    }

    [Fact]
    public async Task Only_logistics_manages_the_fleet_but_dispatchers_list_it()
    {
        var email = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var branchManager = await factory.LoginAsync(email);
        Assert.Equal(HttpStatusCode.OK, (await branchManager.GetAsync("/api/v1/vehicles")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await branchManager.PostJsonAsync("/api/v1/drivers", new CreateDriverRequest("Sin permiso", null))).StatusCode);

        var distributionEmail = ApiFactory.UniqueEmail("distribucion");
        await factory.CreateUserAsync(distributionEmail, ["distribution"], ["PLANTA"]);
        var distribution = await factory.LoginAsync(distributionEmail);
        Assert.Equal(HttpStatusCode.Created,
            (await distribution.PostJsonAsync("/api/v1/drivers", new CreateDriverRequest("Luis Gómez", null))).StatusCode);
    }
}
