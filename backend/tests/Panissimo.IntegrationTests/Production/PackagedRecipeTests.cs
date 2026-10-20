using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

/// <summary>
/// RN-119: a packaged good is produced from its bulk good and its packaging. On a plant of its own, so the plan only sees
/// these items. Moves inventory (the close).
/// </summary>
[Collection(ApiCollection.Name)]
public class PackagedRecipeTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    private async Task<LocationDto> WarehouseAsync(HttpClient admin, LocationDto plant, string suffix, ItemType supplies)
    {
        var warehouse = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"{plant.Code}-{suffix}", suffix, LocationType.Warehouse, null, plant.Id)));
        return await OkAsync<LocationDto>(admin.PutJsonAsync($"/api/v1/locations/{warehouse.Id}",
            new UpdateLocationRequest(warehouse.Version, warehouse.Name, null, true, [supplies])));
    }

    [Fact]
    public async Task A_packaged_good_consumes_its_bulk_good_which_the_plan_asks_to_produce()
    {
        var admin = await factory.LoginAsAdminAsync();
        // "PLT…" sorts after PLANTA: the services that take the first plant by code keep taking PLANTA.
        var plant = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"PLT{Guid.NewGuid():N}"[..8].ToUpperInvariant(), "Planta de empaque", LocationType.Plant, null)));
        var finished = await WarehouseAsync(admin, plant, "PT", ItemType.FinishedGood);
        var supplies = await WarehouseAsync(admin, plant, "INS", ItemType.Supply);
        var bulk = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza");
        var otherBulk = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");
        var packaged = await factory.CreateItemAsync("BOMBAEMP", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);
        var otherPackaged = await factory.CreateItemAsync("CONCHAEMP", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);
        var bag = await factory.CreateItemAsync("BOLSA", ItemType.Supply, "pza");

        // A bulk good goes only into a packaged one; a packaged good is never a component.
        var bulkInBulk = await admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(otherBulk.Id, 1, null, [new RecipeLineRequest(bulk.Id, 1, 0)]));
        Assert.Equal(HttpStatusCode.BadRequest, bulkInBulk.StatusCode);
        Assert.Contains("solo es componente de un producto empaquetado", await bulkInBulk.Content.ReadAsStringAsync());
        var packagedInPackaged = await admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(otherPackaged.Id, 1, null, [new RecipeLineRequest(packaged.Id, 1, 0)]));
        Assert.Equal(HttpStatusCode.BadRequest, packagedInPackaged.StatusCode);

        var recipe = await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(packaged.Id, 1, null,
            [new RecipeLineRequest(bulk.Id, 1, 0), new RecipeLineRequest(bag.Id, 1, 0)])));
        Assert.Equal(ItemPresentation.Packaged, recipe.OutputPresentation);

        // The packaging order is demand for the bulk good, taken from the finished goods sub-warehouse (RN-111).
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant.Id, packaged.Id, 10, Today.AddDays(1), null, null)));
        Assert.Equal(finished.Id, order.Lines.Single(l => l.ComponentItemId == bulk.Id).SourceLocationId);
        var plan = await OkAsync<ProductionPlanDto>(admin.GetAsync(
            $"/api/v1/production-plan?locationId={plant.Id}&from={Today:yyyy-MM-dd}&to={Today.AddDays(2):yyyy-MM-dd}"));
        var bulkRow = plan.Rows.Single(r => r.ItemId == bulk.Id);
        Assert.Equal((Today.AddDays(1), 10m, 10m), (bulkRow.Date, bulkRow.ParentOrders, bulkRow.SuggestedQty));

        // Packing moves the bulk good out of its sub-warehouse at its cost, plus the bag.
        await factory.AddStockAsync(finished.Id, bulk.Id, 10, 2m);
        await factory.AddStockAsync(supplies.Id, bag.Id, 10, 0.5m);
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release",
            new VersionRequest(order.Version)));
        var closed = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(order.Version, ProductionCloseKind.Final, 10, null, null, null, null,
                [new CloseLineRequest(bulk.Id, 10, null, finished.Id), new CloseLineRequest(bag.Id, 10, null, supplies.Id)],
                OutputWarehouseId: finished.Id)));
        Assert.Equal((ProductionOrderStatus.Completed, 25m), (closed.Order.Status, closed.Close.TotalCost)); // 10 × 2 + 10 × 0.5
    }
}
