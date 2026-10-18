using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Production;

[Collection(ApiCollection.Name)]
public class ProductionOrderImportTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static readonly string[] Headers = ["Fecha", "SKU", "Cantidad", "Área", "Turno", "Ubicación", "Notas"];

    /// <summary>An .xlsx with the template columns; a DateOnly value is written as a date cell.</summary>
    private static byte[] Xlsx(IEnumerable<object?[]> rows, string[]? headers = null)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("OP");
        var columns = headers ?? Headers;
        for (var c = 0; c < columns.Length; c++)
            sheet.Cell(1, c + 1).Value = columns[c];
        var r = 2;
        foreach (var row in rows)
        {
            for (var c = 0; c < row.Length; c++)
                sheet.Cell(r, c + 1).Value = row[c] switch
                {
                    null => Blank.Value,
                    DateOnly d => d.ToDateTime(TimeOnly.MinValue),
                    decimal n => n,
                    int n => n,
                    var other => other.ToString(),
                };
            r++;
        }
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static MultipartFormDataContent Form(byte[] file, bool confirmWarnings = false, bool releaseOnImport = false)
    {
        var content = new ByteArrayContent(file);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return new MultipartFormDataContent
        {
            { content, "file", "ordenes.xlsx" },
            { new StringContent(confirmWarnings ? "true" : "false"), "confirmWarnings" },
            { new StringContent(releaseOnImport ? "true" : "false"), "releaseOnImport" },
        };
    }

    /// <summary>Two finished goods (pieces) and one semi-finished (kg), each with an active recipe; and a raw material.</summary>
    private async Task<(Item Bread, Item Roll, Item Dough, Item Flour)> ProductsAsync(HttpClient admin)
    {
        var flour = await factory.CreateItemAsync("HAR");
        var bread = await factory.CreateItemAsync("BOMBA", ItemType.FinishedGood, "pza");
        var roll = await factory.CreateItemAsync("ROL", ItemType.FinishedGood, "pza");
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        foreach (var item in new[] { bread, roll, dough })
            await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(item.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)]));
        return (bread, roll, dough, flour);
    }

    [Fact]
    public async Task File_with_errors_reports_every_row_and_creates_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (bread, _, dough, flour) = await ProductsAsync(admin);
        var noRecipe = await factory.CreateItemAsync("SINREC", ItemType.FinishedGood, "pza");
        var file = Xlsx(
        [
            [Today.AddDays(1), bread.Sku, 100, null, "Noche", null, null],               // ok
            [Today.AddDays(-1), bread.Sku, 100, null, null, null, null],                 // past date
            [Today, "NO-EXISTE", 10, null, null, null, null],                            // unknown internal SKU
            [Today, flour.Sku, 10, null, null, null, null],                              // raw material
            [Today, noRecipe.Sku, 10, null, null, null, null],                           // no recipe
            [Today, bread.Sku, 2.5m, null, null, null, null],                            // fraction in pieces
            [Today, dough.Sku, 0, "NO-AREA", "Madrugada", "SUC-01", null],               // qty, area, shift, location
            ["31/02/2026", bread.Sku, 10, null, null, null, null],                       // invalid text date
        ]);

        var validation = await (await admin.PostAsync("/api/v1/production-order-imports/validate", Form(file))).Content.ReadJsonAsync<ImportPreviewDto>();
        var errors = validation!.Errors.Select(e => (e.Row, e.Column)).ToList();
        Assert.Equal(0, validation.OrderCount);
        Assert.DoesNotContain(errors, e => e.Row == 2);
        foreach (var expected in new[] { (3, "fecha"), (4, "sku"), (5, "sku"), (6, "sku"), (7, "cantidad"), (8, "cantidad"),
                     (8, "area"), (8, "turno"), (8, "ubicacion"), (9, "fecha") })
            Assert.Contains(expected, errors);

        var create = await admin.PostAsync("/api/v1/production-order-imports", Form(file, confirmWarnings: true));
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        using var body = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("rowErrors").GetArrayLength() >= 10);
        var orders = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?outputItemId={bread.Id}");
        Assert.Empty(orders!.Items);
    }

    [Fact]
    public async Task Valid_file_groups_rows_into_orders_linked_to_the_import()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (bread, roll, _, _) = await ProductsAsync(admin);
        var date = Today.AddDays(1);
        var file = Xlsx(
        [
            [date, bread.Sku.ToLowerInvariant(), 1200, "Bizcocho Día", "noche", null, "Cadena A"],
            [date, bread.Sku, 800, "BIZ-DIA", "Noche", "PLANTA", "Cadena B"],
            [date.ToString("dd/MM/yyyy"), bread.Sku, 500, "BIZ-DIA", "Día", null, null],
            [date, roll.Sku, 300, null, null, null, null],
            [null, null, null, null, null, null, null],
        ]);

        var preview = await (await admin.PostAsync("/api/v1/production-order-imports/validate", Form(file))).Content.ReadJsonAsync<ImportPreviewDto>();
        Assert.Equal((4, 3), (preview!.RowCount, preview.OrderCount));
        var night = preview.Orders.Single(o => o.ItemId == bread.Id && o.Shift == Shift.Night);
        Assert.Equal([2, 3], night.Rows);
        Assert.Equal((2000m, "Cadena A / Cadena B"), (night.Quantity, night.Notes));

        var response = await admin.PostAsync("/api/v1/production-order-imports", Form(file));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = await response.Content.ReadJsonAsync<ImportResultDto>();
        Assert.StartsWith("IMP-", result!.Folio);
        Assert.Equal(3, result.OrderFolios.Count);

        var orders = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?importId={result.ImportId}");
        Assert.All(orders!.Items, o => Assert.Equal((ProductionOrderSource.Import, ProductionOrderStatus.Draft), (o.Source, o.Status)));
        var detail = await admin.GetJsonAsync<ProductionOrderImportDto>($"/api/v1/production-order-imports/{result.ImportId}");
        Assert.Equal((4, 3, 3), (detail!.RowCount, detail.OrderCount, detail.Orders.Count));
        var order = await admin.GetJsonAsync<ProductionOrderDto>($"/api/v1/production-orders/{orders.Items[0].Id}");
        Assert.Equal(result.Folio, order!.ImportFolio);
    }

    [Fact]
    public async Task Duplicate_file_and_existing_orders_are_warnings_that_need_confirmation()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (bread, _, _, _) = await ProductsAsync(admin);
        var date = Today.AddDays(2);
        var file = Xlsx([[date, bread.Sku, 100, null, "Noche", null, null]]);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsync("/api/v1/production-order-imports", Form(file))).StatusCode);

        var preview = await (await admin.PostAsync("/api/v1/production-order-imports/validate", Form(file))).Content.ReadJsonAsync<ImportPreviewDto>();
        Assert.Equal(["duplicate_file", "existing_order"], preview!.Warnings.Select(w => w.Code).Order());
        Assert.Contains("turno Noche", preview.Warnings.Single(w => w.Code == "existing_order").Message);

        var unconfirmed = await admin.PostAsync("/api/v1/production-order-imports", Form(file));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, unconfirmed.StatusCode);
        Assert.Contains("import_warnings_not_confirmed", await unconfirmed.Content.ReadAsStringAsync());

        var confirmed = await admin.PostAsync("/api/v1/production-order-imports", Form(file, confirmWarnings: true));
        Assert.Equal(HttpStatusCode.Created, confirmed.StatusCode);
    }

    [Fact]
    public async Task Release_on_import_creates_released_orders_and_needs_the_manage_permission()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, roll, _, _) = await ProductsAsync(admin);
        var file = Xlsx([[Today.AddDays(3), roll.Sku, 240, null, null, null, null]], ["fecha", "sku", "cantidad", "columna extra"]);

        var preview = await (await admin.PostAsync("/api/v1/production-order-imports/validate", Form(file))).Content.ReadJsonAsync<ImportPreviewDto>();
        Assert.Equal("unknown_column", preview!.Warnings.Single().Code);

        var email = ApiFactory.UniqueEmail("importador");
        var role = await (await admin.PostJsonAsync("/api/v1/roles", new Application.Security.CreateRoleRequest(
            $"Importador {Guid.NewGuid():N}"[..20], "Solo importa", ["production.view", "production.orders.import"]))).Content.ReadJsonAsync<Application.Security.RoleDto>();
        await admin.PostJsonAsync("/api/v1/users", new Application.Security.CreateUserRequest(email, "Importador", ApiFactory.DefaultPassword,
            [role!.Id], [await factory.LocationIdAsync("PLANTA")], null));
        var importer = await factory.LoginAsync(email);
        Assert.Equal(HttpStatusCode.Forbidden, (await importer.PostAsync("/api/v1/production-order-imports",
            Form(file, confirmWarnings: true, releaseOnImport: true))).StatusCode);

        var released = await (await admin.PostAsync("/api/v1/production-order-imports", Form(file, confirmWarnings: true, releaseOnImport: true)))
            .Content.ReadJsonAsync<ImportResultDto>();
        var orders = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?importId={released!.ImportId}");
        Assert.Equal(ProductionOrderStatus.Released, orders!.Items.Single().Status);
    }

    [Fact]
    public async Task Template_is_an_xlsx_with_the_op_sheet()
    {
        var admin = await factory.LoginAsAdminAsync();

        var response = await admin.GetAsync("/api/v1/production-order-imports/template");

        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType!.MediaType);
        using var workbook = new XLWorkbook(await response.Content.ReadAsStreamAsync());
        Assert.Equal("fecha", workbook.Worksheet("OP").Cell(1, 1).GetString());
    }

    [Fact]
    [Trait("Category", "Performance")]
    public async Task Three_thousand_rows_import_in_under_ten_seconds()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var products = new List<Item>();
        for (var i = 0; i < 30; i++)
        {
            var item = await factory.CreateItemAsync($"P{i:D2}", ItemType.FinishedGood, "pza");
            await admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(item.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)]));
            products.Add(item);
        }
        var shifts = new[] { "Día", "Tarde", "Noche" };
        // 3,000 rows → 30 products × 10 days × 3 shifts = 900 orders (some rows add up).
        var rows = Enumerable.Range(0, 3000).Select(i => new object?[]
        {
            Today.AddDays(1 + i % 10), products[i / 10 % 30].Sku, 12, null, shifts[i / 300 % 3], null, null,
        }).ToList();
        var file = Xlsx(rows);

        var watch = Stopwatch.StartNew();
        var validate = await admin.PostAsync("/api/v1/production-order-imports/validate", Form(file));
        var validated = watch.Elapsed;
        var preview = await validate.Content.ReadJsonAsync<ImportPreviewDto>();
        watch.Restart();
        var response = await admin.PostAsync("/api/v1/production-order-imports", Form(file, confirmWarnings: true));
        var imported = watch.Elapsed;

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Empty(preview!.Errors);
        Assert.True(validated < TimeSpan.FromSeconds(5), $"Validación: {validated.TotalSeconds:0.0} s");
        Assert.True(imported < TimeSpan.FromSeconds(10), $"Importación: {imported.TotalSeconds:0.0} s");
        await using var scope = factory.CreateScope();
        var result = await response.Content.ReadJsonAsync<ImportResultDto>();
        Assert.Equal(preview.OrderCount, await scope.ServiceProvider.GetRequiredService<AppDbContext>().ProductionOrders.CountAsync(o => o.ImportId == result!.ImportId));
    }

    [Fact]
    public async Task Products_are_identified_by_their_sku()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (bread, roll, _, _) = await ProductsAsync(admin);
        var sku = $"SKU{Random.Shared.Next(100_000, 999_999)}";

        var dto = (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{bread.Id}"))!;
        var update = await admin.PutJsonAsync($"/api/v1/items/{bread.Id}", new UpdateItemRequest(dto.Version, sku.ToLowerInvariant(), dto.Name,
            dto.Type, dto.CategoryId, dto.BaseUomId, dto.PurchaseUomId, dto.PurchaseUomId is null ? null : dto.PurchaseToBaseFactor,
            dto.TracksLots, dto.ShelfLifeDays, dto.StorageCondition, dto.TaxRate, dto.Presentation, dto.BulkItemId, dto.UnitsPerPackage,
            dto.ProductionAreaId, dto.ProductionMultiple, dto.UnitWeightGrams, true));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Equal(sku, (await update.Content.ReadJsonAsync<ItemDto>())!.Sku);

        // A SKU that no longer exists is rejected in the file.
        var stale = await admin.PostAsync("/api/v1/production-order-imports/validate", Form(Xlsx([[Today.AddDays(1), dto.Sku, 60, null, null, null, null]])));
        var preview = (await stale.Content.ReadJsonAsync<ImportPreviewDto>())!;
        Assert.Contains(preview.Errors, e => e.Column == "sku");

        var file = Xlsx([[Today.AddDays(1), sku, 120, null, "Día", null, null], [Today.AddDays(1), roll.Sku, 60, null, "Día", null, null]]);
        var response = await admin.PostAsync("/api/v1/production-order-imports", Form(file));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var result = (await response.Content.ReadJsonAsync<ImportResultDto>())!;
        var orders = await admin.GetJsonAsync<PagedResult<ProductionOrderListItemDto>>($"/api/v1/production-orders?importId={result.ImportId}");
        Assert.Equal([bread.Id, roll.Id], orders!.Items.Select(o => o.OutputItemId).OrderBy(id => id == roll.Id));
    }
}
