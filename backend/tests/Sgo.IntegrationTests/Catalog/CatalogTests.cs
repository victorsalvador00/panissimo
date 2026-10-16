using System.Net;
using System.Net.Http.Json;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Organization;
using Sgo.Domain.Catalog;
using Sgo.Domain.Organization;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Catalog;

[Collection(ApiCollection.Name)]
public class CatalogTests(SgoApiFactory factory)
{
    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    [Fact]
    public async Task Units_of_measure_crud_with_immutable_code_and_version_check()
    {
        var admin = await AdminAsync();
        var code = CatalogTestHelpers.Unique("bolsa").ToLowerInvariant();

        var created = await admin.PostAsJsonAsync("/api/v1/units-of-measure", new CreateUnitOfMeasureRequest(code, "Bolsa", UomKind.Unit));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var unit = (await created.ReadJsonAsync<UnitOfMeasureDto>())!;

        var duplicate = await admin.PostAsJsonAsync("/api/v1/units-of-measure", new CreateUnitOfMeasureRequest(code.ToUpperInvariant(), "Otra", UomKind.Unit));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var updated = await admin.PutAsJsonAsync($"/api/v1/units-of-measure/{unit.Id}",
            new UpdateUnitOfMeasureRequest(unit.Version, "Bolsa grande", UomKind.Unit, false));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var dto = (await updated.ReadJsonAsync<UnitOfMeasureDto>())!;
        Assert.Equal(code, dto.Code);
        Assert.False(dto.IsActive);

        var active = (await admin.GetJsonAsync<PagedResult<UnitOfMeasureDto>>($"/api/v1/units-of-measure?q={code}"))!;
        Assert.Empty(active.Items);
        var all = (await admin.GetJsonAsync<PagedResult<UnitOfMeasureDto>>($"/api/v1/units-of-measure?q={code}&includeInactive=true"))!;
        Assert.Single(all.Items);

        var stale = await admin.PutAsJsonAsync($"/api/v1/units-of-measure/{unit.Id}",
            new UpdateUnitOfMeasureRequest(unit.Version, "X", UomKind.Unit, true));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
    }

    [Fact]
    public async Task Category_names_are_unique_ignoring_case_and_inactive_ones_cannot_be_used()
    {
        var admin = await AdminAsync();
        var category = await admin.CreateCategoryAsync(CatalogTestHelpers.Unique("Lácteos"));

        var duplicate = await admin.PostAsJsonAsync("/api/v1/item-categories", new CreateItemCategoryRequest(category.Name.ToUpperInvariant()));
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var deactivated = await admin.PutAsJsonAsync($"/api/v1/item-categories/{category.Id}",
            new UpdateItemCategoryRequest(category.Version, category.Name, false));
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);

