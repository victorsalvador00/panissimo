using System.Net;
using System.Text.Json;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class ProductionCloseTests(ApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow,
        TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City")));

    private sealed record Setup(Guid Plant, Item Bread, Item Flour, Item Bag, ProductionOrderDto Order);

    /// <summary>
    /// BOMBA in pieces (lots, 3 days of shelf life): 100 pza = 5 kg of flour + 100 bags. Released order of 1,000 pza;
    /// stock 60 kg of flour at $20 and 1,200 bags at $0.50.
    /// </summary>
    private async Task<Setup> ReleasedOrderAsync(HttpClient admin, decimal flourStock = 60)
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 3);
        var flour = await factory.CreateItemAsync("HAR", tracksLots: true);
        var bag = await factory.CreateItemAsync("BOLSA", ItemType.Supply, "pza");
        await factory.AddStockAsync(plant, flour.Id, flourStock, 20, "H-1", Today.AddDays(60));
        await factory.AddStockAsync(plant, bag.Id, 1200, 0.5m);
        await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 100, null,
            [new RecipeLineRequest(flour.Id, 5, 0), new RecipeLineRequest(bag.Id, 100, 0)]));
        var order = (await (await admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 1000, Today, null, Shift.Night, null))).Content.ReadJsonAsync<ProductionOrderDto>())!;
        order = (await (await admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)))
            .Content.ReadJsonAsync<ProductionOrderDto>())!;
        return new Setup(plant, bread, flour, bag, order);
    }

    private static async Task<(HttpResponseMessage Response, ProductionCloseResultDto? Result)> CloseAsync(HttpClient client, Guid orderId,
        CreateProductionCloseRequest request)
    {
        var response = await client.PostJsonAsync($"/api/v1/production-orders/{orderId}/closes", request);
        return (response, response.StatusCode == HttpStatusCode.Created ? await response.Content.ReadJsonAsync<ProductionCloseResultDto>() : null);
    }

    [Fact]
    public async Task Two_partial_closes_and_a_final_close_post_kardex_lots_costs_and_waste()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin);

        var preview = await admin.GetJsonAsync<ClosePreviewDto>($"/api/v1/production-orders/{s.Order.Id}/close-preview?qty=400");
        Assert.Equal(($"{s.Order.Folio}-01", Today.AddDays(3), 20m), (preview!.NextLotNumber, preview.NextLotExpiration, preview.Lines.Single(l => l.ComponentItemId == s.Flour.Id).TheoreticalQty));

        // 1st partial: 400 pza with the theoretical consumption (20 kg, 400 bags).
        var (r1, c1) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(s.Order.Version, ProductionCloseKind.Partial, 400,
            null, "Primer tramo", null, null, null));
        Assert.Equal(HttpStatusCode.Created, r1.StatusCode);
        Assert.Equal(ProductionOrderStatus.InProgress, c1!.Order.Status);
        Assert.Equal(($"{s.Order.Folio}-01", Today.AddDays(3), Shift.Night), (c1.Close.OutputLotNumber, c1.Close.OutputLotExpiration, c1.Close.Shift!.Value));
        Assert.Equal((600m, 1.5m), (c1.Close.TotalCost, c1.Close.UnitCost)); // 20 × 20 + 400 × 0.5

        // 2nd partial: 300 pza, 16 kg of flour actually used (theoretical 15): 1 kg of waste.
        var (_, c2) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(c1.Order.Version, ProductionCloseKind.Partial, 300,
            Shift.Day, null, null, null, [new CloseLineRequest(s.Flour.Id, 16, null)]));
        Assert.Equal((1m, 20m, Shift.Day), (c2!.Close.WasteQty, c2.Close.WasteCost, c2.Close.Shift!.Value));
        Assert.Equal(470m, c2.Close.TotalCost); // 16 × 20 + 300 × 0.5

        // Final: 250 pza, below plan → reason required.
        var noReason = await admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/closes", new CreateProductionCloseRequest(
            c2.Order.Version, ProductionCloseKind.Final, 250, null, null, null, null, null));
        Assert.Contains("production_shortfall_reason_required", await noReason.Content.ReadAsStringAsync());

        var (_, c3) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(c2.Order.Version, ProductionCloseKind.Final, 250,
            null, null, ShortfallReason.MissingStaff, null, null));
        var order = c3!.Order;
        Assert.Equal((ProductionOrderStatus.Completed, 950m, 3, ShortfallReason.MissingStaff), (order.Status, order.ProducedQty, order.CloseCount, order.ShortfallReason!.Value));
        Assert.Equal(1445m, order.TotalCost); // 600 + 470 + 375 (12.5 × 20 + 250 × 0.5)
        Assert.Equal(1.5211m, order.UnitCost);
        Assert.Equal(48.5m, order.Lines.Single(l => l.ComponentItemId == s.Flour.Id).ActualQty);

        // Inventory: three lots of BOMBA, 950 pza at the plant; 11.5 kg of flour left.
        var lots = await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{s.Plant}/{s.Bread.Id}/lots");
        Assert.Equal([($"{s.Order.Folio}-01", 400m), ($"{s.Order.Folio}-02", 300m), ($"{s.Order.Folio}-03", 250m)],
            lots!.OrderBy(l => l.LotNumber).Select(l => (l.LotNumber!, l.Quantity)));
        Assert.Equal(11.5m, await factory.StockAsync(s.Plant, s.Flour.Id));
        var kardex = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={s.Plant}&itemId={s.Bread.Id}");
        Assert.All(kardex!.Items, m => Assert.Equal(MovementType.ProductionOutput, m.Type));
        Assert.Contains(kardex.Items, m => m.UnitCost == 1.5m && m.Quantity == 400);

        var closes = await admin.GetJsonAsync<List<ProductionCloseListItemDto>>($"/api/v1/production-orders/{s.Order.Id}/closes");
        Assert.Equal([ProductionCloseKind.Partial, ProductionCloseKind.Partial, ProductionCloseKind.Final], closes!.Select(c => c.Kind));
        var detail = await admin.GetJsonAsync<ProductionCloseDto>($"/api/v1/production-closes/{c2.Close.Id}");
        Assert.Equal(("H-1", 16m), (detail!.Lines.Single(l => l.ComponentItemId == s.Flour.Id).Lots.Single().LotNumber, detail.Lines.Single(l => l.ComponentItemId == s.Flour.Id).ActualQty));
    }

    [Fact]
    public async Task Shortage_returns_409_without_partial_movements()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin, flourStock: 10);

        var response = await admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/closes", new CreateProductionCloseRequest(
            s.Order.Version, ProductionCloseKind.Partial, 400, null, null, null, null, null));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("insufficient_stock", body.RootElement.GetProperty("code").GetString());
        Assert.Equal(10m, await factory.StockAsync(s.Plant, s.Flour.Id));
        Assert.Equal(1200m, await factory.StockAsync(s.Plant, s.Bag.Id));
        Assert.Equal(0m, await factory.StockAsync(s.Plant, s.Bread.Id));
        var order = await admin.GetJsonAsync<ProductionOrderDto>($"/api/v1/production-orders/{s.Order.Id}");
        Assert.Equal((ProductionOrderStatus.Released, 0), (order!.Status, order.CloseCount));
    }

    [Fact]
    public async Task Concurrent_closes_of_the_same_order_register_once()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin);
        var request = new CreateProductionCloseRequest(s.Order.Version, ProductionCloseKind.Partial, 100, null, null, null, null, null);

        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ =>
            admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/closes", request)));

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order());
        Assert.Equal(100m, await factory.StockAsync(s.Plant, s.Bread.Id));
        Assert.Equal(55m, await factory.StockAsync(s.Plant, s.Flour.Id));
    }

    [Fact]
    public async Task Order_with_closes_cannot_be_cancelled_and_overrun_is_blocked()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin);
        var (_, c1) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(s.Order.Version, ProductionCloseKind.Partial, 100,
            null, null, null, null, null));

        var cancel = await admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/cancel", new VersionRequest(c1!.Order.Version));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, cancel.StatusCode);
        Assert.Contains("production_order_in_progress", await cancel.Content.ReadAsStringAsync());

        var overrun = await admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/closes", new CreateProductionCloseRequest(
            c1.Order.Version, ProductionCloseKind.Final, 1001, null, null, null, null, null));
        Assert.Contains("Máximo permitido: 1100", await overrun.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Final_close_at_zero_only_completes_the_order_and_chosen_lots_must_add_up()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin);
        var flourLot = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{s.Plant}/{s.Flour.Id}/lots"))!.Single().LotId!.Value;

        var mismatch = await admin.PostJsonAsync($"/api/v1/production-orders/{s.Order.Id}/closes", new CreateProductionCloseRequest(
            s.Order.Version, ProductionCloseKind.Partial, 100, null, null, null, null,
            [new CloseLineRequest(s.Flour.Id, 5, [new LotQuantity(flourLot, 4)])]));
        Assert.Contains("lots_mismatch", await mismatch.Content.ReadAsStringAsync());

        var (_, c1) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(s.Order.Version, ProductionCloseKind.Partial, 100,
            null, null, null, null, [new CloseLineRequest(s.Flour.Id, 5, [new LotQuantity(flourLot, 5)])]));
        var stockBefore = await factory.StockAsync(s.Plant, s.Flour.Id);

        var (response, final) = await CloseAsync(admin, s.Order.Id, new CreateProductionCloseRequest(c1!.Order.Version, ProductionCloseKind.Final,
            0, null, "No se produjo más", ShortfallReason.DemandChange, null, null));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal((ProductionOrderStatus.Completed, null, 0m), (final!.Order.Status, final.Close.OutputLotNumber, final.Close.TotalCost));
        Assert.Equal(stockBefore, await factory.StockAsync(s.Plant, s.Flour.Id));
        Assert.Equal(100m, await factory.StockAsync(s.Plant, s.Bread.Id));
    }

    [Fact]
    public async Task Supervisor_closes_but_a_branch_manager_cannot()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ReleasedOrderAsync(admin);
        var email = ApiFactory.UniqueEmail("supervisor");
        await factory.CreateUserAsync(email, ["production_supervisor"], ["PLANTA"]);
        var supervisor = await factory.LoginAsync(email);

        var (response, result) = await CloseAsync(supervisor, s.Order.Id, new CreateProductionCloseRequest(s.Order.Version,
            ProductionCloseKind.Partial, 100, null, null, null, null, null));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.StartsWith("CP-", result!.Close.Folio);
        var list = await supervisor.GetJsonAsync<PagedResult<ProductionCloseListItemDto>>($"/api/v1/production-closes?itemId={s.Bread.Id}");
        Assert.Single(list!.Items);
    }
}
