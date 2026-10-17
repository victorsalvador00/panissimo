using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Application.Organization;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Organization;

/// <summary>B-26a: sub-warehouses as child locations (RN-44, RN-40). Tests use their own branch, never the shared plant.</summary>
[Collection(ApiCollection.Name)]
public class WarehouseTests(ApiFactory factory)
{
    private static string Code(string prefix) => $"{prefix}{Guid.NewGuid():N}"[..(prefix.Length + 6)].ToUpperInvariant();

    private static async Task<LocationDto> CreateAsync(HttpClient admin, CreateLocationRequest request, HttpStatusCode expected = HttpStatusCode.Created)
    {
        var response = await admin.PostJsonAsync("/api/v1/locations", request);
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.Created ? (await response.Content.ReadJsonAsync<LocationDto>())! : null!;
    }

    /// <summary>A new branch with two sub-warehouses: showcase and storeroom.</summary>
    private static async Task<(LocationDto Branch, LocationDto Showcase, LocationDto Storeroom)> BranchWithWarehousesAsync(HttpClient admin)
    {
        var branch = await CreateAsync(admin, new CreateLocationRequest(Code("S"), "Sucursal con subalmacenes", LocationType.Branch, null));
        var showcase = await CreateAsync(admin, new CreateLocationRequest(branch.Code + "-V", "Vitrina", LocationType.Warehouse, null, branch.Id));
        var storeroom = await CreateAsync(admin, new CreateLocationRequest(branch.Code + "-B", "Bodega", LocationType.Warehouse, null, branch.Id));
        return (branch, showcase, storeroom);
    }

    private static Task<HttpResponseMessage> AdjustAsync(HttpClient client, Guid locationId, Guid itemId, decimal qty) =>
        client.PostJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(locationId, AdjustmentReason.Correction, null,
            [new AdjustmentLineRequest(itemId, null, null, null, qty, qty > 0 ? 10m : null, null)]));

    [Fact]
    public async Task Stock_of_a_location_with_warehouses_lives_in_them()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (branch, showcase, storeroom) = await BranchWithWarehousesAsync(admin);
        var sugar = await factory.CreateItemAsync("AZU");

        Assert.Equal((LocationType.Warehouse, branch.Id), (showcase.Type, showcase.ParentLocationId!.Value));
        var onParent = await AdjustAsync(admin, branch.Id, sugar.Id, 5);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, onParent.StatusCode);
        Assert.Contains("location_has_warehouses", await onParent.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.Created, (await AdjustAsync(admin, showcase.Id, sugar.Id, 5)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await AdjustAsync(admin, storeroom.Id, sugar.Id, 7)).StatusCode);

        // Querying the branch reads its sub-warehouses (RN-46).
        var stock = (await admin.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={branch.Id}&itemId={sugar.Id}"))!;
        Assert.Equal([(showcase.Code, 5m), (storeroom.Code, 7m)], stock.Items.Select(s => (s.LocationCode, s.OnHand)).OrderBy(s => s.Item2));
        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={branch.Id}&itemId={sugar.Id}"))!;
        Assert.Equal(12m, kardex.Items.Max(k => k.BalanceAfter!.Value));
        var lots = (await admin.GetJsonAsync<IReadOnlyList<LotStockDto>>($"/api/v1/stock/{branch.Id}/{sugar.Id}/lots"))!;
        Assert.Equal(12m, lots.Sum(l => l.Quantity));

        // A sub-warehouse with stock is not deactivated.
        var deactivate = await admin.PutJsonAsync($"/api/v1/locations/{storeroom.Id}", new UpdateLocationRequest(storeroom.Version, storeroom.Name, null, false));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, deactivate.StatusCode);

        var warehouses = (await admin.GetJsonAsync<IReadOnlyList<WarehouseDto>>($"/api/v1/locations/{branch.Id}/warehouses"))!;
        Assert.Equal([showcase.Id, storeroom.Id], warehouses.Select(w => w.Id).Order());
        Assert.All(warehouses, w => Assert.True(w.CanMoveStock));
        var lookup = (await admin.GetJsonAsync<IReadOnlyList<LocationLookupDto>>("/api/v1/locations/lookup"))!;
        Assert.Contains(lookup, l => l.Id == branch.Id);
        Assert.DoesNotContain(lookup, l => l.Type == LocationType.Warehouse);
    }

    [Fact]
    public async Task Warehouses_hang_from_a_plant_or_branch_without_stock()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, showcase, _) = await BranchWithWarehousesAsync(admin);
        await CreateAsync(admin, new CreateLocationRequest(Code("W"), "Sub de sub", LocationType.Warehouse, null, showcase.Id), HttpStatusCode.UnprocessableEntity);
        await CreateAsync(admin, new CreateLocationRequest(Code("W"), "Sin padre", LocationType.Warehouse, null), HttpStatusCode.BadRequest);

        var stocked = await CreateAsync(admin, new CreateLocationRequest(Code("S"), "Sucursal con existencia", LocationType.Branch, null));
        var flour = await factory.CreateItemAsync("HAR");
        Assert.Equal(HttpStatusCode.Created, (await AdjustAsync(admin, stocked.Id, flour.Id, 3)).StatusCode);
        await CreateAsync(admin, new CreateLocationRequest(stocked.Code + "-V", "Vitrina", LocationType.Warehouse, null, stocked.Id),
            HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task A_user_of_one_warehouse_moves_stock_only_there_and_sees_its_parent()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (branch, showcase, storeroom) = await BranchWithWarehousesAsync(admin);
        var sugar = await factory.CreateItemAsync("AZU");
        await AdjustAsync(admin, storeroom.Id, sugar.Id, 9);

        var email = ApiFactory.UniqueEmail("vitrina");
        await factory.CreateUserAsync(email, ["plant_warehouse"], [showcase.Code]);
        var user = await factory.LoginAsync(email);

        Assert.Equal(HttpStatusCode.Created, (await AdjustAsync(user, showcase.Id, sugar.Id, 2)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AdjustAsync(user, storeroom.Id, sugar.Id, 2)).StatusCode);

        // The parent is visible (its warehouses and documents), but its stock shows only the warehouse the user may move.
        var stock = (await user.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={branch.Id}&itemId={sugar.Id}"))!;
        Assert.Equal([(showcase.Code, 2m)], stock.Items.Select(s => (s.LocationCode, s.OnHand)));
        var warehouses = (await user.GetJsonAsync<IReadOnlyList<WarehouseDto>>($"/api/v1/locations/{branch.Id}/warehouses"))!;
        Assert.Equal([showcase.Id], warehouses.Select(w => w.Id));

        // A user of the branch moves stock in every warehouse.
        var branchEmail = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(branchEmail, ["plant_warehouse"], [branch.Code]);
        var branchUser = await factory.LoginAsync(branchEmail);
        Assert.Equal(HttpStatusCode.Created, (await AdjustAsync(branchUser, storeroom.Id, sugar.Id, -1)).StatusCode);
    }

    [Fact]
    public async Task Transfers_do_not_use_warehouses()
    {
        var admin = await factory.LoginAsAdminAsync();
        var (_, showcase, storeroom) = await BranchWithWarehousesAsync(admin);
        var sugar = await factory.CreateItemAsync("AZU");
        var response = await admin.PostJsonAsync("/api/v1/transfers", new Application.Logistics.CreateTransferRequest(showcase.Id, storeroom.Id, null,
            [new Application.Logistics.TransferLineRequest(sugar.Id, null, 1)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }
}
