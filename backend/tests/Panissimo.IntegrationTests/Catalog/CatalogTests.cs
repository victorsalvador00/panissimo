using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Catalog;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Catalog;

[Collection(ApiCollection.Name)]
public class CatalogTests(ApiFactory factory)
{
    private sealed record Refs(Guid CategoryId, string CategoryName, Guid Kg, Guid Pza, Guid Bulto, ProductionAreaDto Area);

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..(prefix.Length + 9)].ToUpperInvariant();

    private async Task<Refs> RefsAsync(HttpClient admin)
    {
        var name = $"Pan {Guid.NewGuid():N}"[..12];
        var category = await (await admin.PostJsonAsync("/api/v1/item-categories", new CreateItemCategoryRequest(name)))
            .Content.ReadJsonAsync<ItemCategoryDto>();
        var units = (await admin.GetJsonAsync<PagedResult<UnitOfMeasureDto>>("/api/v1/units-of-measure"))!.Items;
        var areas = (await admin.GetJsonAsync<PagedResult<ProductionAreaDto>>("/api/v1/production-areas"))!.Items;
        return new Refs(category!.Id, category.Name, units.Single(u => u.Code == "kg").Id, units.Single(u => u.Code == "pza").Id,
            units.Single(u => u.Code == "bulto").Id, areas.Single(a => a.Code == "BIZ-DIA"));
    }

    private static CreateItemRequest FinishedGood(Refs refs, string sku, ItemPresentation presentation, Guid? bulkItemId = null) =>
        new(sku, $"Producto {sku}", ItemType.FinishedGood, refs.CategoryId, refs.Pza, null, null, true, 3, StorageCondition.Ambient, 0m,
            presentation, bulkItemId, presentation == ItemPresentation.Packaged ? 6 : null, refs.Area.Id, 12, 85);

    [Fact]
    public async Task Bulk_item_and_its_packaged_version_are_linked()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var trenza = Unique("TRENZA");

        var bulk = await (await admin.PostJsonAsync("/api/v1/items", FinishedGood(refs, trenza, ItemPresentation.Bulk)))
            .Content.ReadJsonAsync<ItemDto>();
        var created = await admin.PostJsonAsync("/api/v1/items", FinishedGood(refs, trenza + "-EMB", ItemPresentation.Packaged, bulk!.Id));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var packaged = await created.Content.ReadJsonAsync<ItemDto>();
        Assert.Equal(trenza, packaged!.BulkItemSku);
        Assert.Equal(12m, packaged.ProductionMultiple);
        Assert.Equal("pza", packaged.BaseUomCode);

        var versions = await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?bulkItemId={bulk.Id}");
        Assert.Equal([packaged.Id], versions!.Items.Select(i => i.Id));

        // A bulk item with packaged versions cannot stop being bulk.
        var change = await admin.PutJsonAsync($"/api/v1/items/{bulk.Id}", new UpdateItemRequest(bulk.Version, bulk.Sku, bulk.Name,
            ItemType.FinishedGood, refs.CategoryId, refs.Pza, null, null, true, 3, StorageCondition.Ambient, 0m,
            ItemPresentation.Packaged, null, null, refs.Area.Id, 12, 85, true));
        Assert.Equal(HttpStatusCode.BadRequest, change.StatusCode);
    }

    [Fact]
    public async Task Packaged_item_cannot_point_to_a_non_bulk_item_and_pieces_need_whole_multiples()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var packaged = await (await admin.PostJsonAsync("/api/v1/items", FinishedGood(refs, Unique("BOL"), ItemPresentation.Packaged)))
            .Content.ReadJsonAsync<ItemDto>();

        var wrongTarget = await admin.PostJsonAsync("/api/v1/items",
            FinishedGood(refs, Unique("BOL"), ItemPresentation.Packaged, packaged!.Id));
        Assert.Equal(HttpStatusCode.BadRequest, wrongTarget.StatusCode);
        Assert.Contains("bulkItemId", await wrongTarget.Content.ReadAsStringAsync());

        var fractional = await admin.PostJsonAsync("/api/v1/items",
            FinishedGood(refs, Unique("CONCHA"), ItemPresentation.Bulk) with { ProductionMultiple = 2.5m });
        Assert.Equal(HttpStatusCode.BadRequest, fractional.StatusCode);
        Assert.Contains("productionMultiple", await fractional.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Lookup_filters_by_type_presentation_and_area()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var sku = Unique("BOMBA");
        await admin.PostJsonAsync("/api/v1/items", FinishedGood(refs, sku, ItemPresentation.Bulk));

        var bulk = await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={sku}&presentation=Bulk&areaId={refs.Area.Id}");
        var packaged = await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={sku}&presentation=Packaged");

        Assert.Equal(sku, Assert.Single(bulk!).Sku);
        Assert.Empty(packaged!);
    }

    [Fact]
    public async Task Min_max_is_saved_per_location()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var item = await (await admin.PostJsonAsync("/api/v1/items", FinishedGood(refs, Unique("PAN"), ItemPresentation.Bulk)))
            .Content.ReadJsonAsync<ItemDto>();
        var settings = await admin.GetJsonAsync<List<ItemLocationSettingDto>>($"/api/v1/items/{item!.Id}/location-settings");
        var plant = settings!.Single(s => s.LocationCode == "PLANTA");

        var saved = await admin.PutJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(plant.LocationId, 100, 300)]));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var after = (await saved.Content.ReadJsonAsync<List<ItemLocationSettingDto>>())!.Single(s => s.LocationCode == "PLANTA");
        Assert.Equal((100m, 300m), (after.MinQty, after.MaxQty));

        var invalid = await admin.PutJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(plant.LocationId, 10, 5)]));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Production_areas_are_managed_by_code()
    {
        var admin = await factory.LoginAsAdminAsync();
        var code = Unique("AREA");

        var created = await admin.PostJsonAsync("/api/v1/production-areas", new CreateProductionAreaRequest(code, "Hojaldre", 120));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var area = await created.Content.ReadJsonAsync<ProductionAreaDto>();

        var duplicate = await admin.PostJsonAsync("/api/v1/production-areas", new CreateProductionAreaRequest(code, "Otra", 1));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var updated = await admin.PutJsonAsync($"/api/v1/production-areas/{area!.Id}",
            new UpdateProductionAreaRequest(area.Version, "Hojaldre Noche", 125, false));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);

        var active = await admin.GetJsonAsync<PagedResult<ProductionAreaDto>>("/api/v1/production-areas?pageSize=100");
        Assert.DoesNotContain(active!.Items, a => a.Code == code);
    }

    [Fact]
    public async Task Csv_with_errors_reports_every_row_and_imports_nothing()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var ok = Unique("OK");
        var csv = $"""
            sku,nombre,tipo,categoria,unidad_base,presentacion,sku_granel,area,multiplo_op
            {ok},Pan correcto,terminado,{refs.CategoryName},pza,granel,,BIZ-DIA,12
            {Unique("A")},Sin presentación,terminado,{refs.CategoryName},pza,,,,
            {Unique("B")},Área inexistente,terminado,{refs.CategoryName},pza,granel,,NO-EXISTE,
            {Unique("C")},Insumo con área,insumo,{refs.CategoryName},pza,,,BIZ-DIA,
            {Unique("D")},Ligado a inexistente,terminado,{refs.CategoryName},pza,empaquetado,NOEXISTE,,
            {Unique("E")},Categoría mala,terminado,No Existe,pza,granel,,,
            """;

        var response = await PostCsvAsync(admin, csv);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var errors = body.RootElement.GetProperty("rowErrors").EnumerateArray()
            .Select(e => (Row: e.GetProperty("row").GetInt32(), Column: e.GetProperty("column").GetString())).ToList();
        Assert.Contains((3, "presentacion"), errors);
        Assert.Contains((4, "area"), errors);
        Assert.Contains((5, "area"), errors);
        Assert.Contains((6, "sku_granel"), errors);
        Assert.Contains((7, "categoria"), errors);
        Assert.DoesNotContain(errors, e => e.Row == 2);

        var lookup = await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={ok}");
        Assert.Empty(lookup!);
    }

    [Fact]
    public async Task Csv_creates_bulk_and_packaged_from_the_same_file_and_updates_existing_skus()
    {
        var admin = await factory.LoginAsAdminAsync();
        var refs = await RefsAsync(admin);
        var trenza = Unique("TRENZA");
        var csv = $"""
            sku;nombre;tipo;categoria;unidad_base;unidad_compra;factor_compra;maneja_lotes;vida_util_dias;iva;presentacion;sku_granel;piezas_por_paquete;area;multiplo_op;gramaje_g
            {trenza}-EMB;Trenza embolsada;terminado;{refs.CategoryName};pza;;;sí;5;0;Empaquetado;{trenza};6;Empaque;6;
            {trenza};Trenza;Terminado;{refs.CategoryName};pza;;;si;3;0;granel;;;Bizcocho Día;30;85.5
            {trenza}-HAR;Harina;materia prima;{refs.CategoryName};kg;bulto;44;no;;0;;;;;;
            """;

        var first = await PostCsvAsync(admin, csv);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(new ItemImportResult(3, 0), await first.Content.ReadJsonAsync<ItemImportResult>());

        var bulk = (await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={trenza}&presentation=Bulk"))!.Single();
        var packagedId = (await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={trenza}-EMB"))!.Single().Id;
        var packaged = await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{packagedId}");
        Assert.Equal(bulk.Id, packaged!.BulkItemId);
        Assert.Equal(6, packaged.UnitsPerPackage);
        Assert.True(packaged.TracksLots);
        var flour = (await admin.GetJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={trenza}-HAR"))!.Single();
        Assert.Equal(44m, (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{flour.Id}"))!.PurchaseToBaseFactor);

        var second = await PostCsvAsync(admin, csv.Replace("Trenza embolsada", "Trenza embolsada 6 pzas"));
        Assert.Equal(new ItemImportResult(0, 3), await second.Content.ReadJsonAsync<ItemImportResult>());
        Assert.Equal("Trenza embolsada 6 pzas", (await admin.GetJsonAsync<ItemDto>($"/api/v1/items/{packagedId}"))!.Name);
    }

    [Fact]
    public async Task Branch_manager_can_look_up_items_but_not_manage_the_catalog()
    {
        var email = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(email, ["branch_manager"], ["SUC-01"]);
        var client = await factory.LoginAsync(email);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/items/lookup?q=a")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/items")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PostCsvAsync(client, "sku\nX")).StatusCode);
    }

    private static Task<HttpResponseMessage> PostCsvAsync(HttpClient client, string csv)
    {
        var file = new ByteArrayContent(Encoding.UTF8.GetBytes(csv));
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        var form = new MultipartFormDataContent { { file, "file", "articulos.csv" } };
        return client.PostAsync("/api/v1/imports/items", form);
    }
}
