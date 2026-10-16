using System.Net;
using System.Net.Http.Json;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Logistics;
using Sgo.Domain.Inventory;
using Sgo.Domain.Logistics;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Logistics;

[Collection(ApiCollection.Name)]
public class BranchOrderTests(SgoApiFactory factory)
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

    private static BranchOrderLineRequest B(Guid itemId, decimal quantity) => new(itemId, quantity);

    private static async Task<ItemDto> ItemAsync(HttpClient admin) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = false });

    private static async Task StockAsync(HttpClient admin, Guid locationId, Guid itemId, decimal quantity) =>
        await OkAsync<AdjustmentDto>(await admin.PostAsJsonAsync("/api/v1/adjustments", new CreateAdjustmentRequest(locationId,
            AdjustmentReason.Correction, "Existencia de prueba", [new AdjustmentLineRequest(itemId, null, null, null, quantity, 10m, null)])));

    private static async Task<decimal> OnHandAsync(HttpClient client, Guid locationId, Guid itemId) =>
        (await client.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={locationId}&itemId={itemId}"))!
        .Items.SingleOrDefault()?.OnHand ?? 0;

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, Guid branch, Guid supplier, params BranchOrderLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/branch-orders", new CreateBranchOrderRequest(branch, supplier, Today.AddDays(1), null, lines));

    private static Task<HttpResponseMessage> ActAsync(HttpClient client, BranchOrderDto order, string action) =>
        client.PostAsJsonAsync($"/api/v1/branch-orders/{order.Id}/{action}", new VersionRequest(order.Version));

    private static Task<HttpResponseMessage> ApproveAsync(HttpClient client, BranchOrderDto order, params (Guid ItemId, decimal Qty)[] approved) =>
        client.PostAsJsonAsync($"/api/v1/branch-orders/{order.Id}/approve", new ApproveBranchOrderRequest(order.Version,
            order.Lines.Select(l => new ApproveLineRequest(l.Id, approved.Single(a => a.ItemId == l.ItemId).Qty)).ToList()));

    private static async Task<BranchOrderDto> SubmittedAsync(HttpClient client, Guid branch, Guid supplier, params BranchOrderLineRequest[] lines) =>
        await OkAsync<BranchOrderDto>(await ActAsync(client, await OkAsync<BranchOrderDto>(await CreateAsync(client, branch, supplier, lines)), "submit"));

    private static async Task<TransferDto> TransferAsync(HttpClient client, Guid id) => (await client.GetJsonAsync<TransferDto>($"/api/v1/transfers/{id}"))!;

    private static Task<HttpResponseMessage> DispatchAsync(HttpClient client, TransferDto transfer) =>
        client.PostAsJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch", new DispatchTransferRequest(transfer.Version, "Nissan NP300", "Juan Pérez", null));

    private static Task<HttpResponseMessage> ReceiveAsync(HttpClient client, TransferDto transfer, Func<TransferLineDto, ReceiveLineRequest>? line = null) =>
        client.PostAsJsonAsync($"/api/v1/transfers/{transfer.Id}/receive", new ReceiveTransferRequest(transfer.Version,
            transfer.Lines.Select(line ?? (l => new ReceiveLineRequest(l.Id, l.ShippedQty, null, null))).ToList()));

    private static async Task<BranchOrderDto> OrderAsync(HttpClient client, Guid id) => (await client.GetJsonAsync<BranchOrderDto>($"/api/v1/branch-orders/{id}"))!;

    [Fact]
    public async Task Order_is_approved_into_a_transfer_and_fulfilled_when_received()
    {
        var admin = await AdminAsync();
        var (branch, com) = (await factory.LocationIdAsync("SUC-01"), await factory.LocationIdAsync("COM"));
        var bread = await ItemAsync(admin);
        var milk = await ItemAsync(admin);
        var jam = await ItemAsync(admin);
        await StockAsync(admin, com, bread.Id, 100);
        await StockAsync(admin, com, milk.Id, 50);
        var manager = await ClientAsync("Encargado de sucursal", "SUC-01");
        var warehouse = await ClientAsync("Almacén comisariato/fábrica", "COM");

        var order = await SubmittedAsync(manager, branch, com, B(bread.Id, 24m), B(milk.Id, 10m), B(jam.Id, 3m));
        Assert.StartsWith("PED-", order.Folio);
        Assert.Equal(BranchOrderStatus.Submitted, order.Status);
        Assert.Equal(100m, (await OrderAsync(warehouse, order.Id)).Lines.Single(l => l.ItemId == bread.Id).OnHandAtOrigin);

        // RN-20: the origin approves less bread and no jam; a draft transfer carries what was approved.
        order = await OkAsync<BranchOrderDto>(await ApproveAsync(warehouse, order, (bread.Id, 20m), (milk.Id, 10m), (jam.Id, 0m)));
        Assert.Equal(BranchOrderStatus.Approved, order.Status);
        var link = Assert.Single(order.Transfers);
        var transfer = await TransferAsync(warehouse, link.Id);
        Assert.Equal((TransferStatus.Draft, order.Id, com, branch), (transfer.Status, transfer.BranchOrderId, transfer.From.Id, transfer.To.Id));
        Assert.Equal(new Dictionary<Guid, decimal> { [bread.Id] = 20m, [milk.Id] = 10m }, transfer.Lines.ToDictionary(l => l.ItemId, l => l.ShippedQty));
        Assert.Contains(order.Folio, transfer.Notes);
        Assert.Equal(order.Folio, transfer.BranchOrderFolio);
        Assert.Equal(order.Folio, (await warehouse.GetJsonAsync<PagedResult<TransferListItemDto>>("/api/v1/transfers?pageSize=100"))!
            .Items.Single(t => t.Id == transfer.Id).BranchOrderFolio);

        // Dispatch and receive with a loss in transit: the order counts what was dispatched (RN-24).
        transfer = await OkAsync<TransferDto>(await DispatchAsync(warehouse, transfer));
        Assert.Equal(BranchOrderStatus.Approved, (await OrderAsync(manager, order.Id)).Status);
        var received = await OkAsync<TransferDto>(await ReceiveAsync(manager, transfer, l => l.ItemId == milk.Id
            ? new ReceiveLineRequest(l.Id, 9, DiscrepancyReason.Damaged, "Envase roto")
            : new ReceiveLineRequest(l.Id, l.ShippedQty, null, null)));
        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, received.Status);

        order = await OrderAsync(manager, order.Id);
        Assert.Equal(BranchOrderStatus.Fulfilled, order.Status);
        Assert.NotNull(order.FulfilledAt);
        Assert.Equal((20m, 10m, 0m), (order.Lines.Single(l => l.ItemId == bread.Id).ShippedQty,
            order.Lines.Single(l => l.ItemId == milk.Id).ShippedQty, order.Lines.Single(l => l.ItemId == jam.Id).ShippedQty));
        Assert.Equal((20m, 9m), (await OnHandAsync(admin, branch, bread.Id), await OnHandAsync(admin, branch, milk.Id)));
        Assert.Equal(80m, await OnHandAsync(admin, com, bread.Id));
    }

    [Fact]
    public async Task Origin_may_ship_less_and_the_order_ends_partially_fulfilled()
    {
        var admin = await AdminAsync();
        var (branch, com) = (await factory.LocationIdAsync("SUC-02"), await factory.LocationIdAsync("COM"));
        var bread = await ItemAsync(admin);
        var other = await ItemAsync(admin);
        await StockAsync(admin, com, bread.Id, 100);
        await StockAsync(admin, com, other.Id, 100);

        var order = await SubmittedAsync(admin, branch, com, B(bread.Id, 24m));
        order = await OkAsync<BranchOrderDto>(await ApproveAsync(admin, order, (bread.Id, 24m)));
        var transfer = await TransferAsync(admin, order.Transfers.Single().Id);

        Task<HttpResponseMessage> EditAsync(Guid to, params TransferLineRequest[] lines) =>
            admin.PutAsJsonAsync($"/api/v1/transfers/{transfer.Id}", new UpdateTransferRequest(transfer.Version, to, null, lines));

        Assert.Equal("transfer_exceeds_order", await (await EditAsync(branch, new TransferLineRequest(bread.Id, null, 25))).ProblemCodeAsync());
        Assert.Equal("transfer_exceeds_order", await (await EditAsync(branch,
            new TransferLineRequest(bread.Id, null, 10), new TransferLineRequest(other.Id, null, 1))).ProblemCodeAsync());
        Assert.Equal("transfer_order_destination",
            await (await EditAsync(await factory.LocationIdAsync("SUC-03"), new TransferLineRequest(bread.Id, null, 10))).ProblemCodeAsync());

        transfer = await OkAsync<TransferDto>(await EditAsync(branch, new TransferLineRequest(bread.Id, null, 15)));
        transfer = await OkAsync<TransferDto>(await DispatchAsync(admin, transfer));
        await OkAsync<TransferDto>(await ReceiveAsync(admin, transfer));

        order = await OrderAsync(admin, order.Id);
        Assert.Equal((BranchOrderStatus.PartiallyFulfilled, 24m, 15m),
            (order.Status, order.Lines.Single().ApprovedQty!.Value, order.Lines.Single().ShippedQty));
    }

    [Fact]
    public async Task Cancelling_the_order_transfer_cancels_the_order()
    {
        var admin = await AdminAsync();
        var (branch, com) = (await factory.LocationIdAsync("SUC-03"), await factory.LocationIdAsync("COM"));
        var bread = await ItemAsync(admin);

        var order = await SubmittedAsync(admin, branch, com, B(bread.Id, 5m));
        order = await OkAsync<BranchOrderDto>(await ApproveAsync(admin, order, (bread.Id, 5m)));
        Assert.Equal("branch_order_invalid_status", await (await ActAsync(admin, order, "cancel")).ProblemCodeAsync());

        var transfer = await TransferAsync(admin, order.Transfers.Single().Id);
        await OkAsync<TransferDto>(await admin.PostAsJsonAsync($"/api/v1/transfers/{transfer.Id}/cancel", new VersionRequest(transfer.Version)));

        order = await OrderAsync(admin, order.Id);
        Assert.Equal((BranchOrderStatus.Cancelled, TransferStatus.Cancelled), (order.Status, order.Transfers.Single().Status));
    }

    [Fact]
    public async Task Suggestion_uses_min_max_with_stock_in_transit_and_pending_orders()
    {
        var admin = await AdminAsync();
        var (branch, com) = (await factory.LocationIdAsync("SUC-04"), await factory.LocationIdAsync("COM"));
        var low = await ItemAsync(admin);        // on hand 5 → 40 − 5 = 35
        var transit = await ItemAsync(admin);    // on hand 4 + in transit 6 = 10 ≤ 10 → 30
        var pending = await ItemAsync(admin);    // on hand 4 + submitted order 7 = 11 > 10 → nothing
        var enough = await ItemAsync(admin);     // on hand 20 → nothing
        foreach (var item in new[] { low, transit, pending, enough })
            await OkAsync<List<ItemLocationSettingDto>>(await admin.PutAsJsonAsync($"/api/v1/items/{item.Id}/location-settings",
                new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(branch, 10, 40)])));
        await StockAsync(admin, branch, low.Id, 5);
        await StockAsync(admin, branch, transit.Id, 4);
        await StockAsync(admin, branch, pending.Id, 4);
        await StockAsync(admin, branch, enough.Id, 20);
        await StockAsync(admin, com, transit.Id, 50);

        var direct = await OkAsync<TransferDto>(await admin.PostAsJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(com, branch, null, [new TransferLineRequest(transit.Id, null, 6)])));
        await OkAsync<TransferDto>(await DispatchAsync(admin, direct));
        await SubmittedAsync(admin, branch, com, B(pending.Id, 7m));

        var manager = await ClientAsync("Encargado de sucursal", "SUC-04");
        var suggestion = (await manager.GetJsonAsync<List<BranchOrderSuggestionDto>>($"/api/v1/branch-orders/suggestion?locationId={branch}"))!;

        var mine = suggestion.Where(s => new[] { low.Id, transit.Id, pending.Id, enough.Id }.Contains(s.ItemId)).ToDictionary(s => s.ItemId);
        Assert.Equal(2, mine.Count);
        Assert.Equal((5m, 0m, 0m, 35m), (mine[low.Id].OnHand, mine[low.Id].InTransit, mine[low.Id].Pending, mine[low.Id].SuggestedQty));
        Assert.Equal((4m, 6m, 30m), (mine[transit.Id].OnHand, mine[transit.Id].InTransit, mine[transit.Id].SuggestedQty));

        var other = await ClientAsync("Encargado de sucursal", "SUC-05");
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/v1/branch-orders/suggestion?locationId={branch}")).StatusCode);
    }

    [Fact]
    public async Task Order_rules_permissions_and_scope()
    {
        var admin = await AdminAsync();
        var (branch, com, fab) = (await factory.LocationIdAsync("SUC-05"), await factory.LocationIdAsync("COM"), await factory.LocationIdAsync("FAB"));
        var bread = await ItemAsync(admin);

        Assert.Equal("branch_order_requires_branch", await (await CreateAsync(admin, fab, com, B(bread.Id, 1m))).ProblemCodeAsync());
        Assert.Equal("branch_order_invalid_supplier",
            await (await CreateAsync(admin, branch, await factory.LocationIdAsync("SUC-06"), B(bread.Id, 1m))).ProblemCodeAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(branch, com, Today.AddDays(-1), null, [B(bread.Id, 1)]))).StatusCode);

        var manager = await ClientAsync("Encargado de sucursal", "SUC-05");
        var draft = await OkAsync<BranchOrderDto>(await CreateAsync(manager, branch, com, B(bread.Id, 1m)));
        draft = await OkAsync<BranchOrderDto>(await manager.PutAsJsonAsync($"/api/v1/branch-orders/{draft.Id}",
            new UpdateBranchOrderRequest(draft.Version, fab, Today.AddDays(2), "Urgente", [B(bread.Id, 6)])));
        Assert.Equal((fab, 6m, "Urgente"), (draft.SupplyingLocation.Id, draft.Lines.Single().RequestedQty, draft.Notes));
        var order = await OkAsync<BranchOrderDto>(await ActAsync(manager, draft, "submit"));

        // The branch does not approve; the warehouse of another location cannot either.
        Assert.Equal(HttpStatusCode.Forbidden, (await ApproveAsync(manager, order, (bread.Id, 6m))).StatusCode);
        var comWarehouse = await ClientAsync("Almacén comisariato/fábrica", "COM");
        Assert.Equal(HttpStatusCode.Forbidden, (await ApproveAsync(comWarehouse, order, (bread.Id, 6m))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await comWarehouse.GetAsync($"/api/v1/branch-orders/{order.Id}")).StatusCode);

        var fabWarehouse = await ClientAsync("Almacén comisariato/fábrica", "FAB");
        Assert.Equal("branch_order_nothing_approved", await (await ApproveAsync(fabWarehouse, order, (bread.Id, 0m))).ProblemCodeAsync());
        var rejected = await OkAsync<BranchOrderDto>(await fabWarehouse.PostAsJsonAsync($"/api/v1/branch-orders/{order.Id}/reject",
            new RejectBranchOrderRequest(order.Version, "Sin existencia hasta el lunes")));
        Assert.Equal((BranchOrderStatus.Rejected, "Sin existencia hasta el lunes"), (rejected.Status, rejected.RejectionReason));
        Assert.Empty(rejected.Transfers);

        // Visible to the branch and to the origin, filtered for the rest.
        var otherBranch = await ClientAsync("Encargado de sucursal", "SUC-06");
        Assert.Equal(HttpStatusCode.Forbidden, (await otherBranch.GetAsync($"/api/v1/branch-orders/{order.Id}")).StatusCode);
        Assert.DoesNotContain((await otherBranch.GetJsonAsync<PagedResult<BranchOrderListItemDto>>("/api/v1/branch-orders?pageSize=100"))!.Items,
            o => o.Id == order.Id);
        Assert.Contains((await fabWarehouse.GetJsonAsync<PagedResult<BranchOrderListItemDto>>($"/api/v1/branch-orders?requestingLocationId={branch}"))!.Items,
            o => o.Id == order.Id);

        var cancelled = await OkAsync<BranchOrderDto>(await ActAsync(manager, await OkAsync<BranchOrderDto>(await CreateAsync(manager, branch, com, B(bread.Id, 1m))), "cancel"));
        Assert.Equal(BranchOrderStatus.Cancelled, cancelled.Status);
    }
}
