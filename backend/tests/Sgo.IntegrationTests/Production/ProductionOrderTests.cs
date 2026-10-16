using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Production;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.Domain.Production;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class ProductionOrderTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<ItemDto> ItemAsync(HttpClient admin, ItemType type, bool tracksLots, int? shelfLife = null) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { Type = type, TracksLots = tracksLots, ShelfLifeDays = shelfLife });

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<T>())!;
    }

    private static async Task StockAsync(HttpClient admin, Guid location, params AdjustmentLineRequest[] lines) =>
        (await admin.PostAsJsonAsync("/api/v1/adjustments",
            new CreateAdjustmentRequest(location, AdjustmentReason.Correction, null, lines), HttpExtensions.Json)).EnsureSuccessStatusCode();

    private sealed record Setup(Guid Location, ItemDto Bread, ItemDto Flour, ItemDto Butter, RecipeDto Recipe);

    /// <summary>Bread (lots, 5-day shelf life): 10 pieces need 5 kg flour (lots) + 1 kg butter.</summary>
    private async Task<Setup> SetupAsync(HttpClient admin, bool breadTracksLots = true)
    {
        var fab = await factory.LocationIdAsync("FAB");
        var bread = await ItemAsync(admin, ItemType.FinishedGood, breadTracksLots, 5);
        var flour = await ItemAsync(admin, ItemType.RawMaterial, tracksLots: true);
        var butter = await ItemAsync(admin, ItemType.RawMaterial, tracksLots: false);
        var recipe = await OkAsync<RecipeDto>(await admin.PostAsJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 10, null,
            [new(flour.Id, 5, 0), new(butter.Id, 1, 0)])));
        await StockAsync(admin, fab,
            new(flour.Id, null, "H-PRONTO", Today.AddDays(10), 6, 10, null),
            new(flour.Id, null, "H-TARDE", Today.AddDays(60), 10, 13, null),
            new(butter.Id, null, null, null, 5, 40, null));
        return new Setup(fab, bread, flour, butter, recipe);
    }

    private static async Task<ProductionOrderDto> CreateReleasedAsync(HttpClient client, Setup s, decimal planned)
    {
        var draft = await OkAsync<ProductionOrderDto>(await client.PostAsJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(s.Location, s.Bread.Id, planned, Today, null)));
        return await OkAsync<ProductionOrderDto>(await client.PostAsJsonAsync($"/api/v1/production-orders/{draft.Id}/release", new VersionRequest(draft.Version)));
    }

    private static Task<HttpResponseMessage> CompleteAsync(HttpClient client, ProductionOrderDto order, decimal produced, params CompleteLineRequest[] lines) =>
        client.PostAsJsonAsync($"/api/v1/production-orders/{order.Id}/complete", new CompleteProductionOrderRequest(order.Version, produced, lines));

    [Fact]
    public async Task Completing_consumes_fefo_creates_the_output_lot_and_costs_the_product()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin);
        var order = await CreateReleasedAsync(admin, s, 20);
        Assert.StartsWith("OP-", order.Folio);
        Assert.Equal([(s.Butter.Id, 2m), (s.Flour.Id, 10m)], order.Lines.OrderBy(l => l.ComponentItemId == s.Flour.Id).Select(l => (l.ComponentItemId, l.TheoreticalQty)));

        // 18 produced; 10 kg flour really used; butter defaults to the theoretical for 18 (1.8 kg).
        var completed = await OkAsync<ProductionOrderDto>(await CompleteAsync(admin, order, 18, new CompleteLineRequest(s.Flour.Id, 10, null)));

        Assert.Equal((ProductionOrderStatus.Completed, 18m), (completed.Status, completed.ProducedQty!.Value));
        var flour = completed.Lines.Single(l => l.ComponentItemId == s.Flour.Id);
        Assert.Equal([("H-PRONTO", 6m), ("H-TARDE", 4m)], flour.Lots.Select(l => (l.LotNumber, l.Quantity))); // FEFO
        Assert.Equal((9m, 10m, 1m, 11.875m), (flour.TheoreticalProducedQty!.Value, flour.ActualQty!.Value, flour.WasteQty!.Value, flour.WasteCost!.Value));

        // Cost: flour 10 × 11.875 (average of 6×10 + 10×13) + butter 1.8 × 40 = 190.75 → / 18
        Assert.Equal(190.75m, completed.TotalCost);
        Assert.Equal(10.5972m, completed.UnitCost);
        Assert.Equal((completed.Folio, (DateOnly?)Today.AddDays(5)), (completed.OutputLotNumber!, completed.OutputLotExpiration));

        var bread = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={s.Location}&itemId={s.Bread.Id}"))!.Items.Single();
        Assert.Equal((18m, 10.5972m), (bread.OnHand, bread.AverageCost));
        var flourLots = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{s.Location}/{s.Flour.Id}/lots"))!;
        Assert.Equal([("H-TARDE", 6m)], flourLots.Select(l => (l.LotNumber!, l.Quantity)));

        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={s.Location}&itemId={s.Bread.Id}"))!;
        var entry = Assert.Single(kardex.Items);
        Assert.Equal((MovementType.ProductionOutput, completed.Folio, completed.Folio), (entry.Type, entry.SourceDocFolio, entry.LotNumber!));
    }

    [Fact]
    public async Task The_order_keeps_its_recipe_version_when_the_recipe_is_edited()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin);
        var order = await CreateReleasedAsync(admin, s, 10);

        var recipe = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{s.Recipe.Id}"))!;
        Assert.True(recipe.IsUsed); // marked when the order was created
        var v2 = await OkAsync<RecipeDto>(await admin.PutAsJsonAsync($"/api/v1/recipes/{recipe.Id}",
            new UpdateRecipeRequest(recipe.Version, 10, null, [new(s.Flour.Id, 8, 0), new(s.Butter.Id, 1, 0)], true)));
        Assert.Equal(2, v2.RecipeVersion);

        var completed = await OkAsync<ProductionOrderDto>(await CompleteAsync(admin, order, 10));

        Assert.Equal((1, s.Recipe.Id), (completed.RecipeVersion, completed.RecipeId));
        Assert.Equal(5m, completed.Lines.Single(l => l.ComponentItemId == s.Flour.Id).ActualQty); // v1: 5 kg per 10
    }

    [Fact]
    public async Task Missing_stock_returns_409_and_records_nothing()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin);
        var order = await CreateReleasedAsync(admin, s, 100); // needs 50 kg flour, there are 16

        var response = await CompleteAsync(admin, order, 100);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("insufficient_stock", await response.ProblemCodeAsync());
        var reloaded = (await admin.GetJsonAsync<ProductionOrderDto>($"/api/v1/production-orders/{order.Id}"))!;
        Assert.Equal((ProductionOrderStatus.Released, order.Version), (reloaded.Status, reloaded.Version));
        await using var scope = factory.CreateScope();
        Assert.False(await SgoApiFactory.Db(scope).InventoryMovements.AnyAsync(m => m.SourceDocId == order.Id));
        Assert.False(await SgoApiFactory.Db(scope).Lots.AnyAsync(l => l.LotNumber == order.Folio));
    }

    [Fact]
    public async Task Chosen_lots_and_products_without_lot_control()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin, breadTracksLots: false);
        var lateLot = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{s.Location}/{s.Flour.Id}/lots"))!
            .Single(l => l.LotNumber == "H-TARDE").LotId!.Value;
        var order = await CreateReleasedAsync(admin, s, 10);

        var completed = await OkAsync<ProductionOrderDto>(await CompleteAsync(admin, order, 10,
            new CompleteLineRequest(s.Flour.Id, 5, [new ComponentLotInput(lateLot, 5)])));

        Assert.Equal("H-TARDE", Assert.Single(completed.Lines.Single(l => l.ComponentItemId == s.Flour.Id).Lots).LotNumber);
        Assert.Null(completed.OutputLotId);
        Assert.Equal(10m, (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={s.Location}&itemId={s.Bread.Id}"))!.Items.Single().OnHand);
    }

    [Fact]
    public async Task Two_simultaneous_completions_one_succeeds_and_the_other_gets_409()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin);
        var order = await CreateReleasedAsync(admin, s, 10);

        var responses = await Task.WhenAll(CompleteAsync(await AdminAsync(), order, 10), CompleteAsync(await AdminAsync(), order, 10));

        Assert.Equal([HttpStatusCode.OK, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order());
        Assert.Equal(10m, (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={s.Location}&itemId={s.Bread.Id}"))!.Items.Single().OnHand);
    }

    [Fact]
    public async Task Rules_and_permissions()
    {
        var admin = await AdminAsync();
        var s = await SetupAsync(admin);

        var branch = await admin.PostAsJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(await factory.LocationIdAsync("SUC-01"), s.Bread.Id, 10, Today, null));
        Assert.Equal("production_location", await branch.ProblemCodeAsync());

        var noRecipe = await admin.PostAsJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(s.Location, s.Flour.Id, 10, Today, null));
        Assert.Equal("production_without_recipe", await noRecipe.ProblemCodeAsync());

        var draft = await OkAsync<ProductionOrderDto>(await admin.PostAsJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(s.Location, s.Bread.Id, 10, Today, null)));
        Assert.Equal("production_order_invalid_status", await (await CompleteAsync(admin, draft, 10)).ProblemCodeAsync());

        var viewer = await factory.CreateUserAsync("Consulta", "FAB");
        var viewerClient = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);
        Assert.Equal(HttpStatusCode.OK, (await viewerClient.GetAsync("/api/v1/production-orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewerClient.PostAsJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(s.Location, s.Bread.Id, 10, Today, null))).StatusCode);

        var chief = await factory.CreateUserAsync("Jefe de producción", "FAB");
        var chiefClient = await factory.CreateAuthenticatedClientAsync(chief.Email, chief.Password);
        var order = await CreateReleasedAsync(chiefClient, s, 2);
        Assert.Equal(HttpStatusCode.OK, (await CompleteAsync(chiefClient, order, 2)).StatusCode);

        var otherPlant = await factory.CreateUserAsync("Jefe de producción", "COM");
        var otherClient = await factory.CreateAuthenticatedClientAsync(otherPlant.Email, otherPlant.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherClient.GetAsync($"/api/v1/production-orders/{order.Id}")).StatusCode);
    }
}
