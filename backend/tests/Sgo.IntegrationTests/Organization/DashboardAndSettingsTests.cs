using System.Net;
using System.Net.Http.Json;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Dashboard;
using Sgo.Application.Inventory;
using Sgo.Application.Logistics;
using Sgo.Application.Organization;
using Sgo.Application.Purchasing;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Purchasing;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Purchasing;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Organization;

[Collection(ApiCollection.Name)]
public class DashboardAndSettingsTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private async Task<HttpClient> ClientAsync(string role, params string[] locations)
    {
        var user = await factory.CreateUserAsync(role, locations);
        return await factory.CreateAuthenticatedClientAsync(user.Email, user.Password);
    }

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<T>())!;
    }

    private static async Task<DashboardDto> DashboardAsync(HttpClient client, Guid? locationId = null) =>
        (await client.GetJsonAsync<DashboardDto>(locationId is { } id ? $"/api/v1/dashboard?locationId={id}" : "/api/v1/dashboard"))!;

    private static async Task AdjustAsync(HttpClient admin, Guid locationId, Guid itemId, decimal quantity, string? lot = null, DateOnly? expiration = null) =>
        await OkAsync<AdjustmentDto>(await admin.PostAsJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(locationId,
            AdjustmentReason.Correction, null, [new AdjustmentLineRequest(itemId, null, lot, expiration, quantity, 10m, null)])));

    private static async Task<IReadOnlyList<AppSettingDto>> SettingsAsync(HttpClient client) =>
        (await client.GetJsonAsync<List<AppSettingDto>>("/api/v1/settings"))!;

    private static Task<HttpResponseMessage> PutSettingAsync(HttpClient client, AppSettingDto setting, decimal value) =>
        client.PutAsJsonAsync("/api/v1/settings", new UpdateSettingsRequest([new SettingValueRequest(setting.Key, value, setting.Version)]));

    [Fact]
    public async Task Each_dashboard_block_respects_the_user_permissions_and_scope()
    {
        var admin = await AdminAsync();
        var (branch, com, fab) = (await factory.LocationIdAsync("SUC-07"), await factory.LocationIdAsync("COM"), await factory.LocationIdAsync("FAB"));
        var manager = await ClientAsync("Encargado de sucursal", "SUC-07");
        var warehouse = await ClientAsync("Almacén comisariato/fábrica", "COM");
        var director = await ClientAsync("Gerente de operaciones");

        var (managerBefore, warehouseBefore, directorBefore) =
            (await DashboardAsync(manager, branch), await DashboardAsync(warehouse, com), await DashboardAsync(director));

        // Branch: one item below minimum, one lot about to expire, one transfer on its way, one order in progress.
        var low = await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = false });
        await OkAsync<List<ItemLocationSettingDto>>(await admin.PutAsJsonAsync($"/api/v1/items/{low.Id}/location-settings",
            new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(branch, 10, 40)])));
        await AdjustAsync(admin, branch, low.Id, 2);
        var perishable = await admin.CreateItemAsync(await admin.NewItemRequestAsync()); // tracks lots
        await AdjustAsync(admin, branch, perishable.Id, 1, "L-CAD", Today.AddDays(1));
        await AdjustAsync(admin, com, low.Id, 50);
        var transfer = await OkAsync<TransferDto>(await admin.PostAsJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(com, branch, null, [new TransferLineRequest(low.Id, null, 5)])));
        await OkAsync<TransferDto>(await admin.PostAsJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, "Camioneta", "Chofer", null)));
        var order = await OkAsync<BranchOrderDto>(await manager.PostAsJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(branch, com, Today, null, [new BranchOrderLineRequest(low.Id, 30)])));
        await OkAsync<BranchOrderDto>(await manager.PostAsJsonAsync($"/api/v1/branch-orders/{order.Id}/submit", new VersionRequest(order.Version)));
        // Purchasing: one order waiting for approval at the factory (threshold 0).
        var supplier = await admin.CreateSupplierAsync();
        await OkAsync<SupplierItemDto>(await admin.AddSupplierItemAsync(supplier.Id, low.Id, 10m));
        var po = await OkAsync<PurchaseOrderDto>(await admin.PostAsJsonAsync("/api/v1/purchase-orders",
            new CreatePurchaseOrderRequest(supplier.Id, fab, null, null, [new PurchaseOrderLineRequest(low.Id, 1, null)])));
        await OkAsync<PurchaseOrderDto>(await admin.PostAsJsonAsync($"/api/v1/purchase-orders/{po.Id}/submit", new VersionRequest(po.Version)));

        // Branch manager: inventory, transfers and own orders; no approvals, purchasing, production or chart.
        var m = await DashboardAsync(manager, branch);
        Assert.Equal(managerBefore.Inventory!.LowStock + 1, m.Inventory!.LowStock);
        Assert.Equal(managerBefore.Inventory.ExpiringLots + 1, m.Inventory.ExpiringLots);
        Assert.Equal(managerBefore.Transfers!.ToReceive + 1, m.Transfers!.ToReceive);
        Assert.Equal(managerBefore.BranchOrdersInProgress + 1, m.BranchOrdersInProgress);
        Assert.Equal((int?)null, m.BranchOrdersToApprove);
        Assert.Null(m.PurchaseOrdersToApprove);
        Assert.Null(m.ProductionOrdersToday);
        Assert.Null(m.LowStockByLocation);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync($"/api/v1/dashboard?locationId={com}")).StatusCode);

        // Warehouse at the commissary: the order to approve; no purchase approvals.
        var w = await DashboardAsync(warehouse, com);
        Assert.Equal(warehouseBefore.BranchOrdersToApprove + 1, w.BranchOrdersToApprove);
        Assert.NotNull(w.Inventory);
        Assert.Null(w.PurchaseOrdersToApprove);
        Assert.Null(w.LowStockByLocation);

        // Operations manager (all locations): purchase approvals, production and the chart per location.
        var d = await DashboardAsync(director);
        Assert.Equal(directorBefore.PurchaseOrdersToApprove + 1, d.PurchaseOrdersToApprove);
        Assert.NotNull(d.ProductionOrdersToday);
        Assert.Null(d.BranchOrdersInProgress); // no logistics.orders.create
        var chartBefore = directorBefore.LowStockByLocation!.Single(l => l.LocationId == branch).Count;
        Assert.Equal(chartBefore + 1, d.LowStockByLocation!.Single(l => l.LocationId == branch).Count);
        Assert.Superset(new HashSet<Guid> { branch, com, fab }, d.LowStockByLocation!.Select(l => l.LocationId).ToHashSet()); // every active location
        Assert.Equal(d.LowStockByLocation!.Sum(l => l.Count), d.Inventory!.LowStock);
    }

    [Fact]
    public async Task Settings_are_validated_versioned_and_take_effect()
    {
        var admin = await AdminAsync();
        var settings = await SettingsAsync(admin);
        Assert.Equal([AppSettingKeys.PoApprovalThreshold, AppSettingKeys.ReceiptTolerancePct, AppSettingKeys.ExpirationAlertDays],
            settings.Select(s => s.Key));
        var threshold = settings.Single(s => s.Key == AppSettingKeys.PoApprovalThreshold);
        Assert.Equal((0m, SettingKind.Decimal, 2), (threshold.Value, threshold.Kind, threshold.Decimals));
        Assert.Equal((3m, SettingKind.Integer), (settings[2].Value, settings[2].Kind));

        Assert.Equal(HttpStatusCode.BadRequest, (await PutSettingAsync(admin, settings[1], 101)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await PutSettingAsync(admin, settings[2], 2.5m)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/v1/settings",
            new UpdateSettingsRequest([new SettingValueRequest("no.existe", 1, 1)]))).StatusCode);

        var updated = await OkAsync<List<AppSettingDto>>(await PutSettingAsync(admin, threshold, 1000));
        try
        {
            var saved = updated.Single(s => s.Key == AppSettingKeys.PoApprovalThreshold);
            Assert.Equal(1000m, saved.Value);
            Assert.NotNull(saved.UpdatedAt);
            Assert.Equal(HttpStatusCode.Conflict, (await PutSettingAsync(admin, threshold, 2000)).StatusCode); // stale version

            // The new threshold applies: a 500 order is approved without review.
            var fab = await factory.LocationIdAsync("FAB");
            var item = await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = false });
            var supplier = await admin.CreateSupplierAsync();
            await OkAsync<SupplierItemDto>(await admin.AddSupplierItemAsync(supplier.Id, item.Id, 100m));
            var po = await OkAsync<PurchaseOrderDto>(await admin.PostAsJsonAsync("/api/v1/purchase-orders",
                new CreatePurchaseOrderRequest(supplier.Id, fab, null, null, [new PurchaseOrderLineRequest(item.Id, 5, null)])));
            po = await OkAsync<PurchaseOrderDto>(await admin.PostAsJsonAsync($"/api/v1/purchase-orders/{po.Id}/submit", new VersionRequest(po.Version)));
            Assert.Equal(PurchaseOrderStatus.Approved, po.Status);
        }
        finally
        {
            await OkAsync<List<AppSettingDto>>(await PutSettingAsync(admin, updated.Single(s => s.Key == AppSettingKeys.PoApprovalThreshold), 0));
        }

        var buyer = await ClientAsync("Compras", "FAB");
        Assert.Equal(HttpStatusCode.Forbidden, (await buyer.GetAsync("/api/v1/settings")).StatusCode);
    }
}
