using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class ProductionOrderTests(ApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow,
        TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City")));

    /// <summary>A finished good in pieces with its default area and an active recipe.</summary>
    private async Task<(Item Bread, Item Flour, Guid AreaId, RecipeDto Recipe)> ProductAsync(HttpClient admin)
    {
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 3);
        var flour = await factory.CreateItemAsync("HAR");
        Guid areaId;
        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            areaId = await db.ProductionAreas.Where(a => a.Code == "BIZ-DIA").Select(a => a.Id).SingleAsync();
            var item = await db.Items.SingleAsync(i => i.Id == bread.Id);
            var uom = await db.UnitsOfMeasure.SingleAsync(u => u.Code == "pza");
            item.Update(new ItemDefinition(item.Sku, item.Name, item.Type, item.CategoryId, uom.Id, null, null, true, 3,
                StorageCondition.Ambient, 0, ItemPresentation.Bulk, ProductionAreaId: areaId, ProductionMultiple: 12));
            await db.SaveChangesAsync();
        }
        var recipe = await (await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 120, null,
            [new RecipeLineRequest(flour.Id, 6, 2)]))).Content.ReadJsonAsync<RecipeDto>();
        return (bread, flour, areaId, recipe!);
    }

    private static CreateProductionOrderRequest Request(Guid plant, Guid itemId, decimal qty = 240, DateOnly? date = null) =>
        new(plant, itemId, qty, date ?? Today, null, Shift.Night, null);

    [Fact]
    public async Task Order_takes_the_active_recipe_and_default_area_and_keeps_its_version_when_the_recipe_changes()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var (bread, flour, areaId, recipe) = await ProductAsync(admin);

        var created = await admin.PostJsonAsync("/api/v1/production-orders", Request(plant, bread.Id));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var order = (await created.Content.ReadJsonAsync<ProductionOrderDto>())!;
        Assert.StartsWith("OP-", order.Folio);
        Assert.Equal((ProductionOrderStatus.Draft, ProductionOrderSource.Manual, areaId, 1), (order.Status, order.Source, order.ProductionAreaId!.Value, order.RecipeVersion));
        Assert.Equal(12.24m, order.Lines.Single().TheoreticalQty);
        Assert.Equal(264m, order.MaxAllowedQty); // 240 × 1.10

        // RN-10: the recipe is now used, so editing it creates version 2 and the order keeps version 1.
        var used = await admin.GetJsonAsync<RecipeDto>($"/api/v1/recipes/{recipe.Id}");
        Assert.True(used!.IsUsed);
        var v2 = await (await admin.PutJsonAsync($"/api/v1/recipes/{recipe.Id}", new UpdateRecipeRequest(used.Version, 100, null,
            [new RecipeLineRequest(flour.Id, 5, 0)]))).Content.ReadJsonAsync<RecipeDto>();
        Assert.Equal(2, v2!.RecipeVersion);
        Assert.Equal(1, (await admin.GetJsonAsync<ProductionOrderDto>($"/api/v1/production-orders/{order.Id}"))!.RecipeVersion);
    }

    [Fact]
    public async Task Product_without_active_recipe_is_rejected_with_422()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("SINRECETA", ItemType.FinishedGood, "pza");

        var response = await admin.PostJsonAsync("/api/v1/production-orders", Request(plant, bread.Id));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("recipe_not_active", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Orders_are_only_for_the_plant_whole_pieces_and_today_or_later()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var (bread, _, _, _) = await ProductAsync(admin);

        Assert.Contains("production_plant_only", await (await admin.PostJsonAsync("/api/v1/production-orders", Request(branch, bread.Id))).Content.ReadAsStringAsync());
        Assert.Contains("whole_quantity_required", await (await admin.PostJsonAsync("/api/v1/production-orders", Request(plant, bread.Id, 12.5m))).Content.ReadAsStringAsync());
        Assert.Contains("production_order_past_date", await (await admin.PostJsonAsync("/api/v1/production-orders",
            Request(plant, bread.Id, date: Today.AddDays(-1)))).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Draft_is_edited_released_cancelled_and_listed_by_tab()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var (bread, _, _, _) = await ProductAsync(admin);
        var order = (await (await admin.PostJsonAsync("/api/v1/production-orders", Request(plant, bread.Id))).Content.ReadJsonAsync<ProductionOrderDto>())!;

        order = (await (await admin.PutJsonAsync($"/api/v1/production-orders/{order.Id}", new UpdateProductionOrderRequest(order.Version,
            bread.Id, 360, Today.AddDays(1), null, Shift.Day, "Más piezas"))).Content.ReadJsonAsync<ProductionOrderDto>())!;
        Assert.Equal((360m, Shift.Day, 18.36m), (order.PlannedQty, order.Shift!.Value, order.Lines.Single().TheoreticalQty));

        var drafts = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?tab=Drafts&q={order.Folio}");
        Assert.Single(drafts!.Items);

        order = (await (await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)))
            .Content.ReadJsonAsync<ProductionOrderDto>())!;
        Assert.Equal(ProductionOrderStatus.Released, order.Status);
        var toProduce = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?tab=ToProduce&q={bread.Sku}");
        Assert.Equal((0m, 0), (toProduce!.Items.Single().ProgressPct, toProduce.Items.Single().CloseCount));

        var edit = await admin.PutJsonAsync($"/api/v1/production-orders/{order.Id}", new UpdateProductionOrderRequest(order.Version,
            bread.Id, 1, Today, null, null, null));
        Assert.Contains("production_order_not_draft", await edit.Content.ReadAsStringAsync());

        var cancelled = await (await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/cancel", new VersionRequest(order.Version)))
            .Content.ReadJsonAsync<ProductionOrderDto>();
        Assert.Equal(ProductionOrderStatus.Cancelled, cancelled!.Status);
    }

    [Fact]
    public async Task Supervisor_sees_orders_but_cannot_manage_them()
    {
        var email = ApiFactory.UniqueEmail("supervisor");
        await factory.CreateUserAsync(email, ["production_supervisor"], ["PLANTA"]);
        var client = await factory.LoginAsync(email);
        var plant = await factory.LocationIdAsync("PLANTA");

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/production-orders?tab=InProgress")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostJsonAsync("/api/v1/production-orders", Request(plant, Guid.NewGuid()))).StatusCode);
    }
}
