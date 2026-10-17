using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class SupplierTests(ApiFactory factory)
{
    private const string Letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    /// <summary>A valid moral-person RFC that no other test uses.</summary>
    private static string NewTaxId() =>
        string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)])) + "980312"
        + string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)]));

    private static async Task<SupplierDto> CreateSupplierAsync(HttpClient admin, string? taxId = null, string name = "Harinera de prueba")
    {
        var response = await admin.PostJsonAsync("/api/v1/suppliers",
            new CreateSupplierRequest(taxId ?? NewTaxId(), name, "Jorge Ríos", "477 123 4567", "ventas@harinera.mx", 30));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<SupplierDto>())!;
    }

    private static async Task<SupplierItemDto> AddItemAsync(HttpClient admin, Guid supplierId, Guid itemId, decimal price, bool preferred)
    {
        var response = await admin.PostJsonAsync($"/api/v1/suppliers/{supplierId}/items",
            new CreateSupplierItemRequest(itemId, "CLAVE-1", price, 3, preferred));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<SupplierItemDto>())!;
    }

    private static Task<IReadOnlyList<SupplierOfferDto>?> OffersAsync(HttpClient admin, Guid itemId) =>
        admin.GetJsonAsync<IReadOnlyList<SupplierOfferDto>>($"/api/v1/items/{itemId}/supplier-offers");

    private async Task<int> PreferredCountAsync(Guid itemId)
    {
        await using var scope = factory.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().SupplierItems
            .CountAsync(i => i.ItemId == itemId && i.IsPreferred);
    }

    [Fact]
    public async Task Rfc_is_upper_cased_valid_and_unique_except_generics()
    {
        var admin = await factory.LoginAsAdminAsync();
        var taxId = NewTaxId();

        var supplier = await CreateSupplierAsync(admin, taxId.ToLowerInvariant());
        Assert.Equal(taxId, supplier.TaxId);

        var duplicate = await admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest(taxId, "Otro", null, null, null, 0));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.Contains("taxId", await duplicate.Content.ReadAsStringAsync());

        var invalid = await admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest("HAM981312AB5", "Otro", null, null, null, 0));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Contains("taxId", await invalid.Content.ReadAsStringAsync());

        await CreateSupplierAsync(admin, TaxIdRules.GenericNational, "Mostrador 1");
        await CreateSupplierAsync(admin, TaxIdRules.GenericNational, "Mostrador 2");

        var found = await admin.GetJsonAsync<PagedResult<SupplierListItemDto>>($"/api/v1/suppliers?q={taxId[..6].ToLowerInvariant()}");
        Assert.Contains(found!.Items, s => s.Id == supplier.Id);
        var lookup = await admin.GetJsonAsync<IReadOnlyList<SupplierLookupDto>>($"/api/v1/suppliers/lookup?q={taxId}");
        Assert.Equal([supplier.Id], lookup!.Select(s => s.Id));
    }

    [Fact]
    public async Task Marking_a_preferred_supplier_unmarks_the_previous_one()
    {
        var admin = await factory.LoginAsAdminAsync();
        var flour = await factory.CreateItemAsync("HAR");
        var a = await CreateSupplierAsync(admin, name: "Proveedor A");
        var b = await CreateSupplierAsync(admin, name: "Proveedor B");
        var c = await CreateSupplierAsync(admin, name: "Proveedor C");

        var rowA = await AddItemAsync(admin, a.Id, flour.Id, 20m, preferred: true);
        var rowB = await AddItemAsync(admin, b.Id, flour.Id, 18m, preferred: false);
        await AddItemAsync(admin, c.Id, flour.Id, 15m, preferred: false);
        Assert.Equal(20m, rowA.PricePerBaseUnit);

        var offers = await OffersAsync(admin, flour.Id);
        Assert.Equal([a.Id, c.Id, b.Id], offers!.Select(o => o.SupplierId)); // preferred first, then cheapest

        var marked = await admin.PutJsonAsync($"/api/v1/suppliers/{b.Id}/items/{rowB.Id}",
            new UpdateSupplierItemRequest(rowB.Version, rowB.SupplierSku, 17.5m, 2, IsPreferred: true, IsActive: true));
        Assert.Equal(HttpStatusCode.OK, marked.StatusCode);
        rowB = (await marked.Content.ReadJsonAsync<SupplierItemDto>())!;

        offers = await OffersAsync(admin, flour.Id);
        Assert.Equal(b.Id, offers!.Single(o => o.IsPreferred).SupplierId);
        Assert.Equal(17.5m, offers![0].Price);
        Assert.Equal(1, await PreferredCountAsync(flour.Id));

        // Unmarking A changed its row, so the version the client holds is stale.
        var stale = await admin.PutJsonAsync($"/api/v1/suppliers/{a.Id}/items/{rowA.Id}",
            new UpdateSupplierItemRequest(rowA.Version, null, 20m, 3, IsPreferred: true, IsActive: true));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        // An inactive row is never preferred.
        var inactivePreferred = await admin.PutJsonAsync($"/api/v1/suppliers/{b.Id}/items/{rowB.Id}",
            new UpdateSupplierItemRequest(rowB.Version, null, 17.5m, 2, IsPreferred: true, IsActive: false));
        Assert.Equal(HttpStatusCode.BadRequest, inactivePreferred.StatusCode);

        var deactivated = await admin.PutJsonAsync($"/api/v1/suppliers/{b.Id}/items/{rowB.Id}",
            new UpdateSupplierItemRequest(rowB.Version, null, 17.5m, 2, IsPreferred: false, IsActive: false));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        Assert.Equal(0, await PreferredCountAsync(flour.Id));
        Assert.DoesNotContain((await OffersAsync(admin, flour.Id))!, o => o.SupplierId == b.Id);
    }

    [Fact]
    public async Task Only_active_purchasable_items_once_per_supplier()
    {
        var admin = await factory.LoginAsAdminAsync();
        var supplier = await CreateSupplierAsync(admin);
        var bread = await factory.CreateItemAsync("CONCHA", ItemType.FinishedGood, "pza");
        var sugar = await factory.CreateItemAsync("AZU", ItemType.Supply);

        var finished = await admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items",
            new CreateSupplierItemRequest(bread.Id, null, 5, 1, false));
        Assert.Equal(HttpStatusCode.BadRequest, finished.StatusCode);
        Assert.Contains("itemId", await finished.Content.ReadAsStringAsync());

        await AddItemAsync(admin, supplier.Id, sugar.Id, 25m, preferred: false);
        var twice = await admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items",
            new CreateSupplierItemRequest(sugar.Id, null, 26, 1, false));
        Assert.Equal(HttpStatusCode.BadRequest, twice.StatusCode);

        var items = await admin.GetJsonAsync<IReadOnlyList<SupplierItemDto>>($"/api/v1/suppliers/{supplier.Id}/items");
        Assert.Equal([sugar.Id], items!.Select(i => i.ItemId));
    }

    [Fact]
    public async Task Deactivating_a_supplier_drops_its_preferences_and_freezes_its_items()
    {
        var admin = await factory.LoginAsAdminAsync();
        var yeast = await factory.CreateItemAsync("LEV");
        var supplier = await CreateSupplierAsync(admin);
        await AddItemAsync(admin, supplier.Id, yeast.Id, 90m, preferred: true);

        var deactivated = await admin.PutJsonAsync($"/api/v1/suppliers/{supplier.Id}",
            new UpdateSupplierRequest(supplier.Version, supplier.TaxId, supplier.Name, null, null, null, 15, IsActive: false));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        var inactive = (await deactivated.Content.ReadJsonAsync<SupplierDto>())!;

        Assert.Equal(0, await PreferredCountAsync(yeast.Id));
        Assert.Empty((await OffersAsync(admin, yeast.Id))!);
        var listed = await admin.GetJsonAsync<PagedResult<SupplierListItemDto>>($"/api/v1/suppliers?q={supplier.TaxId}");
        Assert.Empty(listed!.Items);

        var row = (await admin.GetJsonAsync<IReadOnlyList<SupplierItemDto>>($"/api/v1/suppliers/{supplier.Id}/items"))!.Single();
        Assert.False(row.IsPreferred);
        var frozen = await admin.PutJsonAsync($"/api/v1/suppliers/{supplier.Id}/items/{row.Id}",
            new UpdateSupplierItemRequest(row.Version, null, 95m, 3, IsPreferred: true, IsActive: true));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, frozen.StatusCode);

        var reactivated = await admin.PutJsonAsync($"/api/v1/suppliers/{supplier.Id}",
            new UpdateSupplierRequest(inactive.Version, supplier.TaxId, supplier.Name, null, null, null, 15, IsActive: true));
        Assert.Equal(HttpStatusCode.OK, reactivated.StatusCode);
        var edited = await admin.PutJsonAsync($"/api/v1/suppliers/{supplier.Id}/items/{row.Id}",
            new UpdateSupplierItemRequest(row.Version, null, 95m, 3, IsPreferred: true, IsActive: true));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal(1, await PreferredCountAsync(yeast.Id));
    }

    [Fact]
    public async Task Parallel_preferred_marks_on_the_same_item_leave_exactly_one()
    {
        var admin = await factory.LoginAsAdminAsync();
        var butter = await factory.CreateItemAsync("MAN");
        var suppliers = new List<SupplierDto>();
        for (var i = 0; i < 4; i++)
            suppliers.Add(await CreateSupplierAsync(admin, name: $"Proveedor {i}"));

        var responses = await Task.WhenAll(suppliers.Select(s =>
            admin.PostJsonAsync($"/api/v1/suppliers/{s.Id}/items", new CreateSupplierItemRequest(butter.Id, null, 100, 2, IsPreferred: true))));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        Assert.Equal(1, await PreferredCountAsync(butter.Id));
        Assert.Single((await OffersAsync(admin, butter.Id))!, o => o.IsPreferred);
    }

    [Fact]
    public async Task Viewing_and_managing_suppliers_need_their_permissions()
    {
        var warehouseEmail = ApiFactory.UniqueEmail("almacen");
        await factory.CreateUserAsync(warehouseEmail, ["plant_warehouse"], ["PLANTA"]);
        var warehouse = await factory.LoginAsync(warehouseEmail, ApiFactory.DefaultPassword);
        var branchEmail = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(branchEmail, ["branch_manager"], ["SUC-01"]);
        var branch = await factory.LoginAsync(branchEmail, ApiFactory.DefaultPassword);

        Assert.Equal(HttpStatusCode.OK, (await warehouse.GetAsync("/api/v1/suppliers")).StatusCode);
        var create = await warehouse.PostJsonAsync("/api/v1/suppliers",
            new CreateSupplierRequest(NewTaxId(), "Sin permiso", null, null, null, 0));
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await branch.GetAsync("/api/v1/suppliers")).StatusCode);
    }
}
