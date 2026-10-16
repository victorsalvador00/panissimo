using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Catalog;
using Sgo.Domain.Inventory;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Inventory;

[Collection(ApiCollection.Name)]
public class InventoryApiTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<ItemDto> NewItemAsync(HttpClient admin, bool tracksLots) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = tracksLots });

    private static async Task<HttpResponseMessage> AdjustAsync(HttpClient client, Guid location, AdjustmentReason reason, params AdjustmentLineRequest[] lines) =>
        await client.PostAsJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(location, reason, null, lines), HttpExtensions.Json);

    private static AdjustmentLineRequest Line(Guid item, decimal qty, decimal? cost = null, string? lot = null, DateOnly? expiration = null) =>
        new(item, null, lot, expiration, qty, cost, null);

    [Fact]
    public async Task Negative_adjustment_without_stock_returns_409_and_records_nothing()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: false);
        var location = await factory.LocationIdAsync("SUC-07");

        var response = await AdjustAsync(admin, location, AdjustmentReason.Damaged, Line(item.Id, -3));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.ProblemAsync();
        Assert.Equal("insufficient_stock", problem.GetProperty("code").GetString());
        var shortage = problem.GetProperty("shortages")[0];
        Assert.Equal(item.Sku, shortage.GetProperty("sku").GetString());
        Assert.Equal(3m, shortage.GetProperty("requested").GetDecimal());
        Assert.Equal(0m, shortage.GetProperty("available").GetDecimal());

        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        Assert.False(await db.InventoryMovements.AnyAsync(m => m.ItemId == item.Id));
        Assert.False(await db.InventoryAdjustments.AnyAsync(a => a.Lines.Any(l => l.ItemId == item.Id)));
    }

    [Fact]
    public async Task Adjustments_with_lots_update_stock_lots_and_kardex_with_running_balance()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: true);
        var location = await factory.LocationIdAsync("COM");

        var entry = await AdjustAsync(admin, location, AdjustmentReason.Correction,
            Line(item.Id, 10, 20, "L-A", Today.AddDays(40)),
            Line(item.Id, 6, 26, "L-B", Today.AddDays(10)));
        Assert.Equal(HttpStatusCode.Created, entry.StatusCode);
        var created = (await entry.ReadJsonAsync<AdjustmentDto>())!;
        Assert.StartsWith("AJ-", created.Folio);
        Assert.Equal(356m, created.TotalCost);

        // Waste without lot → FEFO takes L-B (expires first) then L-A.
        var waste = await AdjustAsync(admin, location, AdjustmentReason.Waste, Line(item.Id, -8));
        Assert.Equal(HttpStatusCode.Created, waste.StatusCode);
        var wasteDto = (await waste.ReadJsonAsync<AdjustmentDto>())!;
        Assert.Equal([("L-B", -6m), ("L-A", -2m)], wasteDto.Movements.Select(m => (m.LotNumber!, m.Quantity)));
        Assert.All(wasteDto.Movements, m => Assert.Equal(22.25m, m.UnitCost)); // (10×20 + 6×26) / 16

        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={location}&itemId={item.Id}"))!;
        var level = Assert.Single(stock.Items);
        Assert.Equal((8m, 22.25m, 178m), (level.OnHand, level.AverageCost, level.StockValue));

        var lots = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{location}/{item.Id}/lots"))!;
        Assert.Equal([("L-A", 8m)], lots.Select(l => (l.LotNumber!, l.Quantity)));
        Assert.Equal(40, lots[0].DaysToExpire);

        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={location}&itemId={item.Id}"))!;
        Assert.Equal(4, kardex.Total);
        // Newest first, in the exact order they were posted: +10 L-A, +6 L-B, then FEFO −6 L-B, −2 L-A.
        Assert.Equal(new decimal?[] { 8, 10, 16, 10 }, kardex.Items.Select(k => k.BalanceAfter));
        Assert.Equal(["L-A", "L-B", "L-B", "L-A"], kardex.Items.Select(k => k.LotNumber!));

        var adminName = (await admin.GetJsonAsync<Sgo.Application.Security.MeDto>("/api/v1/me"))!.FullName;
        Assert.All(kardex.Items, k => Assert.Equal(adminName, k.UserName));
        Assert.Equal(adminName, created.CreatedByName);
        var listed = (await admin.GetJsonAsync<PagedResult<AdjustmentListItemDto>>($"/api/v1/adjustments?locationId={location}&q={created.Folio}"))!;
        Assert.Equal(adminName, Assert.Single(listed.Items).CreatedByName);
    }

    [Fact]
    public async Task Exit_reasons_only_accept_negative_quantities()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: false);

        var response = await AdjustAsync(admin, await factory.LocationIdAsync("COM"), AdjustmentReason.Waste, Line(item.Id, 5));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Adjustments_respect_permissions_and_location_scope()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: false);

        var warehouse = await factory.CreateUserAsync("Almacén comisariato/fábrica", "COM");
        var client = await factory.CreateAuthenticatedClientAsync(warehouse.Email, warehouse.Password);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AdjustAsync(client, await factory.LocationIdAsync("FAB"), AdjustmentReason.Correction, Line(item.Id, 1, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.Created,
            (await AdjustAsync(client, await factory.LocationIdAsync("COM"), AdjustmentReason.Correction, Line(item.Id, 1, 1))).StatusCode);

        var viewer = await factory.CreateUserAsync("Consulta", "COM");
        var viewerClient = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);
        Assert.Equal(HttpStatusCode.OK, (await viewerClient.GetAsync("/api/v1/stock")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await AdjustAsync(viewerClient, await factory.LocationIdAsync("COM"), AdjustmentReason.Correction, Line(item.Id, 1, 1))).StatusCode);
    }

    [Fact]
    public async Task Below_min_includes_items_with_min_and_no_stock_and_alerts_show_low_stock_and_expiring_lots()
    {
        var admin = await AdminAsync();
        var location = await factory.LocationIdAsync("SUC-09");
        var neverReceived = await NewItemAsync(admin, tracksLots: false);
        var perishable = await NewItemAsync(admin, tracksLots: true);
        await admin.PutAsJsonAsync($"/api/v1/items/{neverReceived.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new(location, 5, 20)]));
        await AdjustAsync(admin, location, AdjustmentReason.Correction,
            Line(perishable.Id, 3, 10, "EXP-1", Today.AddDays(-1)),
            Line(perishable.Id, 4, 10, "EXP-2", Today.AddDays(2)),
            Line(perishable.Id, 5, 10, "EXP-3", Today.AddDays(30)));

        var belowMin = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={location}&belowMin=true&pageSize=100"))!;
        var low = Assert.Single(belowMin.Items, s => s.ItemId == neverReceived.Id);
        Assert.Equal((0m, 5m, true), (low.OnHand, low.MinQty!.Value, low.BelowMin));

        var alerts = (await admin.GetJsonAsync<AlertsDto>($"/api/v1/alerts?locationId={location}"))!;
        Assert.Equal(3, alerts.ExpirationAlertDays);
        Assert.Contains(alerts.LowStock, a => a.ItemId == neverReceived.Id);
        var expiring = alerts.ExpiringLots.Where(e => e.ItemId == perishable.Id).ToList();
        Assert.Equal([("EXP-1", true, -1), ("EXP-2", false, 2)], expiring.Select(e => (e.LotNumber, e.IsExpired, e.DaysToExpire)));
        Assert.All(expiring, e => Assert.False(string.IsNullOrWhiteSpace(e.BaseUomCode)));
    }

    [Fact]
    public async Task Base_unit_and_lot_control_are_locked_once_the_item_has_movements()
    {
        var admin = await AdminAsync();
        var item = await NewItemAsync(admin, tracksLots: false);
        await AdjustAsync(admin, await factory.LocationIdAsync("COM"), AdjustmentReason.Correction, Line(item.Id, 1, 1));

        var update = new UpdateItemRequest(item.Version, item.Sku, "Nuevo nombre", item.Type, item.CategoryId, item.BaseUomId,
            item.PurchaseUomId, item.PurchaseToBaseFactor, TracksLots: true, item.ShelfLifeDays, item.StorageCondition, item.TaxRate, true);
        var response = await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}", update, HttpExtensions.Json);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("item_has_movements", await response.ProblemCodeAsync());
        Assert.Equal(HttpStatusCode.OK,
            (await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}", update with { TracksLots = false }, HttpExtensions.Json)).StatusCode);
    }

    // ---------- Initial stock CSV ----------

    private static Task<HttpResponseMessage> UploadInitialStockAsync(HttpClient client, string csv)
    {
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        return client.PostAsync("/api/v1/imports/initial-stock", new MultipartFormDataContent { { file, "file", "existencias.csv" } });
    }

    [Fact]
    public async Task Initial_stock_csv_with_errors_imports_nothing()
    {
        var admin = await AdminAsync();
        var plain = await NewItemAsync(admin, tracksLots: false);
        var lots = await NewItemAsync(admin, tracksLots: true);
        var moved = await NewItemAsync(admin, tracksLots: false);
        await AdjustAsync(admin, await factory.LocationIdAsync("FAB"), AdjustmentReason.Correction, Line(moved.Id, 1, 1));

        var csv = $"""
            ubicacion,sku,cantidad,costo_unitario,lote,caducidad
            FAB,{plain.Sku},10,12.5,,
            XYZ,{plain.Sku},1,1,,
            FAB,{lots.Sku},5,3,,
            FAB,{plain.Sku},2,1,L-1,
            FAB,{moved.Sku},4,1,,
            COM,{lots.Sku},-1,1,L-9,31/02/2027
            """;

        var response = await UploadInitialStockAsync(admin, csv);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var rowErrors = (await response.ProblemAsync()).GetProperty("rowErrors").EnumerateArray()
            .Select(e => (Row: e.GetProperty("row").GetInt32(), Column: e.GetProperty("column").GetString())).ToList();
        Assert.DoesNotContain(rowErrors, e => e.Row == 2);
        Assert.Contains((3, "ubicacion"), rowErrors);
        Assert.Contains((4, "lote"), rowErrors);
        Assert.Contains((5, "lote"), rowErrors); // plain item with a lot
        Assert.Contains((6, "sku"), rowErrors);  // already has movements
        Assert.Contains((7, "cantidad"), rowErrors);
        Assert.Contains((7, "caducidad"), rowErrors);

        await using var scope = factory.CreateScope();
        Assert.False(await SgoApiFactory.Db(scope).InventoryMovements.AnyAsync(m => m.ItemId == plain.Id));
    }

    [Fact]
    public async Task Valid_initial_stock_csv_creates_one_adjustment_per_location()
    {
        var admin = await AdminAsync();
        var plain = await NewItemAsync(admin, tracksLots: false);
        var lots = await NewItemAsync(admin, tracksLots: true);

        var csv = $"""
            ubicacion;sku;cantidad;costo_unitario;lote;caducidad
            FAB;{plain.Sku};10;12.5;;
            FAB;{lots.Sku};5;3;L-INI;{Today.AddDays(60):dd/MM/yyyy}
            COM;{plain.Sku};4;13;;
            """;

        var response = await UploadInitialStockAsync(admin, csv);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = (await response.ReadJsonAsync<InitialStockImportResult>())!;
        Assert.Equal(3, result.Lines);
        Assert.Equal(2, result.AdjustmentFolios.Count);

        var fab = await factory.LocationIdAsync("FAB");
        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={fab}&itemId={plain.Id}"))!;
        Assert.Equal((10m, 12.5m), (stock.Items[0].OnHand, stock.Items[0].AverageCost));
        var lotRows = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{fab}/{lots.Id}/lots"))!;
        Assert.Equal([("L-INI", 5m, (DateOnly?)Today.AddDays(60))], lotRows.Select(l => (l.LotNumber!, l.Quantity, l.ExpirationDate)));

        // Loading again is rejected: those items now have movements.
        var again = await UploadInitialStockAsync(admin, csv);
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }
}
