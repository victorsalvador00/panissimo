using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Catalog;

[Collection(ApiCollection.Name)]
public class ItemImportTests(SgoApiFactory factory)
{
    private const string Header = "sku,nombre,tipo,categoria,unidad_base,unidad_compra,factor_compra,maneja_lotes,vida_util_dias,almacenamiento,iva";

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static Task<HttpResponseMessage> UploadAsync(HttpClient client, string csv)
    {
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        var form = new MultipartFormDataContent { { file, "file", "articulos.csv" } };
        return client.PostAsync("/api/v1/imports/items", form);
    }

    private async Task<int> ItemCountAsync()
    {
        await using var scope = factory.CreateScope();
        return await SgoApiFactory.Db(scope).Items.CountAsync();
    }

    private static List<(int Row, string? Column, string Message)> RowErrors(JsonElement problem) =>
        problem.GetProperty("rowErrors").EnumerateArray()
            .Select(e => (e.GetProperty("row").GetInt32(),
                e.GetProperty("column").ValueKind == JsonValueKind.Null ? null : e.GetProperty("column").GetString(),
                e.GetProperty("message").GetString()!))
            .ToList();

    [Fact]
    public async Task Csv_with_errors_reports_them_per_row_and_imports_nothing()
    {
        var admin = await AdminAsync();
        var category = await admin.CreateCategoryAsync();
        var sku = CatalogTestHelpers.Unique("OK");
        var before = await ItemCountAsync();

        var csv = $"""
            {Header}
            {sku},Harina de trigo,materia_prima,{category.Name},kg,caja,25,si,180,ambiente,0
            MAL-1,Mantequilla,lacteo,{category.Name},kg,,,no,,refrigerado,0
            MAL-2,Leche,materia_prima,No existe,litro,,,no,,refrigerado,8
            {sku},Harina repetida,materia_prima,{category.Name},kg,,,no,,ambiente,0
            MAL 4,,materia_prima,{category.Name},kg,caja,0,talvez,-5,humedo,0
            """;

        var response = await UploadAsync(admin, csv);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.ProblemAsync();
        Assert.Equal("import_invalid", problem.GetProperty("code").GetString());
        var errors = RowErrors(problem);

        Assert.DoesNotContain(errors, e => e.Row == 2); // the valid row has no errors...
        Assert.Contains(errors, e => e.Row == 3 && e.Column == "tipo");
        Assert.Contains(errors, e => e.Row == 4 && e.Column == "categoria" && e.Message.Contains("no existe"));
        Assert.Contains(errors, e => e.Row == 4 && e.Column == "unidad_base");
        Assert.Contains(errors, e => e.Row == 4 && e.Column == "iva");
        Assert.Contains(errors, e => e.Row == 5 && e.Column == "sku" && e.Message.Contains("fila 2"));
        foreach (var column in new[] { "nombre", "maneja_lotes", "almacenamiento" })
            Assert.Contains(errors, e => e.Row == 6 && e.Column == column);

        Assert.Equal(before, await ItemCountAsync()); // ...but nothing was imported
    }

    [Fact]
    public async Task Valid_csv_creates_new_items_and_updates_existing_skus()
    {
        var admin = await AdminAsync();
        var category = await admin.CreateCategoryAsync(CatalogTestHelpers.Unique("Secos"));
        var existing = await admin.CreateItemAsync(await admin.NewItemRequestAsync(category.Id));
        var newSku = CatalogTestHelpers.Unique("AZU");

        var csv = $"""
            {Header}
            {existing.Sku.ToLowerInvariant()},Harina integral,Materia Prima,{category.Name.ToUpperInvariant()},kg,,,No,,Ambiente,16
            {newSku},Azúcar estándar,materia_prima,{category.Name},kg,caja,20,sí,365,ambiente,0
            """;

        var response = await UploadAsync(admin, csv);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new ItemImportResult(1, 1), await response.ReadJsonAsync<ItemImportResult>());

        var updated = (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{existing.Id}"))!;
        Assert.Equal("Harina integral", updated.Name);
        Assert.Equal(0.16m, updated.TaxRate);
        Assert.Null(updated.PurchaseUomId);
        Assert.False(updated.TracksLots);

        var created = (await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?q={newSku}"))!;
        var item = (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{Assert.Single(created.Items).Id}"))!;
        Assert.Equal(20m, item.PurchaseToBaseFactor);
        Assert.True(item.TracksLots);
        Assert.Equal(365, item.ShelfLifeDays);
    }

    [Fact]
    public async Task Missing_or_unknown_columns_are_reported_on_row_1()
    {
        var admin = await AdminAsync();

        var response = await UploadAsync(admin, "sku,nombre,tipo,unidad_base,precio\nX-1,Algo,materia_prima,kg,10\n");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = RowErrors(await response.ProblemAsync());
        Assert.Contains(errors, e => e.Row == 1 && e.Column == "categoria");
        Assert.Contains(errors, e => e.Row == 1 && e.Column == "precio");
    }

    [Fact]
    public async Task Import_requires_catalog_manage()
    {
        var user = await factory.CreateUserAsync("Consulta", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        Assert.Equal(HttpStatusCode.Forbidden, (await UploadAsync(client, Header + "\n")).StatusCode);
    }
}
