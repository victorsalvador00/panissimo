using System.Net;
using Panissimo.Application.Common;
using Panissimo.Application.Dashboard;
using Panissimo.Application.Inventory;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Organization;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Dashboard;

/// <summary>
/// RN-118: the menu badges. The user works only at a plant of its own, so the documents of other tests do not reach the
/// counts. Moves inventory (the voucher).
/// </summary>
[Collection(ApiCollection.Name)]
public class PendingTasksTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    private async Task<HttpClient> UserAsync(HttpClient admin, Guid plant, params string[] permissions)
    {
        var role = await OkAsync<RoleDto>(admin.PostJsonAsync("/api/v1/roles",
            new CreateRoleRequest($"Pendientes {Guid.NewGuid():N}"[..20], "Prueba de pendientes", permissions)));
        var email = ApiFactory.UniqueEmail("pendientes");
        await OkAsync<UserDto>(admin.PostJsonAsync("/api/v1/users",
            new CreateUserRequest(email, "Pendientes", ApiFactory.DefaultPassword, [role.Id], [plant], plant)));
        return await factory.LoginAsync(email);
    }

    [Fact]
    public async Task Each_count_follows_its_documents_and_needs_its_permission()
    {
        var admin = await factory.LoginAsAdminAsync();
        // "PLT…" sorts after PLANTA: the services that take the first plant by code keep taking PLANTA.
        var code = $"PLT{Guid.NewGuid():N}"[..8].ToUpperInvariant();
        var plant = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest(code, "Planta de pendientes", LocationType.Plant, null)));
        var mp = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"{code}-MP", "Materias primas", LocationType.Warehouse, null, plant.Id)));
        var pt = await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest($"{code}-PT", "Producto terminado", LocationType.Warehouse, null, plant.Id)));
        var user = await UserAsync(admin, plant.Id, "purchasing.view", "purchasing.po.approve", "purchasing.receive", "production.view",
            "production.orders.close", "inventory.view", "inventory.internal_transfers");
        Task<PendingTasksDto> TasksAsync() => OkAsync<PendingTasksDto>(user.GetAsync($"/api/v1/my-tasks?locationId={plant.Id}"));

        Assert.Equal(new PendingTasksDto(0, 0, 0, 0, 0, 0), await TasksAsync());

        // A purchase order waits for approval, then for its receipt.
        var flour = await factory.CreateItemAsync("HAR");
        var supplier = await OkAsync<SupplierDto>(admin.PostJsonAsync("/api/v1/suppliers",
            new CreateSupplierRequest($"PEN980312{Random.Shared.Next(100, 999)}", "Proveedor", null, null, null, 0)));
        await OkAsync<SupplierItemDto>(admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items",
            new CreateSupplierItemRequest(flour.Id, null, 10, 1, true)));
        var po = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync("/api/v1/purchase-orders",
            new CreatePurchaseOrderRequest(supplier.Id, plant.Id, Today.AddDays(3), null, [new PurchaseOrderLineRequest(null, flour.Id, 10, null)])));
        po = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync($"/api/v1/purchase-orders/{po.Id}/submit", new VersionRequest(po.Version)));
        Assert.Equal((1, 0), ((await TasksAsync()).PurchaseOrdersToApprove, (await TasksAsync()).PurchaseOrdersToReceive));
        await OkAsync<PurchaseOrderDto>(user.PostJsonAsync($"/api/v1/purchase-orders/{po.Id}/approve", new VersionRequest(po.Version)));
        Assert.Equal((0, 1), ((await TasksAsync()).PurchaseOrdersToApprove, (await TasksAsync()).PurchaseOrdersToReceive));

        // A released production order waits to be produced.
        var bread = await factory.CreateItemAsync("BOL", ItemType.FinishedGood, "pza");
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes",
            new CreateRecipeRequest(bread.Id, 100, null, [new RecipeLineRequest(flour.Id, 5, 0)])));
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant.Id, bread.Id, 100, Today, null, null)));
        Assert.Equal(0, (await TasksAsync()).ProductionOrdersToProduce); // a draft is not pending yet
        await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));
        Assert.Equal((1, 0), ((await TasksAsync()).ProductionOrdersToProduce, (await TasksAsync()).ProductionOrdersInProgress));

        // An internal voucher waits to be sent, then to be received.
        await factory.AddStockAsync(mp.Id, flour.Id, 20, 10m);
        var voucher = await OkAsync<TransferDto>(admin.PostJsonAsync("/api/v1/internal-transfers",
            new CreateInternalTransferRequest(mp.Id, pt.Id, null, [new TransferLineRequest(flour.Id, null, 5)])));
        Assert.Equal((1, 0), ((await TasksAsync()).VouchersToSend, (await TasksAsync()).VouchersToReceive));
        await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/internal-transfers/{voucher.Id}/dispatch",
            new DispatchInternalTransferRequest(voucher.Version, null)));
        Assert.Equal((0, 1), ((await TasksAsync()).VouchersToSend, (await TasksAsync()).VouchersToReceive));

        // Without a permission its count is null; without any of them, no badges at all.
        var buyer = await UserAsync(admin, plant.Id, "purchasing.view", "purchasing.receive");
        Assert.Equal(new PendingTasksDto(null, 1, null, null, null, null),
            await OkAsync<PendingTasksDto>(buyer.GetAsync($"/api/v1/my-tasks?locationId={plant.Id}")));
        var viewer = await UserAsync(admin, plant.Id, "inventory.view");
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.GetAsync("/api/v1/my-tasks")).StatusCode);

        // Another location is out of the user's scope.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await user.GetAsync($"/api/v1/my-tasks?locationId={await factory.LocationIdAsync("PLANTA")}")).StatusCode);
    }
}
