using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Purchasing;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class PurchaseOrderTests(ApiFactory factory)
{
    private const string Letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private static DateOnly InAWeek => DateOnly.FromDateTime(DateTime.UtcNow).AddDays(7);

    private static string NewTaxId() =>
        string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)])) + "980312"
        + string.Concat(Enumerable.Range(0, 3).Select(_ => Letters[Random.Shared.Next(Letters.Length)]));

    private static async Task<SupplierDto> SupplierSellingAsync(HttpClient admin, params (Guid ItemId, decimal Price)[] items)
    {
        var response = await admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest(NewTaxId(), "Molino del Centro", null, null, null, 30));
        var supplier = (await response.Content.ReadJsonAsync<SupplierDto>())!;
        foreach (var (itemId, price) in items)
            Assert.Equal(HttpStatusCode.Created, (await admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items",
                new CreateSupplierItemRequest(itemId, null, price, 2, true))).StatusCode);
        return supplier;
    }

    private async Task<PurchaseOrderDto> CreateOrderAsync(HttpClient client, Guid supplierId, params PurchaseOrderLineRequest[] lines)
    {
        var response = await client.PostJsonAsync("/api/v1/purchase-orders",
            new CreatePurchaseOrderRequest(supplierId, await factory.LocationIdAsync("PLANTA"), InAWeek, null, lines));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<PurchaseOrderDto>())!;
    }

    private static async Task<PurchaseOrderDto> ActAsync(HttpClient client, PurchaseOrderDto order, string action,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        var response = await client.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/{action}", new VersionRequest(order.Version));
        Assert.Equal(expected, response.StatusCode);
        return expected == HttpStatusCode.OK ? (await response.Content.ReadJsonAsync<PurchaseOrderDto>())! : order;
    }

    /// <summary>With the default threshold (0) every order waits for approval.</summary>
    private async Task<PurchaseOrderDto> ApprovedOrderAsync(HttpClient admin, Guid supplierId, params PurchaseOrderLineRequest[] lines)
    {
        var submitted = await ActAsync(admin, await CreateOrderAsync(admin, supplierId, lines), "submit");
        Assert.Equal(PurchaseOrderStatus.PendingApproval, submitted.Status);
        return await ActAsync(admin, submitted, "approve");
    }

    private static Task<HttpResponseMessage> ReceiveAsync(HttpClient client, PurchaseOrderDto order, params GoodsReceiptLineRequest[] lines) =>
        client.PostJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id, order.Version, "A-100", null, lines));

    private static async Task<GoodsReceiptDto> ReceivedAsync(HttpClient client, PurchaseOrderDto order, params GoodsReceiptLineRequest[] lines)
    {
        var response = await ReceiveAsync(client, order, lines);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadJsonAsync<GoodsReceiptDto>())!;
    }

    private static Task<PurchaseOrderDto?> ReloadAsync(HttpClient client, PurchaseOrderDto order) =>
        client.GetJsonAsync<PurchaseOrderDto>($"/api/v1/purchase-orders/{order.Id}");

    [Fact]
    public async Task Full_purchase_requisition_order_approval_partial_and_final_receipts_with_lots_and_cost()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var flour = await factory.CreateItemAsync("HAR", tracksLots: true, shelfLifeDays: 90, purchaseUom: "bulto", purchaseToBaseFactor: 44);
        var supplier = await SupplierSellingAsync(admin, (flour.Id, 880m));

        // Requisition → approved → converted into a draft order.
        var created = await admin.PostJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(plant, InAWeek, null, [new RequisitionLineRequest(flour.Id, 10, null)]));
        var requisition = (await created.Content.ReadJsonAsync<RequisitionDto>())!;
        foreach (var action in new[] { "submit", "approve" })
            requisition = (await (await admin.PostJsonAsync($"/api/v1/requisitions/{requisition.Id}/{action}",
                new VersionRequest(requisition.Version))).Content.ReadJsonAsync<RequisitionDto>())!;
        var converted = (await (await admin.PostJsonAsync("/api/v1/requisitions/convert",
            new ConvertRequisitionsRequest([requisition.Id]))).Content.ReadJsonAsync<ConvertRequisitionsResult>())!;
        var order = (await admin.GetJsonAsync<PurchaseOrderDto>($"/api/v1/purchase-orders/{converted.PurchaseOrders.Single().Id}"))!;
        Assert.Equal((PurchaseOrderStatus.Draft, 8800m, "bulto"), (order.Status, order.Subtotal, order.Lines.Single().UomCode));

        // Editing the price keeps the line's requisition.
        var line = order.Lines.Single();
        var edited = await admin.PutJsonAsync($"/api/v1/purchase-orders/{order.Id}", new UpdatePurchaseOrderRequest(order.Version,
            plant, InAWeek, "Precio negociado", [new PurchaseOrderLineRequest(line.Id, flour.Id, 10, 902m)]));
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        order = (await edited.Content.ReadJsonAsync<PurchaseOrderDto>())!;
        Assert.Equal((9020m, requisition.Folio), (order.Subtotal, order.Lines.Single().RequisitionFolio));

        order = await ActAsync(admin, await ActAsync(admin, order, "submit"), "approve");
        Assert.False(order.ApprovedAutomatically);
        line = order.Lines.Single();

        // Partial receipt: 6 bultos = 264 kg at 902 / 44 = 20.5 per kg.
        var first = await ReceivedAsync(admin, order, new GoodsReceiptLineRequest(line.Id, 6, "L-A", new DateOnly(2027, 1, 31)));
        Assert.Equal((PurchaseOrderStatus.PartiallyReceived, 264m, 20.5m, 5412m),
            (first.PurchaseOrderStatus, first.Lines.Single().BaseQuantity, first.Lines.Single().UnitCostBase, first.TotalCost));
        Assert.Equal(264m, await factory.StockAsync(plant, flour.Id));

        // Final receipt in two lots; L-B gets the default expiration (today + shelf life).
        order = (await ReloadAsync(admin, order))!;
        Assert.Equal(4m, order.Lines.Single().PendingQty);
        var final = await ReceivedAsync(admin, order,
            new GoodsReceiptLineRequest(line.Id, 3, "L-B", null), new GoodsReceiptLineRequest(line.Id, 1, "L-C", null));
        Assert.Equal(PurchaseOrderStatus.Received, final.PurchaseOrderStatus);
        Assert.All(final.Lines, l => Assert.NotNull(l.ExpirationDate));
        Assert.Equal(440m, await factory.StockAsync(plant, flour.Id));

        await using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var movements = await db.InventoryMovements.Where(m => m.ItemId == flour.Id).ToListAsync();
            Assert.Equal(3, movements.Count);
            Assert.All(movements, m => Assert.Equal((MovementType.PurchaseReceipt, 20.5m), (m.Type, m.UnitCost)));
            Assert.Equal(3, movements.Select(m => m.LotId).Distinct().Count());
            Assert.Equal(20.5m, await db.ItemLocationCosts.Where(c => c.LocationId == plant && c.ItemId == flour.Id).Select(c => c.AverageCost).SingleAsync());
        }

        order = (await ReloadAsync(admin, order))!;
        Assert.Equal(2, order.Receipts.Count);
        var closeReceived = await admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/close", new ClosePurchaseOrderRequest(order.Version, "X"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, closeReceived.StatusCode);
        var history = await admin.GetJsonAsync<PagedResult<GoodsReceiptListItemDto>>($"/api/v1/goods-receipts?purchaseOrderId={order.Id}");
        Assert.Equal(2, history!.Total);
        Assert.Equal((first.Folio, "A-100"), (history.Items.Single(r => r.Id == first.Id).Folio, history.Items[0].SupplierInvoiceNumber));
    }

    [Fact]
    public async Task Below_the_threshold_the_order_is_approved_on_sending_and_rejecting_is_final()
    {
        var admin = await factory.LoginAsAdminAsync();
        var sugar = await factory.CreateItemAsync("AZU");
        var supplier = await SupplierSellingAsync(admin, (sugar.Id, 25m));
        var previous = await factory.SetSettingAsync(AppSettingKeys.PoApprovalThreshold, 1000);
        try
        {
            var small = await ActAsync(admin, await CreateOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 39, null)), "submit");
            Assert.Equal((PurchaseOrderStatus.Approved, true), (small.Status, small.ApprovedAutomatically)); // 975 < 1000

            var big = await ActAsync(admin, await CreateOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 40, null)), "submit");
            Assert.Equal(PurchaseOrderStatus.PendingApproval, big.Status); // 1000 ≥ 1000

            var noReason = await admin.PostJsonAsync($"/api/v1/purchase-orders/{big.Id}/reject", new RejectPurchaseOrderRequest(big.Version, ""));
            Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);
            var rejected = (await (await admin.PostJsonAsync($"/api/v1/purchase-orders/{big.Id}/reject",
                new RejectPurchaseOrderRequest(big.Version, "Precio alto"))).Content.ReadJsonAsync<PurchaseOrderDto>())!;
            Assert.Equal((PurchaseOrderStatus.Rejected, "Precio alto"), (rejected.Status, rejected.RejectionReason));
            await ActAsync(admin, rejected, "approve", HttpStatusCode.UnprocessableEntity);
            await ActAsync(admin, rejected, "cancel", HttpStatusCode.UnprocessableEntity);
        }
        finally
        {
            await factory.SetSettingAsync(AppSettingKeys.PoApprovalThreshold, previous);
        }
    }

    [Fact]
    public async Task Over_receipt_is_allowed_only_up_to_the_tolerance()
    {
        var admin = await factory.LoginAsAdminAsync();
        var sugar = await factory.CreateItemAsync("AZU");
        var supplier = await SupplierSellingAsync(admin, (sugar.Id, 25m));
        var order = await ApprovedOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 10, null));
        var line = order.Lines.Single();

        // Default tolerance 0 %.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await ReceiveAsync(admin, order, new GoodsReceiptLineRequest(line.Id, 10.5m, null, null))).StatusCode);

        var previous = await factory.SetSettingAsync(AppSettingKeys.ReceiptTolerancePct, 10);
        try
        {
            order = (await ReloadAsync(admin, order))!;
            Assert.Equal(11m, order.Lines.Single().MaxReceivableQty);
            var receipt = await ReceivedAsync(admin, order, new GoodsReceiptLineRequest(line.Id, 11, null, null));
            Assert.Equal(PurchaseOrderStatus.Received, receipt.PurchaseOrderStatus);

            order = (await ReloadAsync(admin, order))!;
            var more = await ReceiveAsync(admin, order, new GoodsReceiptLineRequest(line.Id, 0.1m, null, null));
            Assert.Equal(HttpStatusCode.UnprocessableEntity, more.StatusCode); // a received order takes no more
        }
        finally
        {
            await factory.SetSettingAsync(AppSettingKeys.ReceiptTolerancePct, previous);
        }
        Assert.Equal(11m, await factory.StockAsync(await factory.LocationIdAsync("PLANTA"), sugar.Id));
    }

    [Fact]
    public async Task Simultaneous_receipts_of_the_same_order_succeed_once()
    {
        var admin = await factory.LoginAsAdminAsync();
        var sugar = await factory.CreateItemAsync("AZU");
        var supplier = await SupplierSellingAsync(admin, (sugar.Id, 25m));
        var order = await ApprovedOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 10, null));
        var line = order.Lines.Single();

        var responses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ =>
            ReceiveAsync(admin, order, new GoodsReceiptLineRequest(line.Id, 4, null, null))));

        Assert.Equal([HttpStatusCode.Created, HttpStatusCode.Conflict], responses.Select(r => r.StatusCode).Order());
        Assert.Equal(4m, await factory.StockAsync(await factory.LocationIdAsync("PLANTA"), sugar.Id));
        Assert.Equal(4m, (await ReloadAsync(admin, order))!.Lines.Single().ReceivedQty);
    }

    [Fact]
    public async Task Cancel_close_catalog_and_lot_rules()
    {
        var admin = await factory.LoginAsAdminAsync();
        var sugar = await factory.CreateItemAsync("AZU");
        var yeast = await factory.CreateItemAsync("LEV", tracksLots: true);
        var other = await factory.CreateItemAsync("SAL");
        var supplier = await SupplierSellingAsync(admin, (sugar.Id, 25m), (yeast.Id, 90m));

        // RN-30: only items of the supplier's catalog.
        var notSold = await admin.PostJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplier.Id,
            await factory.LocationIdAsync("PLANTA"), InAWeek, null, [new PurchaseOrderLineRequest(null, other.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.BadRequest, notSold.StatusCode);
        var atBranch = await admin.PostJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplier.Id,
            await factory.LocationIdAsync("SUC-01"), InAWeek, null, [new PurchaseOrderLineRequest(null, sugar.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, atBranch.StatusCode);

        // Approved without receipts: cancellable. Drafts are not receivable.
        var draft = await CreateOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 1, null));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await ReceiveAsync(admin, draft, new GoodsReceiptLineRequest(draft.Lines[0].Id, 1, null, null))).StatusCode);
        var approved = await ApprovedOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 1, null));
        Assert.Equal(PurchaseOrderStatus.Cancelled, (await ActAsync(admin, approved, "cancel")).Status);

        // Lots: required for yeast, not allowed for sugar.
        var order = await ApprovedOrderAsync(admin, supplier.Id,
            new PurchaseOrderLineRequest(null, sugar.Id, 10, null), new PurchaseOrderLineRequest(null, yeast.Id, 5, null));
        var (sugarLine, yeastLine) = (order.Lines[0], order.Lines[1]);
        Assert.Equal(HttpStatusCode.BadRequest, (await ReceiveAsync(admin, order, new GoodsReceiptLineRequest(yeastLine.Id, 5, null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ReceiveAsync(admin, order, new GoodsReceiptLineRequest(sugarLine.Id, 5, "L1", null))).StatusCode);

        // Partially received: no cancel, close with balance, then nothing else is received.
        await ReceivedAsync(admin, order, new GoodsReceiptLineRequest(sugarLine.Id, 10, null, null));
        order = (await ReloadAsync(admin, order))!;
        Assert.Equal(PurchaseOrderStatus.PartiallyReceived, order.Status);
        await ActAsync(admin, order, "cancel", HttpStatusCode.UnprocessableEntity);
        var noReason = await admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/close", new ClosePurchaseOrderRequest(order.Version, ""));
        Assert.Equal(HttpStatusCode.BadRequest, noReason.StatusCode);
        var closed = (await (await admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/close",
            new ClosePurchaseOrderRequest(order.Version, "El proveedor no surte la levadura"))).Content.ReadJsonAsync<PurchaseOrderDto>())!;
        Assert.Equal((PurchaseOrderStatus.Closed, "El proveedor no surte la levadura"), (closed.Status, closed.CloseReason));
        Assert.Equal(HttpStatusCode.UnprocessableEntity,
            (await ReceiveAsync(admin, closed, new GoodsReceiptLineRequest(yeastLine.Id, 5, "L1", null))).StatusCode);

        var toReceive = await admin.GetJsonAsync<PagedResult<PurchaseOrderListItemDto>>($"/api/v1/purchase-orders?pendingReceipt=true&supplierId={supplier.Id}");
        Assert.Empty(toReceive!.Items);
    }

    [Fact]
    public async Task Warehouse_receives_but_does_not_manage_orders()
    {
        var admin = await factory.LoginAsAdminAsync();
        var sugar = await factory.CreateItemAsync("AZU");
        var supplier = await SupplierSellingAsync(admin, (sugar.Id, 25m));
        var order = await ApprovedOrderAsync(admin, supplier.Id, new PurchaseOrderLineRequest(null, sugar.Id, 2, null));

        var email = ApiFactory.UniqueEmail("almacen");
        await factory.CreateUserAsync(email, ["plant_warehouse"], ["PLANTA"]);
        var warehouse = await factory.LoginAsync(email);

        var create = await warehouse.PostJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplier.Id,
            await factory.LocationIdAsync("PLANTA"), InAWeek, null, [new PurchaseOrderLineRequest(null, sugar.Id, 1, null)]));
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);
        await ActAsync(warehouse, order, "approve", HttpStatusCode.Forbidden);
        await ReceivedAsync(warehouse, order, new GoodsReceiptLineRequest(order.Lines[0].Id, 2, null, null));

        var branchEmail = ApiFactory.UniqueEmail("sucursal");
        await factory.CreateUserAsync(branchEmail, ["branch_manager"], ["SUC-01"]);
        var branch = await factory.LoginAsync(branchEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await branch.GetAsync("/api/v1/goods-receipts")).StatusCode);
    }
}
