using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Production;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class RecipeTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<ItemDto> ItemAsync(HttpClient admin, ItemType type, bool tracksLots = false) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { Type = type, TracksLots = tracksLots });

    private static async Task<RecipeDto> OkAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<RecipeDto>())!;
    }

    private static RecipeLineRequest L(Guid component, decimal quantity, decimal wastePct) => new(component, quantity, wastePct);

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, Guid output, decimal yield, params RecipeLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/recipes", new CreateRecipeRequest(output, yield, null, lines));

    private static Task<HttpResponseMessage> UpdateAsync(HttpClient client, RecipeDto recipe, decimal yield, bool active, params RecipeLineRequest[] lines) =>
        client.PutAsJsonAsync($"/api/v1/recipes/{recipe.Id}", new UpdateRecipeRequest(recipe.Version, yield, recipe.Notes, lines, active));

    private async Task MarkUsedAsync(Guid recipeId)
    {
        // Production orders (B-11) mark the recipe they use; until then the test marks it directly.
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        (await db.Recipes.SingleAsync(r => r.Id == recipeId)).MarkUsed();
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Editing_a_used_recipe_creates_version_2_and_keeps_version_1_unchanged()
    {
        var admin = await AdminAsync();
        var bread = await ItemAsync(admin, ItemType.FinishedGood);
        var flour = await ItemAsync(admin, ItemType.RawMaterial);
        var sugar = await ItemAsync(admin, ItemType.RawMaterial);
        var v1 = await OkAsync(await CreateAsync(admin, bread.Id, 12, L(flour.Id, 1.2m, 3), L(sugar.Id, 0.25m, 0)));
        Assert.Equal((1, true, false), (v1.RecipeVersion, v1.IsActive, v1.IsUsed));
        await MarkUsedAsync(v1.Id);
        v1 = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{v1.Id}"))!;

        var v2 = await OkAsync(await UpdateAsync(admin, v1, 12, true, L(flour.Id, 1.2m, 3), L(sugar.Id, 0.2m, 0)));

        Assert.NotEqual(v1.Id, v2.Id);
        Assert.Equal((2, true, false), (v2.RecipeVersion, v2.IsActive, v2.IsUsed));
        Assert.Equal(0.2m, v2.Lines.Single(l => l.ComponentItemId == sugar.Id).Quantity);

        var old = (await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{v1.Id}"))!;
        Assert.False(old.IsActive);
        Assert.Equal(0.25m, old.Lines.Single(l => l.ComponentItemId == sugar.Id).Quantity);

        var active = (await admin.GetJsonAsync<PagedResult<RecipeListItemDto>>($"/api/v1/recipes?outputItemId={bread.Id}"))!;
        Assert.Equal(v2.Id, Assert.Single(active.Items).Id);
        var all = (await admin.GetJsonAsync<PagedResult<RecipeListItemDto>>($"/api/v1/recipes?outputItemId={bread.Id}&includeInactive=true"))!;
        Assert.Equal([2, 1], all.Items.Select(r => r.RecipeVersion));

        // The old version can no longer be edited.
        var editOld = await UpdateAsync(admin, old, 10, true, L(flour.Id, 1, 0));
        Assert.Equal("recipe_not_active", await editOld.ProblemCodeAsync());
    }

    [Fact]
    public async Task Editing_an_unused_recipe_keeps_the_same_version()
    {
        var admin = await AdminAsync();
        var cake = await ItemAsync(admin, ItemType.FinishedGood);
        var flour = await ItemAsync(admin, ItemType.RawMaterial);
        var v1 = await OkAsync(await CreateAsync(admin, cake.Id, 1, L(flour.Id, 0.5m, 0)));

        var edited = await OkAsync(await UpdateAsync(admin, v1, 2, true, L(flour.Id, 0.9m, 5)));

        Assert.Equal((v1.Id, 1, 2m), (edited.Id, edited.RecipeVersion, edited.YieldQty));
        Assert.Equal(HttpStatusCode.Conflict, (await UpdateAsync(admin, v1, 3, true, L(flour.Id, 1, 0))).StatusCode);
    }

    [Fact]
    public async Task One_active_recipe_per_item_and_versions_can_be_swapped()
    {
        var admin = await AdminAsync();
        var sauce = await ItemAsync(admin, ItemType.Intermediate);
        var tomato = await ItemAsync(admin, ItemType.RawMaterial);
        var v1 = await OkAsync(await CreateAsync(admin, sauce.Id, 1, L(tomato.Id, 2, 0)));

        var duplicate = await CreateAsync(admin, sauce.Id, 1, L(tomato.Id, 3, 0));
        Assert.Equal("recipe_already_active", await duplicate.ProblemCodeAsync());

        var deactivated = await OkAsync(await UpdateAsync(admin, v1, 1, false, L(tomato.Id, 2, 0)));
        Assert.False(deactivated.IsActive);
        var v2 = await OkAsync(await CreateAsync(admin, sauce.Id, 1, L(tomato.Id, 3, 0)));
        Assert.Equal(2, v2.RecipeVersion);

        var reactivateWhileOtherActive = await UpdateAsync(admin, deactivated, 1, true, L(tomato.Id, 2, 0));
        Assert.Equal("recipe_already_active", await reactivateWhileOtherActive.ProblemCodeAsync());
    }

    [Fact]
    public async Task Raw_materials_have_no_recipe_and_cycles_are_rejected()
    {
        var admin = await AdminAsync();
        var raw = await ItemAsync(admin, ItemType.RawMaterial);
        var dough = await ItemAsync(admin, ItemType.Intermediate);
        var filling = await ItemAsync(admin, ItemType.Intermediate);
        var flour = await ItemAsync(admin, ItemType.RawMaterial);

        Assert.Equal("recipe_raw_material", await (await CreateAsync(admin, raw.Id, 1, L(flour.Id, 1, 0))).ProblemCodeAsync());

        await OkAsync(await CreateAsync(admin, dough.Id, 1, L(flour.Id, 1, 0), L(filling.Id, 0.5m, 0)));
        var cycle = await CreateAsync(admin, filling.Id, 1, L(dough.Id, 0.1m, 0));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, cycle.StatusCode);
        Assert.Equal("recipe_cycle", await cycle.ProblemCodeAsync());
    }

    [Fact]
    public async Task Explosion_reports_theoretical_consumption_availability_without_expired_lots_and_cost()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var bread = await ItemAsync(admin, ItemType.FinishedGood);
        var flour = await ItemAsync(admin, ItemType.RawMaterial);
        var milk = await ItemAsync(admin, ItemType.RawMaterial, tracksLots: true);
        var recipe = await OkAsync(await CreateAsync(admin, bread.Id, 12, L(flour.Id, 1.2m, 3), L(milk.Id, 0.5m, 0)));
        (await admin.PostAsJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(fab, AdjustmentReason.Correction, null, [
            new(flour.Id, null, null, null, 10, 20, null),
            new(milk.Id, null, "L-OK", Today.AddDays(5), 0.4m, 30, null),
            new(milk.Id, null, "L-VENCIDO", Today.AddDays(-1), 5, 30, null),
        ]), HttpExtensions.Json)).EnsureSuccessStatusCode();

        var explosion = (await admin.GetJsonAsync<ExplosionDto>($"/api/v1/recipes/{recipe.Id}/explode?qty=24&locationId={fab}"))!;

        var flourLine = explosion.Lines.Single(l => l.ComponentItemId == flour.Id);
        Assert.Equal((2.472m, 10m, 0m, 20m, 49.44m), // 24/12 × 1.2 × 1.03
            (flourLine.TheoreticalQty, flourLine.Available!.Value, flourLine.Shortage!.Value, flourLine.AverageCost!.Value, flourLine.EstimatedCost!.Value));
        var milkLine = explosion.Lines.Single(l => l.ComponentItemId == milk.Id);
        Assert.Equal((1m, 0.4m, 0.6m), (milkLine.TheoreticalQty, milkLine.Available!.Value, milkLine.Shortage!.Value)); // expired lot ignored
        Assert.False(explosion.CanProduce);
        Assert.Equal(79.44m, explosion.EstimatedTotalCost);
        Assert.Equal(3.31m, explosion.EstimatedUnitCost);

        var withoutLocation = (await admin.GetJsonAsync<ExplosionDto>($"/api/v1/recipes/{recipe.Id}/explode?qty=24"))!;
        Assert.Null(withoutLocation.CanProduce);
        Assert.All(withoutLocation.Lines, l => Assert.Null(l.Available));
    }

    [Fact]
    public async Task Recipe_permissions()
    {
        var admin = await AdminAsync();
        var item = await ItemAsync(admin, ItemType.FinishedGood);
        var flour = await ItemAsync(admin, ItemType.RawMaterial);

        var viewer = await factory.CreateUserAsync("Consulta", "FAB");
        var client = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/recipes")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateAsync(client, item.Id, 1, L(flour.Id, 1, 0))).StatusCode);

        var chief = await factory.CreateUserAsync("Jefe de producción", "FAB");
        var chiefClient = await factory.CreateAuthenticatedClientAsync(chief.Email, chief.Password);
        Assert.Equal(HttpStatusCode.Created, (await CreateAsync(chiefClient, item.Id, 1, L(flour.Id, 1, 0))).StatusCode);
    }
}