        var item = await admin.PostAsJsonAsync("/api/v1/items", await admin.NewItemRequestAsync(category.Id));
        Assert.Equal(HttpStatusCode.BadRequest, item.StatusCode);
        Assert.True((await item.ProblemAsync()).GetProperty("errors").TryGetProperty("categoryId", out _));
    }

    [Fact]
    public async Task Item_create_update_and_validation()
    {
        var admin = await AdminAsync();
        var request = await admin.NewItemRequestAsync(sku: CatalogTestHelpers.Unique("har").ToLowerInvariant());

        var item = await admin.CreateItemAsync(request);
        Assert.Equal(request.Sku.ToUpperInvariant(), item.Sku);
        Assert.Equal(25m, item.PurchaseToBaseFactor);

        var duplicate = await admin.PostAsJsonAsync("/api/v1/items", request);
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);
        Assert.True((await duplicate.ProblemAsync()).GetProperty("errors").TryGetProperty("sku", out _));

        var invalid = await admin.PostAsJsonAsync("/api/v1/items", request with { Sku = "OTRO 1", TaxRate = 0.08m, PurchaseToBaseFactor = 0 });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var errors = (await invalid.ProblemAsync()).GetProperty("errors");
        Assert.True(errors.TryGetProperty("sku", out _));
        Assert.True(errors.TryGetProperty("taxRate", out _));
        Assert.True(errors.TryGetProperty("purchaseToBaseFactor", out _));

        var update = new UpdateItemRequest(item.Version, item.Sku, "Harina de trigo 25 kg", item.Type, item.CategoryId, item.BaseUomId,
            null, null, false, null, StorageCondition.Ambient, 0.16m, true);
        var updated = await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}", update);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var dto = (await updated.ReadJsonAsync<ItemDto>())!;
        Assert.Equal(1m, dto.PurchaseToBaseFactor);
        Assert.Null(dto.PurchaseUomId);
        Assert.Equal(0.16m, dto.TaxRate);

        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}", update)).StatusCode);
    }

    [Fact]
    public async Task Item_list_filters_by_text_type_and_category()
    {
        var admin = await AdminAsync();
        var category = await admin.CreateCategoryAsync();
        var raw = await admin.CreateItemAsync(await admin.NewItemRequestAsync(category.Id));
        var finished = await admin.CreateItemAsync((await admin.NewItemRequestAsync(category.Id)) with { Name = "Pastel de zanahoria", Type = ItemType.FinishedGood });

        var byCategory = (await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?categoryId={category.Id}"))!;
        Assert.Equal(2, byCategory.Total);
        Assert.All(byCategory.Items, i => Assert.Equal(category.Name, i.CategoryName));
        Assert.All(byCategory.Items, i => Assert.Equal("kg", i.BaseUomCode));

        var byType = (await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?categoryId={category.Id}&type=FinishedGood"))!;
        Assert.Equal(finished.Id, Assert.Single(byType.Items).Id);

        var byText = (await admin.GetJsonAsync<PagedResult<ItemListItemDto>>($"/api/v1/items?q={raw.Sku.ToLowerInvariant()}"))!;
        Assert.Equal(raw.Id, Assert.Single(byText.Items).Id);
    }

    [Fact]
    public async Task Min_max_per_location_respects_scope_and_rules()
    {
        var admin = await AdminAsync();
        var item = await admin.CreateItemAsync(await admin.NewItemRequestAsync());
        var suc01 = await factory.LocationIdAsync("SUC-01");
        var suc02 = await factory.LocationIdAsync("SUC-02");

        var saved = await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new(suc01, 10, 40), new(suc02, 5, 5)]));
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var invalid = await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new(suc01, 10, 2)]));
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var cleared = await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new(suc02, null, null)]));
        var rows = (await cleared.ReadJsonAsync<List<ItemLocationSettingDto>>())!;
        Assert.Equal(10, rows.Single(r => r.LocationId == suc01).MinQty);
        Assert.Null(rows.Single(r => r.LocationId == suc02).MinQty);

        // A catalog manager limited to SUC-01 only sees and edits SUC-01.
        var user = await factory.CreateUserAsync("Almacén comisariato/fábrica", "SUC-01");
        await GrantCatalogManageAsync(admin, user.Id);
        var limited = await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);

        var visible = (await limited.GetJsonAsync<List<ItemLocationSettingDto>>($"/api/v1/items/{item.Id}/location-settings"))!;
        Assert.Equal([suc01], visible.Select(r => r.LocationId));

        var outOfScope = await limited.PutAsJsonAsync($"/api/v1/items/{item.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new(suc02, 1, 2)]));
        Assert.Equal(HttpStatusCode.Forbidden, outOfScope.StatusCode);
    }

    [Fact]
    public async Task Catalog_permissions_are_enforced()
    {
        var branchManager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var noCatalog = await factory.CreateAuthenticatedClientAsync(branchManager.Email, branchManager.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await noCatalog.GetAsync("/api/v1/items")).StatusCode);

        var readOnly = await factory.CreateUserAsync("Consulta", "SUC-01");
        var viewer = await factory.CreateAuthenticatedClientAsync(readOnly.Email, readOnly.Password);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync("/api/v1/items")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await viewer.PostAsJsonAsync("/api/v1/item-categories", new CreateItemCategoryRequest("No permitida"))).StatusCode);
    }

    [Fact]
    public async Task Item_lookup_is_available_to_operational_roles_without_catalog_view()
    {
        var admin = await AdminAsync();
        var sku = $"LK-{Guid.NewGuid():N}"[..12].ToUpperInvariant();
        var item = await admin.CreateItemAsync(await admin.NewItemRequestAsync(sku: sku));

        var branchManager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(branchManager.Email, branchManager.Password);

        var found = await client.GetFromJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={sku.ToLowerInvariant()}", HttpExtensions.Json);
        var match = Assert.Single(found!);
        Assert.Equal(item.Id, match.Id);
        Assert.Equal(sku, match.Sku);
        Assert.False(string.IsNullOrEmpty(match.BaseUomCode));

        var byId = await client.GetFromJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?id={item.Id}", HttpExtensions.Json);
        Assert.Equal(item.Id, Assert.Single(byId!).Id);

        // The full catalog still requires catalog.view.
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/items/{item.Id}")).StatusCode);
    }

    [Fact]
    public async Task Category_list_is_available_with_inventory_view_for_partial_counts()
    {
        var branchManager = await factory.CreateUserAsync("Encargado de sucursal", "SUC-01");
        var client = await factory.CreateAuthenticatedClientAsync(branchManager.Email, branchManager.Password);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/item-categories")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await client.PostAsJsonAsync("/api/v1/item-categories", new CreateItemCategoryRequest("No permitida"))).StatusCode);
    }

    [Fact]
    public async Task Item_lookup_caps_the_number_of_results()
    {
        var admin = await AdminAsync();
        var prefix = $"CAP{Random.Shared.Next(1000, 9999)}";
        for (var i = 0; i < 3; i++)
            await admin.CreateItemAsync(await admin.NewItemRequestAsync(sku: $"{prefix}-{i}"));

        var limited = await admin.GetFromJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={prefix}&limit=2", HttpExtensions.Json);
        Assert.Equal(2, limited!.Count);

        var tooMany = await admin.GetFromJsonAsync<List<ItemLookupDto>>($"/api/v1/items/lookup?q={prefix}&limit=500", HttpExtensions.Json);
        Assert.Equal(3, tooMany!.Count);
    }

    [Fact]
    public async Task New_location_is_visible_right_away_to_users_with_all_locations()
    {
        var admin = await AdminAsync();
        var code = $"SUC-{Random.Shared.Next(100, 999)}";

        var created = await admin.PostAsJsonAsync("/api/v1/locations", new CreateLocationRequest(code, "Sucursal Nueva", LocationType.Branch, null));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var location = (await created.ReadJsonAsync<LocationDto>())!;
        Assert.Equal(code, location.Code);

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/v1/locations/{location.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.PostAsJsonAsync("/api/v1/locations", new CreateLocationRequest(code.ToLowerInvariant(), "Otra", LocationType.Branch, null))).StatusCode);
    }

    private static async Task GrantCatalogManageAsync(HttpClient admin, Guid userId)
    {
        var role = (await (await admin.PostAsJsonAsync("/api/v1/roles", new Sgo.Application.Security.CreateRoleRequest(
            CatalogTestHelpers.Unique("Catalogo"), "", [Sgo.Domain.Security.Permissions.CatalogView, Sgo.Domain.Security.Permissions.CatalogManage])))
            .ReadJsonAsync<Sgo.Application.Security.RoleDto>())!;
        var user = (await admin.GetJsonAsync<Sgo.Application.Security.UserDto>($"/api/v1/users/{userId}"))!;
        var response = await admin.PutAsJsonAsync($"/api/v1/users/{userId}", new Sgo.Application.Security.UpdateUserRequest(
            user.Version, user.FullName, [.. user.RoleIds, role.Id], user.LocationIds, user.DefaultLocationId));
        response.EnsureSuccessStatusCode();
    }
}
