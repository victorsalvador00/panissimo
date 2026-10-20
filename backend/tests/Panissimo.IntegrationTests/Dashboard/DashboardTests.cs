using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Dashboard;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Dashboard;

[Collection(ApiCollection.Name)]
public class DashboardTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    /// <summary>A purchase receipt movement (its own document) at a unit cost, posted like the goods receipt does.</summary>
    private async Task ReceiveAsync(Guid locationId, Guid itemId, decimal quantity, decimal unitCost)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync();
        await scope.ServiceProvider.GetRequiredService<IInventoryPostingService>().PostAsync(
            [new MovementRequest(locationId, itemId, null, MovementType.PurchaseReceipt, quantity, unitCost, "GoodsReceipt", Guid.NewGuid(), "REC-TEST", null)],
            default);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    /// <summary>
    /// B-22: a factory (RN-49) with two orders today (one cancelled), a released one closed twice (the second with waste). The
    /// summary by factory and by item matches the sum of the closes; the dashboard shows today's factory and the order in process.
    /// Its own plant, so the factory does not reach the recipes of other tests (RN-49).
    /// </summary>
    [Fact]
    public async Task Production_summary_by_factory_matches_the_sum_of_the_closes()
    {
        var admin = await factory.LoginAsAdminAsync();
        var suffix = Guid.NewGuid().ToString("N")[..5].ToUpperInvariant();
        var plant = (await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"PLT{suffix}", "Planta de prueba", LocationType.Plant, null)))).Id;
        var floor = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"PLT{suffix}-FAB", $"Fábrica {suffix}", LocationType.Factory, null, plant)));
        var mp = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"PLT{suffix}-MP", "Materias primas", LocationType.Warehouse, null, plant)));
        var bread = await factory.CreateItemAsync("BIROTE", ItemType.FinishedGood, "pza");
        var flour = await factory.CreateItemAsync("HAR");
        // Releasing reserves the flour at its origin (RN-110); the closes consume it at the factory (RN-49).
        await factory.AddStockAsync(mp.Id, flour.Id, 100, 20);
        await factory.AddStockAsync(floor.Id, flour.Id, 100, 20);
        ComponentSourceRequest[] sources = [new(flour.Id, mp.Id)];
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(bread.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)], floor.Id)));

        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 1000, Today, null, null, sources)));
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));
        var cancelled = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 500, Today, null, null)));
        await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{cancelled.Id}/cancel", new VersionRequest(cancelled.Version)));

        var c1 = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(order.Version, ProductionCloseKind.Partial, 400, null, null, null, null, null)));
        var c2 = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(c1.Order.Version, ProductionCloseKind.Partial, 300, null, null, null, null,
                [new CloseLineRequest(flour.Id, 16, null)])));
        Assert.Equal(20m, c2.Close.WasteCost); // 1 kg over the theoretical 15, at $20

        var range = $"locationId={plant}&from={Today:yyyy-MM-dd}&to={Today:yyyy-MM-dd}";
        var byFactory = await admin.GetJsonAsync<ProductionSummaryDto>($"/api/v1/reports/production-summary?{range}&groupBy=Factory");
        var row = byFactory!.Rows.Single(r => r.Key == floor.Id);
        Assert.Equal((floor.Name, "pza", 1, 1000m, 700m, (decimal?)70m),
            (row.Label, row.BaseUomCode, row.Orders, row.Planned, row.Produced, row.CompliancePct));
        Assert.Equal((c1.Close.TotalCost + c2.Close.TotalCost, c1.Close.WasteCost + c2.Close.WasteCost), (row.ProducedCost, row.WasteCost));

        var byItem = await admin.GetJsonAsync<ProductionSummaryDto>($"/api/v1/reports/production-summary?{range}&groupBy=Item");
        var itemRow = byItem!.Rows.Single(r => r.Key == bread.Id);
        Assert.Equal((bread.Sku, 1000m, 700m, row.ProducedCost, 20m),
            (itemRow.Sku!, itemRow.Planned, itemRow.Produced, itemRow.ProducedCost, itemRow.WasteCost));

        var byDay = await admin.GetJsonAsync<ProductionSummaryDto>($"/api/v1/reports/production-summary?{range}&groupBy=Day");
        Assert.Contains(byDay!.Rows, r => r.Date == Today && r.BaseUomCode == "pza" && r.Produced >= 700);

        var dashboard = await admin.GetJsonAsync<DashboardDto>($"/api/v1/dashboard?locationId={plant}");
        Assert.Equal((1, 1000m, 700m),
            dashboard!.ProductionToday!.Where(r => r.FactoryId == floor.Id).Select(r => (r.Orders, r.Planned, r.Produced)).Single());
        Assert.True(dashboard.ProductionInProgress!.Count >= 1);

        var backwards = await admin.GetAsync(
            $"/api/v1/reports/production-summary?locationId={plant}&from={Today:yyyy-MM-dd}&to={Today.AddDays(-1):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);
    }

    [Fact]
    public async Task Each_block_respects_its_permission_and_the_location_scope()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branch = await factory.LocationIdAsync("SUC-01");
        var all = (await admin.GetJsonAsync<DashboardDto>("/api/v1/dashboard"))!;
        Assert.All(new object?[]
        {
            all.LowStock, all.ExpiringLots, all.TransfersToReceive, all.TransfersToDispatch, all.BranchOrdersToApprove,
            all.BranchOrdersInProgress, all.PurchaseOrdersToApprove, all.ProductionToday, all.ProductionInProgress,
            all.RecipesWithCostIncreases, all.CustomerOrdersDue, all.CustomerShipmentsToDispatch, all.LowStockByLocation,
        }, Assert.NotNull);

        var email = ApiFactory.UniqueEmail("tablero");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var manager = await factory.LoginAsync(email);
        var before = (await manager.GetJsonAsync<DashboardDto>($"/api/v1/dashboard?locationId={branch}"))!;
        Assert.All(new object?[] { before.LowStock, before.ExpiringLots, before.TransfersToReceive, before.BranchOrdersInProgress }, Assert.NotNull);
        Assert.All(new object?[]
        {
            before.BranchOrdersToApprove, before.PurchaseOrdersToApprove, before.ProductionToday, before.ProductionInProgress,
            before.RecipesWithCostIncreases, before.CustomerOrdersDue, before.CustomerShipmentsToDispatch, before.LowStockByLocation,
        }, Assert.Null);

        // A submitted order of the branch counts in progress.
        var item = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");
        var order = await OkAsync<BranchOrderDto>(manager.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(branch, Today.AddDays(1), null, [new BranchOrderLineRequest(item.Id, 10)])));
        await OkAsync<BranchOrderDto>(manager.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/submit", new VersionRequest(order.Version)));
        var after = (await manager.GetJsonAsync<DashboardDto>($"/api/v1/dashboard?locationId={branch}"))!;
        Assert.Equal(before.BranchOrdersInProgress!.Count + 1, after.BranchOrdersInProgress!.Count);

        var plant = await factory.LocationIdAsync("PLANTA");
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync($"/api/v1/dashboard?locationId={plant}")).StatusCode);
    }

    [Fact]
    public async Task A_recipe_whose_component_cost_rose_recently_is_listed()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var cake = await factory.CreateItemAsync("PASTEL", ItemType.FinishedGood, "pza");
        var cocoa = await factory.CreateItemAsync("CACAO");
        var sugar = await factory.CreateItemAsync("AZUCAR");
        var recipe = await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(cake.Id, 10, null, [new RecipeLineRequest(cocoa.Id, 1, 0), new RecipeLineRequest(sugar.Id, 2, 0)])));

        // Cocoa: $10 → $100 (+900 %, at the top of the list); sugar: $10 → $10.10 (+1 %, below the 5 % default).
        await ReceiveAsync(plant, cocoa.Id, 5, 10);
        await ReceiveAsync(plant, cocoa.Id, 5, 100);
        await ReceiveAsync(plant, sugar.Id, 5, 10);
        await ReceiveAsync(plant, sugar.Id, 5, 10.10m);

        var block = (await admin.GetJsonAsync<DashboardDto>($"/api/v1/dashboard?locationId={plant}"))!.RecipesWithCostIncreases!;
        var alert = block.Items.Single(r => r.RecipeId == recipe.Id);
        var component = alert.Components.Single();
        Assert.Equal((cocoa.Id, 10m, 100m, 900m, Today),
            (component.ItemId, component.PreviousCost, component.LastCost, component.IncreasePct, component.ReceivedOn));
    }
}
