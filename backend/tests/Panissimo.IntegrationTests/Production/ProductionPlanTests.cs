using System.Diagnostics;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Application.Production;
using Panissimo.Application.Sales;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class ProductionPlanTests(ApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    private async Task<Item> ProducedAsync(HttpClient admin, string prefix, ItemType type = ItemType.FinishedGood,
        ItemPresentation? presentation = null, Guid? componentId = null, decimal componentQty = 1)
    {
        var item = await factory.CreateItemAsync(prefix, type, "pza", presentation: presentation);
        componentId ??= (await factory.CreateItemAsync("HAR")).Id;
        var recipe = await admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(item.Id, 1, null, [new RecipeLineRequest(componentId.Value, componentQty, 0)]));
        Assert.Equal(HttpStatusCode.Created, recipe.StatusCode);
        return item;
    }

    private async Task<ProductionPlanDto> PlanAsync(HttpClient client, int days = 2) =>
        (await client.GetJsonAsync<ProductionPlanDto>(
            $"/api/v1/production-plan?locationId={await factory.LocationIdAsync("PLANTA")}&from={Today:yyyy-MM-dd}&to={Today.AddDays(days):yyyy-MM-dd}"))!;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    [Fact]
    public async Task Branch_and_customer_orders_and_min_max_become_linked_orders_that_cover_the_plan()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var tomorrow = Today.AddDays(1);
        var bread = await ProducedAsync(admin, "BOLILLO");
        var packaged = await ProducedAsync(admin, "CONCHA-EMB", presentation: ItemPresentation.Packaged);
        var telera = await ProducedAsync(admin, "TELERA");
        await factory.AddStockAsync(plant, telera.Id, 5, 1m);
        await OkAsync<IReadOnlyList<ItemLocationSettingDto>>(admin.PutJsonAsync($"/api/v1/items/{telera.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(plant, 20, 60)])));

        // A submitted branch order and a confirmed customer order for tomorrow.
        var branchOrder = await OkAsync<BranchOrderDto>(admin.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync("SUC-01"), tomorrow, null, [new BranchOrderLineRequest(bread.Id, 100)])));
        await OkAsync<BranchOrderDto>(admin.PostJsonAsync($"/api/v1/branch-orders/{branchOrder.Id}/submit", new VersionRequest(branchOrder.Version)));
        var customer = await OkAsync<CustomerDto>(admin.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest($"CLI-{Guid.NewGuid():N}"[..12], "Cafeterías", null, null, null, null, null)));
        var customerOrder = await OkAsync<CustomerOrderDto>(admin.PostJsonAsync("/api/v1/customer-orders",
            new CreateCustomerOrderRequest(customer.Id, null, tomorrow, null, null, [new CustomerOrderLineRequest(packaged.Id, 24, null)])));
        await OkAsync<CustomerOrderDto>(admin.PostJsonAsync($"/api/v1/customer-orders/{customerOrder.Id}/confirm", new VersionRequest(customerOrder.Version)));

        var plan = await PlanAsync(admin);
        var breadRow = plan.Rows.Single(r => r.ItemId == bread.Id);
        Assert.Equal((tomorrow, 100m, 100m), (breadRow.Date, breadRow.BranchOrders, breadRow.SuggestedQty));
        Assert.Equal(branchOrder.Folio, breadRow.DemandLines.Single().Folio);
        var packagedRow = plan.Rows.Single(r => r.ItemId == packaged.Id);
        Assert.Equal((24m, 24m), (packagedRow.CustomerOrders, packagedRow.SuggestedQty));
        var teleraRow = plan.Rows.Single(r => r.ItemId == telera.Id);
        Assert.Equal((Today, 60m, 5m, 55m), (teleraRow.Date, teleraRow.StockReplenishment, teleraRow.Stock, teleraRow.SuggestedQty));

        var generated = await OkAsync<GenerateProductionPlanResult>(admin.PostJsonAsync("/api/v1/production-plan/generate",
            new GenerateProductionPlanRequest(plant, new[] { breadRow, packagedRow, teleraRow }
                .Select(r => new GeneratePlanLineRequest(r.ItemId, r.Date, null, Shift.Night, r.SuggestedQty, null)).ToList())));
        Assert.Equal(3, generated.Orders.Count);
        Assert.Equal([1, 1, 0], new[] { bread.Id, packaged.Id, telera.Id }.Select(id => generated.Orders.Single(o => o.ItemId == id).LinkedLines));

        var breadOrder = await OkAsync<ProductionOrderDto>(admin.GetAsync($"/api/v1/production-orders/{generated.Orders.Single(o => o.ItemId == bread.Id).Id}"));
        Assert.Equal((ProductionOrderStatus.Draft, ProductionOrderSource.Plan, Shift.Night, 100m),
            (breadOrder.Status, breadOrder.Source, breadOrder.Shift, breadOrder.PlannedQty));
        Assert.Equal((DemandType.BranchOrderLine, branchOrder.Folio, 100m),
            (breadOrder.Demands.Single().DemandType, breadOrder.Demands.Single().Folio, breadOrder.Demands.Single().Quantity));

        // The generated orders cover the plan.
        var covered = await PlanAsync(admin);
        Assert.All(covered.Rows.Where(r => r.ItemId == bread.Id || r.ItemId == packaged.Id || r.ItemId == telera.Id),
            r => Assert.Equal(0m, r.SuggestedQty));
    }

    [Fact]
    public async Task Open_parent_orders_are_demand_for_their_semi_finished_component()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var dough = await ProducedAsync(admin, "MASA", ItemType.SemiFinished);
        var bread = await ProducedAsync(admin, "PAN", componentId: dough.Id, componentQty: 0.5m);
        await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 100, Today.AddDays(1), null, null, null)));

        var plan = await PlanAsync(admin);
        var doughRow = plan.Rows.Single(r => r.ItemId == dough.Id);
        Assert.Equal((Today.AddDays(1), 50m, 50m), (doughRow.Date, doughRow.ParentOrders, doughRow.SuggestedQty));
        Assert.Equal(DemandType.ParentOrder, doughRow.DemandLines.Single().Type);
        var breadRow = plan.Rows.Single(r => r.ItemId == bread.Id);
        Assert.Equal((100m, 0m), (breadRow.OpenOrders, breadRow.SuggestedQty));

        // A parent order is not an order line: generating links nothing.
        var generated = await OkAsync<GenerateProductionPlanResult>(admin.PostJsonAsync("/api/v1/production-plan/generate",
            new GenerateProductionPlanRequest(plant, [new GeneratePlanLineRequest(dough.Id, doughRow.Date, null, null, 50, null)])));
        Assert.Equal(0, generated.Orders.Single().LinkedLines);
    }

    [Fact]
    public async Task Generation_is_all_or_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var withRecipe = await ProducedAsync(admin, "BOLILLO");
        var withoutRecipe = await factory.CreateItemAsync("TELERA", ItemType.FinishedGood, "pza");
        var other = await ProducedAsync(admin, "CONCHA");
        var order = await OkAsync<BranchOrderDto>(admin.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync("SUC-01"), Today.AddDays(1), null, [new BranchOrderLineRequest(other.Id, 5)])));
        await OkAsync<BranchOrderDto>(admin.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/submit", new VersionRequest(order.Version)));

        var noRecipe = await admin.PostJsonAsync("/api/v1/production-plan/generate", new GenerateProductionPlanRequest(plant,
        [
            new GeneratePlanLineRequest(withRecipe.Id, Today.AddDays(1), null, null, 10, null),
            new GeneratePlanLineRequest(withoutRecipe.Id, Today.AddDays(1), null, null, 10, null),
        ]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, noRecipe.StatusCode);

        var foreignLine = await admin.PostJsonAsync("/api/v1/production-plan/generate", new GenerateProductionPlanRequest(plant,
            [new GeneratePlanLineRequest(withRecipe.Id, Today.AddDays(1), null, null, 10, [order.Lines[0].Id])]));
        Assert.Equal(HttpStatusCode.BadRequest, foreignLine.StatusCode);

        await using var scope = factory.CreateScope();
        Assert.False(await scope.ServiceProvider.GetRequiredService<AppDbContext>().ProductionOrders.AnyAsync(o => o.OutputItemId == withRecipe.Id));
    }

    [Fact]
    public async Task The_plan_is_for_the_plant_and_generating_needs_its_permission()
    {
        async Task<HttpClient> UserAsync(string role, string location)
        {
            var email = ApiFactory.UniqueEmail(role);
            await factory.CreateUserAsync(email, [role], [location]);
            return await factory.LoginAsync(email);
        }
        var plant = await factory.LocationIdAsync("PLANTA");
        var supervisor = await UserAsync("production_supervisor", "PLANTA");
        var manager = await UserAsync("production_manager", "PLANTA");

        Assert.Equal(HttpStatusCode.OK, (await supervisor.GetAsync($"/api/v1/production-plan?locationId={plant}")).StatusCode);
        var generate = await supervisor.PostJsonAsync("/api/v1/production-plan/generate",
            new GenerateProductionPlanRequest(plant, [new GeneratePlanLineRequest(Guid.NewGuid(), Today, null, null, 1, null)]));
        Assert.Equal(HttpStatusCode.Forbidden, generate.StatusCode);

        var atBranch = await manager.GetAsync($"/api/v1/production-plan?locationId={await factory.LocationIdAsync("SUC-01")}");
        Assert.Equal(HttpStatusCode.Forbidden, atBranch.StatusCode); // out of scope
        var past = await manager.GetAsync($"/api/v1/production-plan?locationId={plant}&from={Today.AddDays(-1):yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, past.StatusCode);
    }

    [Fact]
    [Trait("Category", "Performance")]
    public async Task Plan_of_300_products_7_days_500_order_lines_and_300_open_orders_takes_under_a_second()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-02");
        var flour = await factory.CreateItemAsync("HAR");
        var today = Today;

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var category = await db.ItemCategories.FirstAsync();
            var pieces = await db.UnitsOfMeasure.Where(u => u.Code == "pza").Select(u => u.Id).SingleAsync();
            var tag = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
            var items = Enumerable.Range(0, 300).Select(i => new Item(new ItemDefinition($"PERF-{tag}-{i:000}", $"IPERF-{tag}-{i:000}", $"Producto {i}",
                ItemType.FinishedGood, category.Id, pieces, null, null, false, null, StorageCondition.Ambient, 0m, ItemPresentation.Bulk,
                ProductionMultiple: 12))).ToList();
            db.Items.AddRange(items);
            var recipes = items.Select(i => new Recipe(i.Id, 1, 1, null, [new RecipeLineInput(flour.Id, 0.05m, 0)])).ToList();
            db.Recipes.AddRange(recipes);
            db.ProductionOrders.AddRange(recipes.Select((r, i) => new ProductionOrder($"PERF-OP-{tag}-{i:000}", plant,
                new ProductionOrderPlan(r, 50, today.AddDays(i % 7), null, null, null), ProductionOrderSource.Manual, null, today)));
            for (var o = 0; o < 50; o++)
            {
                var order = new BranchOrder($"PERF-PED-{tag}-{o:00}", branch, plant, today.AddDays(o % 7), null,
                    Enumerable.Range(0, 10).Select(l => new BranchOrderLineInput(items[(o * 10 + l) % 300].Id, 30 + l)).ToList(), today);
                order.Submit(today, DateTimeOffset.UtcNow, null);
                db.BranchOrders.Add(order);
            }
            await db.SaveChangesAsync();
        }

        await PlanAsync(admin, 6); // warm-up
        var watch = Stopwatch.StartNew();
        var plan = await PlanAsync(admin, 6);
        watch.Stop();

        Assert.True(plan.Rows.Count >= 300, $"{plan.Rows.Count} renglones");
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(1), $"El plan tardó {watch.ElapsedMilliseconds} ms");
    }
}
