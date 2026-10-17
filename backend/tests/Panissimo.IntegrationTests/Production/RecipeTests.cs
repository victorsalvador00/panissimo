using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class RecipeTests(ApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow,
        TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City")));

    private async Task<(Item Bread, Item Flour, Item Bag, RecipeDto Recipe)> BreadRecipeAsync(HttpClient admin)
    {
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 3);
        var flour = await factory.CreateItemAsync("HAR", tracksLots: true);
        var bag = await factory.CreateItemAsync("BOLSA", ItemType.Supply, "pza");
        var response = await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 120, "Batida",
            [new RecipeLineRequest(flour.Id, 6, 2), new RecipeLineRequest(bag.Id, 120, 0)]));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (bread, flour, bag, (await response.Content.ReadJsonAsync<RecipeDto>())!);
    }

    private async Task MarkUsedAsync(Guid recipeId)
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        (await db.Recipes.SingleAsync(r => r.Id == recipeId)).MarkUsed();
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Editing_a_used_recipe_creates_version_two_and_keeps_version_one()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, flour, bag, recipe) = await BreadRecipeAsync(admin);

        // Not used yet: edited in place.
        var inPlace = await (await admin.PutJsonAsync($"/api/v1/recipes/{recipe.Id}", new UpdateRecipeRequest(recipe.Version, 120, null,
            [new RecipeLineRequest(flour.Id, 6.5m, 2), new RecipeLineRequest(bag.Id, 120, 0)]))).Content.ReadJsonAsync<RecipeDto>();
        Assert.Equal((recipe.Id, 1), (inPlace!.Id, inPlace.RecipeVersion));

        await MarkUsedAsync(recipe.Id);
        var current = await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}");
        var v2 = await (await admin.PutJsonAsync($"/api/v1/recipes/{recipe.Id}", new UpdateRecipeRequest(current!.Version, 100, "Menos harina",
            [new RecipeLineRequest(flour.Id, 5, 2), new RecipeLineRequest(bag.Id, 100, 0)]))).Content.ReadJsonAsync<RecipeDto>();

        Assert.NotEqual(recipe.Id, v2!.Id);
        Assert.Equal((2, true), (v2.RecipeVersion, v2.IsActive));
        Assert.Equal([(2, true), (1, false)], v2.Versions.Select(v => (v.RecipeVersion, v.IsActive)));
        var v1 = await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}");
        Assert.Equal((false, 6.5m), (v1!.IsActive, v1.Lines.Single(l => l.ComponentItemId == flour.Id).Quantity));
    }

    [Fact]
    public async Task Only_one_active_version_and_reactivation_requires_deactivating_first()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (bread, flour, _, recipe) = await BreadRecipeAsync(admin);
        await MarkUsedAsync(recipe.Id);
        var v1 = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}"))!;
        var v2 = (await (await admin.PutJsonAsync($"/api/v1/recipes/{recipe.Id}", new UpdateRecipeRequest(v1.Version, 120, null,
            [new RecipeLineRequest(flour.Id, 7, 0)]))).Content.ReadJsonAsync<RecipeDto>())!;
        v1 = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}"))!;

        var duplicate = await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 1, null, [new RecipeLineRequest(flour.Id, 1, 0)]));
        Assert.Contains("recipe_already_active", await duplicate.Content.ReadAsStringAsync());

        var blocked = await admin.PostJsonAsync($"/api/v1/recipes/{v1.Id}/activate", new VersionRequest(v1.Version));
        Assert.Contains("recipe_already_active", await blocked.Content.ReadAsStringAsync());

        await admin.PostJsonAsync($"/api/v1/recipes/{v2.Id}/deactivate", new VersionRequest(v2.Version));
        var reactivated = await admin.PostJsonAsync($"/api/v1/recipes/{v1.Id}/activate", new VersionRequest(v1.Version));
        Assert.Equal(HttpStatusCode.OK, reactivated.StatusCode);
        Assert.True((await reactivated.Content.ReadJsonAsync<RecipeDto>())!.IsActive);
    }

    [Fact]
    public async Task Recipes_are_for_produced_items_and_finished_goods_are_not_components()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var supply = await factory.CreateItemAsync("ETQ", ItemType.Supply, "pza");
        var bulk = await factory.CreateItemAsync("TRENZA", ItemType.FinishedGood, "pza");
        var packaged = await factory.CreateItemAsync("TRENZA-EMB", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);

        var rawOutput = await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(flour.Id, 1, null, [new RecipeLineRequest(supply.Id, 1, 0)]));
        Assert.Contains("recipe_not_produced", await rawOutput.Content.ReadAsStringAsync());

        var finishedComponent = await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(packaged.Id, 6, null,
            [new RecipeLineRequest(bulk.Id, 6, 0), new RecipeLineRequest(supply.Id, 1, 0)]));
        Assert.Equal(HttpStatusCode.BadRequest, finishedComponent.StatusCode);
    }

    [Fact]
    public async Task Semi_finished_cycles_are_rejected()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var filling = await factory.CreateItemAsync("RELLENO", ItemType.SemiFinished);
        await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(dough.Id, 10, null,
            [new RecipeLineRequest(flour.Id, 8, 0), new RecipeLineRequest(filling.Id, 1, 0)]));

        var cycle = await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(filling.Id, 5, null, [new RecipeLineRequest(dough.Id, 1, 0)]));

        Assert.Contains("recipe_cycle", await cycle.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Explosion_shows_usable_stock_shortage_and_estimated_cost()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var (_, flour, bag, recipe) = await BreadRecipeAsync(admin);
        await factory.AddStockAsync(plant, flour.Id, 10, 20, "VENCIDO", Today.AddDays(-1));
        await factory.AddStockAsync(plant, flour.Id, 10, 20, "BUENO", Today.AddDays(30));
        await factory.AddStockAsync(plant, bag.Id, 500, 0.5m);

        var explosion = await admin.GetJsonAsync<ExplosionDto>($"/api/v1/recipes/{recipe.Id}/explode?qty=240&locationId={plant}");

        var flourLine = explosion!.Lines.Single(l => l.ComponentItemId == flour.Id);
        Assert.Equal((12.24m, 10m, 2.24m), (flourLine.TheoreticalQty, flourLine.Available!.Value, flourLine.Shortage!.Value)); // 240/120×6×1.02
        var bagLine = explosion.Lines.Single(l => l.ComponentItemId == bag.Id);
        Assert.Equal((240m, 0m), (bagLine.TheoreticalQty, bagLine.Shortage!.Value));
        Assert.False(explosion.CanProduce);
        Assert.Equal(12.24m * 20 + 240 * 0.5m, explosion.EstimatedTotalCost);

        var noLocation = await admin.GetJsonAsync<ExplosionDto>($"/api/v1/recipes/{recipe.Id}/explode?qty=120");
        Assert.Null(noLocation!.CanProduce);
    }
}
