using System.Net.Http.Json;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Catalog;

internal static class CatalogTestHelpers
{
    public static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";

    public static async Task<ItemCategoryDto> CreateCategoryAsync(this HttpClient client, string? name = null)
    {
        var response = await client.PostAsJsonAsync("/api/v1/item-categories", new CreateItemCategoryRequest(name ?? Unique("Categoria")));
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync<ItemCategoryDto>())!;
    }

    public static async Task<UnitOfMeasureDto> UomAsync(this HttpClient client, string code)
    {
        var page = (await client.GetJsonAsync<PagedResult<UnitOfMeasureDto>>($"/api/v1/units-of-measure?q={code}&includeInactive=true"))!;
        return page.Items.Single(u => u.Code == code);
    }

    public static async Task<CreateItemRequest> NewItemRequestAsync(this HttpClient client, Guid? categoryId = null, string? sku = null) =>
        new(sku ?? Unique("SKU"), "Harina de trigo", ItemType.RawMaterial,
            categoryId ?? (await client.CreateCategoryAsync()).Id,
            (await client.UomAsync("kg")).Id, (await client.UomAsync("caja")).Id, 25m, true, 180, StorageCondition.Ambient, 0m);

    public static async Task<ItemDto> CreateItemAsync(this HttpClient client, CreateItemRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/v1/items", request);
        response.EnsureSuccessStatusCode();
        return (await response.ReadJsonAsync<ItemDto>())!;
    }
}
