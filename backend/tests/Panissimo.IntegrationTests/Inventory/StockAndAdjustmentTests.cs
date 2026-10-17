using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class StockAndAdjustmentTests(ApiFactory factory)
{
    private static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTime.UtcNow,
        TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City")));

    private static AdjustmentLineRequest Line(Guid itemId, decimal qty, decimal? cost = null, string? lot = null, DateOnly? expiration = null) =>
        new(itemId, null, lot, expiration, qty, cost, null);

    [Fact]
    public async Task Negative_adjustment_without_stock_returns_409_with_shortages_and_registers_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var flour = await factory.CreateItemAsync("HAR");
        var sugar = await factory.CreateItemAsync("AZU");
        await factory.AddStockAsync(plant, sugar.Id, 2, 15);

        var response = await admin.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(plant, AdjustmentReason.Waste, null,
            [Line(flour.Id, -3), Line(sugar.Id, -5)]));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("insufficient_stock", body.RootElement.GetProperty("code").GetString());
        Assert.Equal(2, body.RootElement.GetProperty("shortages").GetArrayLength());
        Assert.Equal(2m, await factory.StockAsync(plant, sugar.Id));
        var kardex = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={plant}&itemId={sugar.Id}");
        Assert.Single(kardex!.Items);
    }

    [Fact]
    public async Task Correction_entry_creates_the_lot_with_default_expiration_and_exits_follow_fefo()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var butter = await factory.CreateItemAsync("MAN", tracksLots: true, shelfLifeDays: 30);

        var entry = await admin.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(plant, AdjustmentReason.Correction, "Alta",
            [Line(butter.Id, 10, 50, "L-B"), Line(butter.Id, 4, 50, "L-A", Today.AddDays(5))]));
        Assert.Equal(HttpStatusCode.Created, entry.StatusCode);
        var created = await entry.Content.ReadJsonAsync<AdjustmentDto>();
        Assert.StartsWith("AJ-", created!.Folio);
        Assert.Equal(Today.AddDays(30), created.Movements.Single(m => m.LotNumber == "L-B").ExpirationDate);
        Assert.Equal(700m, created.TotalCost);

        var exit = await admin.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(plant, AdjustmentReason.Damaged, null,
            [Line(butter.Id, -6)]));
        var posted = await exit.Content.ReadJsonAsync<AdjustmentDto>();
        Assert.Equal([("L-A", -4m), ("L-B", -2m)], posted!.Movements.Select(m => (m.LotNumber, m.Quantity)));

        var lots = await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{plant}/{butter.Id}/lots");
        Assert.Equal([("L-B", 8m)], lots!.Select(l => (l.LotNumber, l.Quantity)));
    }

    [Fact]
    public async Task Exit_cost_and_running_balance_follow_the_kardex()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("SAL");
        await factory.AddStockAsync(plant, item.Id, 10, 20);
        await factory.AddStockAsync(plant, item.Id, 30, 24);
        await admin.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(plant, AdjustmentReason.InternalUse, null, [Line(item.Id, -15)]));

        var kardex = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={plant}&itemId={item.Id}&pageSize=2");

        Assert.Equal(3, kardex!.Total);
        Assert.Equal([(-15m, 25m), (30m, 40m)], kardex.Items.Select(k => (k.Quantity, k.BalanceAfter!.Value)));
        Assert.Equal((23m, "kg", "Administrador"), (kardex.Items[0].UnitCost, kardex.Items[0].BaseUomCode, kardex.Items[0].UserName));
        var page2 = await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={plant}&itemId={item.Id}&pageSize=2&page=2");
        Assert.Equal(10m, page2!.Items.Single().BalanceAfter);
    }

    [Fact]
    public async Task Stock_list_and_alerts_flag_low_stock_and_expiring_lots()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var cream = await factory.CreateItemAsync("CRE", tracksLots: true);
        var configuredOnly = await factory.CreateItemAsync("NUEZ");
        await factory.AddStockAsync(plant, cream.Id, 3, 40, "C-1", Today.AddDays(2));
        foreach (var item in new[] { cream, configuredOnly })
            await admin.PutJsonAsync($"/api/v1/items/{item.Id}/location-settings",
                new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(plant, 5, 20)]));

        var below = await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={plant}&belowMin=true&pageSize=100");
        var row = below!.Items.Single(s => s.ItemId == cream.Id);
        Assert.Equal((3m, 120m, true), (row.OnHand, row.StockValue, row.BelowMin));
        Assert.Contains(below.Items, s => s.ItemId == configuredOnly.Id && s.OnHand == 0);

        var alerts = await admin.GetJsonAsync<AlertsDto>($"/api/v1/alerts?locationId={plant}");
        Assert.Equal(3, alerts!.ExpiryAlertDays);
        Assert.Contains(alerts.LowStock, a => a.ItemId == configuredOnly.Id);
        var expiring = alerts.ExpiringLots.Single(l => l.ItemId == cream.Id);
        Assert.Equal((2, false), (expiring.DaysToExpire, expiring.IsExpired));
    }

    [Fact]
    public async Task Adjustments_are_limited_to_the_users_locations()
    {
        var email = ApiFactory.UniqueEmail("almacen");
        await factory.CreateUserAsync(email, ["plant_warehouse"], ["SUC-01"]);
        var client = await factory.LoginAsync(email);
        var plant = await factory.LocationIdAsync("PLANTA");
        var item = await factory.CreateItemAsync("ACE");

        var response = await client.PostJsonAsync("/api/v1/adjustments",
            new CreateAdjustmentRequest(plant, AdjustmentReason.Correction, null, [Line(item.Id, 1, 1)]));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/stock?locationId={plant}")).StatusCode);
    }

    [Fact]
    public async Task Pieces_cannot_be_adjusted_in_fractions()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("PAN", ItemType.FinishedGood, "pza");

        var response = await admin.PostJsonAsync("/api/v1/adjustments",
            new CreateAdjustmentRequest(plant, AdjustmentReason.Correction, null, [Line(bread.Id, 2.5m, 3)]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("whole_quantity_required", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Initial_stock_csv_creates_one_adjustment_per_location_and_rejects_moved_items()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var branch = await factory.LocationIdAsync("SUC-01");
        var flour = await factory.CreateItemAsync("HAR");
        var bread = await factory.CreateItemAsync("BOL", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 3);

        var csv = $"""
            ubicacion,sku,cantidad,costo_unitario,lote,caducidad
            PLANTA,{flour.Sku},100,18.5,,
            planta,{bread.Sku},40,2.1,L-INI,{Today.AddDays(2):yyyy-MM-dd}
            SUC-01,{bread.Sku},12,2.1,L-INI,{Today.AddDays(2):dd/MM/yyyy}
            """;
        var ok = await PostCsvAsync(admin, csv);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var result = await ok.Content.ReadJsonAsync<InitialStockImportResult>();
        Assert.Equal(3, result!.Lines);
        Assert.Equal(2, result.AdjustmentFolios.Count);
        Assert.Equal(100m, await factory.StockAsync(plant, flour.Id));
        Assert.Equal(12m, await factory.StockAsync(branch, bread.Id));

        var again = await PostCsvAsync(admin, $"""
            ubicacion,sku,cantidad,costo_unitario,lote,caducidad
            PLANTA,{flour.Sku},5,18.5,,
            PLANTA,NO-EXISTE,1,1,,
            SUC-01,{flour.Sku},1.5,1,L-X,
            """);
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
        using var body = JsonDocument.Parse(await again.Content.ReadAsStringAsync());
        var errors = body.RootElement.GetProperty("rowErrors").EnumerateArray()
            .Select(e => (e.GetProperty("row").GetInt32(), e.GetProperty("column").GetString())).ToList();
        Assert.Contains((2, "sku"), errors);
        Assert.Contains((3, "sku"), errors);
        Assert.Contains((4, "lote"), errors);
        Assert.Equal(100m, await factory.StockAsync(plant, flour.Id));
    }

    private static Task<HttpResponseMessage> PostCsvAsync(HttpClient client, string csv)
    {
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        return client.PostAsync("/api/v1/imports/initial-stock", new MultipartFormDataContent { { file, "file", "existencias.csv" } });
    }
}
