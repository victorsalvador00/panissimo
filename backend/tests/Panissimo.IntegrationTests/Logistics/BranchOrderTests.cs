using System.Net;
using Panissimo.Application.Catalog;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Logistics;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Logistics;

[Collection(ApiCollection.Name)]
public class BranchOrderTests(ApiFactory factory)
{
    private static DateOnly Tomorrow => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2);

    private async Task<HttpClient> UserAsync(string role, string location)
    {
        var email = ApiFactory.UniqueEmail(role);
        await factory.CreateUserAsync(email, [role], [location]);
        return await factory.LoginAsync(email);
    }

    private async Task<BranchOrderDto> CreateAsync(HttpClient client, string branch, params BranchOrderLineRequest[] lines)
    {
        var response = await client.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync(branch), Tomorrow, null, lines));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<BranchOrderDto>())!;
    }

    private static async Task<BranchOrderDto> ActAsync(HttpClient client, BranchOrderDto order, string action, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await client.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/{action}", new VersionRequest(order.Version));
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.OK ? (await response.Content.ReadJsonAsync<BranchOrderDto>())! : order;
    }

    private static async Task<BranchOrderDto> ApproveAsync(HttpClient client, BranchOrderDto order, params decimal[] quantities)
    {
        var response = await client.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/approve", new ApproveBranchOrderRequest(order.Version,
            order.Lines.Select((l, i) => new ApproveBranchOrderLineRequest(l.Id, quantities[i])).ToList()));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadJsonAsync<BranchOrderDto>())!;
    }

    private static async Task<BranchOrderDto> ReloadAsync(HttpClient client, BranchOrderDto order) =>
        (await client.GetJsonAsync<BranchOrderDto>($"/api/v1/branch-orders/{order.Id}"))!;

    private static async Task<TransferDto> TransferAsync(HttpClient client, BranchOrderDto order) =>
        (await client.GetJsonAsync<TransferDto>($"/api/v1/transfers/{order.Transfers.Single().Id}"))!;

    private static async Task<TransferDto> DispatchAsync(HttpClient client, TransferDto transfer)
    {
        var response = await client.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, "Camioneta 3", "Luis", null));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadJsonAsync<TransferDto>())!;
    }

    [Fact]
    public async Task Order_to_transfer_to_dispatch_to_receipt_is_fulfilled()
    {
        var plant = await factory.LocationIdAsync("PLANTA");
        var branchId = await factory.LocationIdAsync("SUC-01");
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var bags = await factory.CreateItemAsync("BOLSA", ItemType.Supply);
        await factory.AddStockAsync(plant, bread.Id, 500, 1.5m);
        await factory.AddStockAsync(plant, bags.Id, 50, 30m);
        var branch = await UserAsync("branch_manager", "SUC-01");
        var warehouse = await UserAsync("plant_warehouse", "PLANTA");

        var order = await CreateAsync(branch, "SUC-01", new BranchOrderLineRequest(bread.Id, 100), new BranchOrderLineRequest(bags.Id, 5));
        order = await ActAsync(branch, order, "submit");
        await ActAsync(branch, order, "approve", HttpStatusCode.Forbidden);

        var toApprove = await warehouse.GetJsonAsync<PagedResult<BranchOrderListItemDto>>($"/api/v1/branch-orders?tab=ToApprove&q={order.Folio}");
        Assert.Equal([order.Id], toApprove!.Items.Select(o => o.Id));
        Assert.Equal(500m, (await ReloadAsync(warehouse, order)).Lines[0].SupplyingStock);

        order = await ApproveAsync(warehouse, order, 80, 5);
        Assert.Equal(BranchOrderStatus.Approved, order.Status);
        var transfer = await TransferAsync(warehouse, order);
        Assert.Equal((TransferStatus.Draft, order.Id, branchId), (transfer.Status, transfer.BranchOrderId, transfer.To.Id));
        Assert.Equal([80m, 5m], transfer.Lines.OrderBy(l => l.Sku == bags.Sku).Select(l => l.ShippedQty));

        await DispatchAsync(warehouse, transfer);
        order = await ReloadAsync(branch, order);
        Assert.Equal(BranchOrderStatus.Fulfilled, order.Status);
        Assert.Equal([80m, 5m], order.Lines.Select(l => l.ShippedQty));

        transfer = await TransferAsync(branch, order);
        var received = await branch.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive", new ReceiveTransferRequest(transfer.Version,
            transfer.Lines.Select(l => new ReceiveLineRequest(l.Id, l.ShippedQty, null, null)).ToList()));
        Assert.Equal(HttpStatusCode.OK, received.StatusCode);
        Assert.Equal(80m, await factory.StockAsync(branchId, bread.Id));
        Assert.Equal(420m, await factory.StockAsync(plant, bread.Id));
    }

    [Fact]
    public async Task Linked_transfer_edits_stay_within_the_approved_and_a_short_dispatch_partially_fulfills()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var other = await factory.CreateItemAsync("TELERA", ItemType.FinishedGood, "pza");
        await factory.AddStockAsync(plant, bread.Id, 500, 1.5m);

        var order = await ApproveAsync(admin, await ActAsync(admin, await CreateAsync(admin, "SUC-02", new BranchOrderLineRequest(bread.Id, 100)), "submit"), 80);
        var transfer = await TransferAsync(admin, order);

        Task<HttpResponseMessage> Edit(Guid to, params TransferLineRequest[] lines) =>
            admin.PutJsonAsync($"/api/v1/transfers/{transfer.Id}", new UpdateTransferRequest(transfer.Version, to, null, lines));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Edit(transfer.To.Id, new TransferLineRequest(bread.Id, null, 90))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Edit(transfer.To.Id, new TransferLineRequest(other.Id, null, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await Edit(await factory.LocationIdAsync("SUC-01"), new TransferLineRequest(bread.Id, null, 60))).StatusCode);

        var edited = await Edit(transfer.To.Id, new TransferLineRequest(bread.Id, null, 60));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        await DispatchAsync(admin, (await edited.Content.ReadJsonAsync<TransferDto>())!);

        order = await ReloadAsync(admin, order);
        Assert.Equal((BranchOrderStatus.PartiallyFulfilled, 80m, 60m), (order.Status, order.Lines[0].ApprovedQty!.Value, order.Lines[0].ShippedQty));
    }

    [Fact]
    public async Task Cancelling_the_linked_transfer_cancels_the_order()
    {
        var admin = await factory.LoginAsAdminAsync();
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var order = await ApproveAsync(admin, await ActAsync(admin, await CreateAsync(admin, "SUC-01", new BranchOrderLineRequest(bread.Id, 10)), "submit"), 10);

        await ActAsync(admin, order, "cancel", HttpStatusCode.UnprocessableEntity); // approved: cancel its transfer instead
        var transfer = await TransferAsync(admin, order);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/cancel", new VersionRequest(transfer.Version))).StatusCode);

        order = await ReloadAsync(admin, order);
        Assert.Equal((BranchOrderStatus.Cancelled, TransferStatus.Cancelled), (order.Status, order.Transfers.Single().Status));
    }

    [Fact]
    public async Task Branches_order_bulk_goods_and_supplies_only_and_approvals_need_something()
    {
        var admin = await factory.LoginAsAdminAsync();
        var packaged = await factory.CreateItemAsync("CONCHA-EMB", ItemType.FinishedGood, "pza", presentation: ItemPresentation.Packaged);
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished);
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var branchId = await factory.LocationIdAsync("SUC-01");

        foreach (var item in new[] { packaged, dough })
        {
            var response = await admin.PostJsonAsync("/api/v1/branch-orders",
                new CreateBranchOrderRequest(branchId, Tomorrow, null, [new BranchOrderLineRequest(item.Id, 10)]));
            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        }
        var fromPlant = await admin.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync("PLANTA"), Tomorrow, null, [new BranchOrderLineRequest(bread.Id, 10)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, fromPlant.StatusCode);
        var fractional = await admin.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(branchId, Tomorrow, null, [new BranchOrderLineRequest(bread.Id, 2.5m)]));
        Assert.Equal(HttpStatusCode.BadRequest, fractional.StatusCode);

        var order = await ActAsync(admin, await CreateAsync(admin, "SUC-01", new BranchOrderLineRequest(bread.Id, 10)), "submit");
        var allZero = await admin.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/approve",
            new ApproveBranchOrderRequest(order.Version, [new ApproveBranchOrderLineRequest(order.Lines[0].Id, 0)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, allZero.StatusCode);
        var tooMuch = await admin.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/approve",
            new ApproveBranchOrderRequest(order.Version, [new ApproveBranchOrderLineRequest(order.Lines[0].Id, 11)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooMuch.StatusCode);

        var rejected = await admin.PostJsonAsync($"/api/v1/branch-orders/{order.Id}/reject", new RejectBranchOrderRequest(order.Version, "Sin producción"));
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        var dto = (await rejected.Content.ReadJsonAsync<BranchOrderDto>())!;
        Assert.Equal((BranchOrderStatus.Rejected, "Sin producción"), (dto.Status, dto.RejectionReason));
        Assert.Empty(dto.Transfers);
    }

    [Fact]
    public async Task Suggestion_tops_up_to_the_maximum_counting_stock_transit_and_orders()
    {
        var admin = await factory.LoginAsAdminAsync();
        var branchId = await factory.LocationIdAsync("SUC-02");
        var low = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var enough = await factory.CreateItemAsync("TELERA", ItemType.FinishedGood, "pza");
        foreach (var (item, min, max) in new[] { (low, 10m, 50m), (enough, 10m, 50m) })
            Assert.Equal(HttpStatusCode.OK, (await admin.PutJsonAsync($"/api/v1/items/{item.Id}/location-settings",
                new UpdateItemLocationSettingsRequest([new ItemLocationSettingInput(branchId, min, max)]))).StatusCode);
        await factory.AddStockAsync(branchId, low.Id, 4, 1m);
        await factory.AddStockAsync(branchId, enough.Id, 30, 1m);
        await ActAsync(admin, await CreateAsync(admin, "SUC-02", new BranchOrderLineRequest(low.Id, 3)), "submit");

        var suggestion = (await admin.GetJsonAsync<IReadOnlyList<BranchOrderSuggestionDto>>($"/api/v1/branch-orders/suggestion?locationId={branchId}"))!;

        var row = suggestion.Single(s => s.ItemId == low.Id);
        Assert.Equal((4m, 0m, 3m, 7m, 43m), (row.Stock, row.InTransit, row.OnOrder, row.Projected, row.SuggestedQty));
        Assert.DoesNotContain(suggestion, s => s.ItemId == enough.Id);
    }

    [Fact]
    public async Task A_branch_orders_only_for_its_own_branches()
    {
        var bread = await factory.CreateItemAsync("BOLILLO", ItemType.FinishedGood, "pza");
        var branch = await UserAsync("branch_manager", "SUC-01");
        var response = await branch.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync("SUC-02"), Tomorrow, null, [new BranchOrderLineRequest(bread.Id, 1)]));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var past = await branch.PostJsonAsync("/api/v1/branch-orders",
            new CreateBranchOrderRequest(await factory.LocationIdAsync("SUC-01"), Tomorrow.AddDays(-10), null, [new BranchOrderLineRequest(bread.Id, 1)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, past.StatusCode);
    }
}
