using System.Net;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

/// <summary>B-26d (RN-46): queries of a plant or branch add up its sub-warehouses. Tests use their own locations.</summary>
[Collection(ApiCollection.Name)]
public class WarehouseTotalsTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;
    private static string Code(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..(prefix.Length + 5)].ToUpperInvariant();

    private static async Task<LocationDto> LocationAsync(HttpClient admin, CreateLocationRequest request) =>
        (await (await admin.PostJsonAsync("/api/v1/locations", request)).Content.ReadJsonAsync<LocationDto>())!;

    private static async Task<(LocationDto Parent, LocationDto A, LocationDto B)> WithWarehousesAsync(HttpClient admin, LocationType type)
    {
        var parent = await LocationAsync(admin, new CreateLocationRequest(Code(type == LocationType.Plant ? "PLT" : "S"), "Con subalmacenes", type, null));
        var a = await LocationAsync(admin, new CreateLocationRequest(parent.Code + "-A", "Subalmacén A", LocationType.Warehouse, null, parent.Id));
        var b = await LocationAsync(admin, new CreateLocationRequest(parent.Code + "-B", "Subalmacén B", LocationType.Warehouse, null, parent.Id));
        return (parent, a, b);
    }

    private static Task SetMinMaxAsync(HttpClient admin, Guid itemId, Guid locationId, decimal min, decimal max) =>
        admin.PutJsonAsync($"/api/v1/items/{itemId}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(locationId, min, max)]));

    [Fact]
    public async Task Plant_stock_minimums_plan_and_order_availability_add_up_the_warehouses()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, a, b) = await WithWarehousesAsync(admin, LocationType.Plant);
        var flour = await factory.CreateItemAsync("HAR");
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)]));
        await SetMinMaxAsync(admin, bread.Id, plant.Id, 20, 60);
        await factory.AddStockAsync(a.Id, bread.Id, 10, 2m);
        await factory.AddStockAsync(b.Id, bread.Id, 5, 4m);
        await factory.AddStockAsync(a.Id, flour.Id, 30, 18m);
        await factory.AddStockAsync(b.Id, flour.Id, 20, 18m);

        // The plant row carries the minimum and the stock of both warehouses.
        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={plant.Id}&itemId={bread.Id}"))!;
        var plantRow = stock.Items.Single(s => s.LocationId == plant.Id);
        Assert.Equal((15m, 20m, true, 40m), (plantRow.OnHand, plantRow.MinQty!.Value, plantRow.BelowMin, plantRow.StockValue));
        Assert.Equal(2, stock.Items.Count(s => s.LocationId != plant.Id));

        var alerts = (await admin.GetJsonAsync<AlertsDto>($"/api/v1/alerts?locationId={plant.Id}"))!;
        Assert.Equal(15m, alerts.LowStock.Single(l => l.ItemId == bread.Id).OnHand);

        // RN-70 with the plant total: stock 15 < min 20 → keep 60 → produce 45.
        var plan = (await admin.GetJsonAsync<ProductionPlanDto>($"/api/v1/production-plan?locationId={plant.Id}&from={Today:yyyy-MM-dd}&to={Today.AddDays(1):yyyy-MM-dd}"))!;
        var row = plan.Rows.Single(r => r.ItemId == bread.Id);
        Assert.Equal((15m, 60m, 45m), (row.Stock, row.StockReplenishment, row.SuggestedQty));

        // An open order sees the flour of both warehouses.
        var order = (await (await admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant.Id, bread.Id, 200, Today, null, null, null))).Content.ReadJsonAsync<ProductionOrderDto>())!;
        Assert.Equal(50m, order.Lines.Single().Available);

        // A count is taken per warehouse.
        var count = await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(plant.Id, null, null));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, count.StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(a.Id, null, null))).StatusCode);
    }

    [Fact]
    public async Task The_branch_suggestion_counts_every_warehouse_of_the_branch()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (branch, a, b) = await WithWarehousesAsync(admin, LocationType.Branch);
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        await SetMinMaxAsync(admin, bread.Id, branch.Id, 10, 50);
        await factory.AddStockAsync(a.Id, bread.Id, 3, 1m);
        await factory.AddStockAsync(b.Id, bread.Id, 4, 1m);

        var suggestion = (await admin.GetJsonAsync<IReadOnlyList<BranchOrderSuggestionDto>>($"/api/v1/branch-orders/suggestion?locationId={branch.Id}"))!;
        var row = suggestion.Single(s => s.ItemId == bread.Id);
        Assert.Equal((7m, 43m), (row.Stock, row.SuggestedQty));
    }

    [Fact]
    public async Task Plant_adjustment_and_count_lists_include_those_of_its_warehouses()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (plant, a, _) = await WithWarehousesAsync(admin, LocationType.Plant);
        var flour = await factory.CreateItemAsync("HAR");
        await factory.AddStockAsync(a.Id, flour.Id, 30, 18m);

        var adjustment = await admin.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(
            a.Id, Domain.Inventory.AdjustmentReason.Waste, null, [new AdjustmentLineRequest(flour.Id, null, null, null, -2, null, null)]));
        Assert.Equal(HttpStatusCode.Created, adjustment.StatusCode);
        var count = await admin.PostJsonAsync("/api/v1/physical-counts", new CreatePhysicalCountRequest(a.Id, null, null));
        Assert.Equal(HttpStatusCode.Created, count.StatusCode);

        var adjustments = (await admin.GetJsonAsync<PagedResult<AdjustmentListItemDto>>($"/api/v1/adjustments?locationId={plant.Id}"))!;
        Assert.Equal([a.Code], adjustments.Items.Select(x => x.LocationCode));
        var counts = (await admin.GetJsonAsync<PagedResult<PhysicalCountListItemDto>>($"/api/v1/physical-counts?locationId={plant.Id}"))!;
        Assert.Equal([a.Code], counts.Items.Select(x => x.LocationCode));
    }
}
