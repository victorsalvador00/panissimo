using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Application.Purchasing;
using Sgo.Domain.Inventory;
using Sgo.Domain.Organization;
using Sgo.Domain.Purchasing;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;

namespace Sgo.IntegrationTests.Purchasing;

[Collection(ApiCollection.Name)]
public class PurchaseOrderTests(SgoApiFactory factory)
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(-6));

    private Task<HttpClient> AdminAsync() =>
        factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);

    private static async Task<T> OkAsync<T>(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return (await response.ReadJsonAsync<T>())!;
    }

    /// <summary>Bought by "caja" of 25 kg; 180 days of shelf life when it tracks lots.</summary>
    private static async Task<ItemDto> ItemAsync(HttpClient admin, bool tracksLots, decimal taxRate = 0m) =>
        await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = tracksLots, TaxRate = taxRate });

    private static async Task<SupplierDto> SupplierWithAsync(HttpClient admin, params (ItemDto Item, decimal Price)[] offers)
    {
        var supplier = await admin.CreateSupplierAsync();
        foreach (var (item, price) in offers)
            await OkAsync<SupplierItemDto>(await admin.AddSupplierItemAsync(supplier.Id, item.Id, price));
        return supplier;
    }

    private static PurchaseOrderLineRequest L(Guid itemId, decimal quantity, decimal? price = null, Guid? lineId = null) =>
        new(itemId, quantity, price, lineId);

    private static Task<HttpResponseMessage> CreateAsync(HttpClient client, Guid supplierId, Guid locationId, params PurchaseOrderLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/purchase-orders", new CreatePurchaseOrderRequest(supplierId, locationId, Today.AddDays(3), null, lines));

    private static Task<HttpResponseMessage> ActAsync(HttpClient client, PurchaseOrderDto order, string action) =>
        client.PostAsJsonAsync($"/api/v1/purchase-orders/{order.Id}/{action}", new VersionRequest(order.Version));

    private static Task<HttpResponseMessage> ReceiveAsync(HttpClient client, PurchaseOrderDto order, params GoodsReceiptLineRequest[] lines) =>
        client.PostAsJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id, order.Version, "F-100", lines));

    private static GoodsReceiptLineRequest R(PurchaseOrderDto order, Guid itemId, decimal quantity, string? lot = null, DateOnly? expiration = null) =>
        new(order.Lines.Single(l => l.ItemId == itemId).Id, quantity, lot, expiration);

    private static async Task<PurchaseOrderDto> GetAsync(HttpClient client, Guid id) =>
        (await client.GetJsonAsync<PurchaseOrderDto>($"/api/v1/purchase-orders/{id}"))!;

    /// <summary>Creates, submits (threshold 0 → pending) and approves.</summary>
    private async Task<PurchaseOrderDto> ApprovedAsync(HttpClient admin, Guid supplierId, Guid locationId, params PurchaseOrderLineRequest[] lines)
    {
        var order = await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplierId, locationId, lines));
        order = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, order, "submit"));
        return order.Status == PurchaseOrderStatus.Approved ? order : await OkAsync<PurchaseOrderDto>(await ActAsync(admin, order, "approve"));
    }

    private async Task WithSettingAsync(string key, string value, Func<Task> action)
    {
        async Task SetAsync(string v)
        {
            await using var scope = factory.CreateScope();
            var db = SgoApiFactory.Db(scope);
            (await db.AppSettings.SingleAsync(s => s.Key == key)).SetValue(v);
            await db.SaveChangesAsync();
        }

        var original = AppSettingKeys.Defaults.Single(s => s.Key == key).Value;
        await SetAsync(value);
        try { await action(); }
        finally { await SetAsync(original); }
    }

    private static async Task<List<Guid>> PendingReceiptIdsAsync(HttpClient client, Guid supplierId) =>
        (await client.GetJsonAsync<PagedResult<PurchaseOrderListItemDto>>(
            $"/api/v1/purchase-orders?supplierId={supplierId}&pendingReceipt=true"))!.Items.Select(o => o.Id).ToList();

    private async Task<StockLevelDto> StockAsync(HttpClient client, Guid locationId, Guid itemId) =>
        (await client.GetJsonAsync<PagedResult<StockLevelDto>>($"/api/v1/stock?locationId={locationId}&itemId={itemId}"))!.Items.Single();

    [Fact]
    public async Task Full_purchase_flow_with_partial_and_final_receipt_updates_stock_and_kardex()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var flour = await ItemAsync(admin, tracksLots: true);
        var sugar = await ItemAsync(admin, tracksLots: false, taxRate: 0.16m);
        var supplier = await SupplierWithAsync(admin, (flour, 412.5m), (sugar, 32m));

        // RN-30: empty price takes the catalog; an explicit one overrides it.
        var order = await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplier.Id, fab, L(flour.Id, 10), L(sugar.Id, 4, 30m)));
        Assert.Equal((PurchaseOrderStatus.Draft, 412.5m, 30m), (order.Status, order.Lines.Single(l => l.ItemId == flour.Id).UnitPrice,
            order.Lines.Single(l => l.ItemId == sugar.Id).UnitPrice));
        Assert.Equal((4245m, 19.2m, 4264.2m), (order.Subtotal, order.TaxTotal, order.Total));

        order = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, order, "submit"));
        Assert.Equal((PurchaseOrderStatus.PendingApproval, true), (order.Status, order.ApprovalRequired)); // threshold 0
        Assert.DoesNotContain(await PendingReceiptIdsAsync(admin, supplier.Id), id => id == order.Id);
        Assert.Equal("purchase_order_invalid_status", await (await ReceiveAsync(admin, order, R(order, sugar.Id, 1))).ProblemCodeAsync());
        order = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, order, "approve"));
        Assert.Equal(PurchaseOrderStatus.Approved, order.Status);
        Assert.Contains(order.Id, await PendingReceiptIdsAsync(admin, supplier.Id));

        // Partial receipt: flour in two lots (one without date → today + shelf life), all the sugar.
        var first = await OkAsync<GoodsReceiptDto>(await ReceiveAsync(admin, order,
            R(order, flour.Id, 4, "L-A", Today.AddDays(90)), R(order, flour.Id, 2, "L-B"), R(order, sugar.Id, 4)));
        Assert.StartsWith("REC-", first.Folio);
        Assert.Equal(PurchaseOrderStatus.PartiallyReceived, first.PurchaseOrderStatus);
        var lotB = first.Lines.Single(l => l.LotNumber == "L-B");
        Assert.Equal((50m, "kg", 16.5m, Today.AddDays(180)), (lotB.BaseQuantity, lotB.BaseUomCode, lotB.UnitCostBase, lotB.ExpirationDate));

        order = await GetAsync(admin, order.Id);
        Assert.Contains(order.Id, await PendingReceiptIdsAsync(admin, supplier.Id)); // PartiallyReceived
        Assert.Equal((6m, 4m), (order.Lines.Single(l => l.ItemId == flour.Id).ReceivedQty, order.Lines.Single(l => l.ItemId == flour.Id).PendingQty));
        var flourStock = await StockAsync(admin, fab, flour.Id);
        Assert.Equal((150m, 16.5m), (flourStock.OnHand, flourStock.AverageCost)); // 6 cajas × 25 kg at 412.5 / 25
        var sugarStock = await StockAsync(admin, fab, sugar.Id);
        Assert.Equal((100m, 1.2m), (sugarStock.OnHand, sugarStock.AverageCost)); // cost without VAT: 30 / 25

        // Final receipt: the rest of the flour into the existing lot L-A (keeps its date).
        var second = await OkAsync<GoodsReceiptDto>(await ReceiveAsync(admin, order, R(order, flour.Id, 4, "L-A")));
        Assert.Equal(PurchaseOrderStatus.Received, second.PurchaseOrderStatus);
        Assert.Equal(Today.AddDays(90), second.Lines.Single().ExpirationDate);

        var adminName = (await admin.GetJsonAsync<Sgo.Application.Security.MeDto>("/api/v1/me"))!.FullName;
        var received = await GetAsync(admin, order.Id);
        Assert.Equal((adminName, adminName, adminName), (received.CreatedByName, received.SubmittedByName, received.ApprovedByName));
        Assert.Null(received.RejectedByName);
        Assert.Equal(adminName, second.ReceivedByName);

        Assert.Equal(250m, (await StockAsync(admin, fab, flour.Id)).OnHand);
        var lots = (await admin.GetJsonAsync<List<LotStockDto>>($"/api/v1/stock/{fab}/{flour.Id}/lots"))!;
        Assert.Equal(new[] { ("L-A", 200m), ("L-B", 50m) }, lots.OrderBy(l => l.LotNumber).Select(l => (l.LotNumber!, l.Quantity)));

        var kardex = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>($"/api/v1/movements?locationId={fab}&itemId={flour.Id}"))!;
        Assert.Equal(3, kardex.Total);
        Assert.All(kardex.Items, m => Assert.Equal((MovementType.PurchaseReceipt, 16.5m, GoodsReceipt.DocType), (m.Type, m.UnitCost, m.SourceDocType)));
        Assert.Equal([first.Folio, first.Folio, second.Folio], kardex.Items.Select(m => m.SourceDocFolio).Order());

        var receipts = (await admin.GetJsonAsync<PagedResult<GoodsReceiptListItemDto>>($"/api/v1/goods-receipts?purchaseOrderId={order.Id}"))!;
        Assert.Equal(2, receipts.Total);
        Assert.Equal(4245m, receipts.Items.Sum(r => r.TotalCost));

        // A received order takes nothing more and cannot be cancelled or closed.
        order = await GetAsync(admin, order.Id);
        Assert.DoesNotContain(order.Id, await PendingReceiptIdsAsync(admin, supplier.Id));
        Assert.Equal("purchase_order_invalid_status", await (await ReceiveAsync(admin, order, R(order, sugar.Id, 1))).ProblemCodeAsync());
        Assert.Equal("purchase_order_not_cancellable", await (await ActAsync(admin, order, "cancel")).ProblemCodeAsync());
        Assert.Equal("purchase_order_invalid_status", await (await ActAsync(admin, order, "close")).ProblemCodeAsync());
    }

    [Fact]
    public async Task Approval_threshold_is_read_from_settings_and_compares_the_subtotal()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false, taxRate: 0.16m);
        var supplier = await SupplierWithAsync(admin, (item, 100m));

        await WithSettingAsync(AppSettingKeys.PoApprovalThreshold, "1000", async () =>
        {
            // Subtotal 990 (total 1,148.40 with VAT) is below 1,000: approved directly.
            var small = await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplier.Id, fab, L(item.Id, 9.9m)));
            small = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, small, "submit"));
            Assert.Equal((PurchaseOrderStatus.Approved, false), (small.Status, small.ApprovalRequired));
            Assert.NotNull(small.ApprovedAt);

            var large = await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplier.Id, fab, L(item.Id, 10)));
            large = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, large, "submit"));
            Assert.Equal((PurchaseOrderStatus.PendingApproval, true), (large.Status, large.ApprovalRequired));
        });
    }

    [Fact]
    public async Task Over_receipt_is_limited_by_the_configured_tolerance()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false);
        var supplier = await SupplierWithAsync(admin, (item, 10m));

        var order = await ApprovedAsync(admin, supplier.Id, fab, L(item.Id, 10));
        Assert.Equal("goods_receipt_over_tolerance", await (await ReceiveAsync(admin, order, R(order, item.Id, 10.5m))).ProblemCodeAsync());
        Assert.Empty((await admin.GetJsonAsync<PagedResult<GoodsReceiptListItemDto>>($"/api/v1/goods-receipts?purchaseOrderId={order.Id}"))!.Items);

        await WithSettingAsync(AppSettingKeys.ReceiptTolerancePct, "10", async () =>
        {
            var receipt = await OkAsync<GoodsReceiptDto>(await ReceiveAsync(admin, order, R(order, item.Id, 11)));
            Assert.Equal(PurchaseOrderStatus.Received, receipt.PurchaseOrderStatus);
        });
        Assert.Equal(275m, (await StockAsync(admin, fab, item.Id)).OnHand);
    }

    [Fact]
    public async Task Reject_is_final_cancel_before_receipts_and_close_with_balance()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false);
        var supplier = await SupplierWithAsync(admin, (item, 10m));

        var pending = await OkAsync<PurchaseOrderDto>(await ActAsync(admin,
            await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplier.Id, fab, L(item.Id, 5))), "submit"));
        var rejected = await OkAsync<PurchaseOrderDto>(await admin.PostAsJsonAsync($"/api/v1/purchase-orders/{pending.Id}/reject",
            new RejectPurchaseOrderRequest(pending.Version, "Precio fuera de lo negociado")));
        Assert.Equal((PurchaseOrderStatus.Rejected, "Precio fuera de lo negociado"), (rejected.Status, rejected.RejectionReason));
        Assert.Equal("purchase_order_invalid_status", await (await ActAsync(admin, rejected, "approve")).ProblemCodeAsync());
        Assert.Equal("purchase_order_not_cancellable", await (await ActAsync(admin, rejected, "cancel")).ProblemCodeAsync());

        var approved = await ApprovedAsync(admin, supplier.Id, fab, L(item.Id, 5));
        Assert.Equal("purchase_order_invalid_status", await (await ActAsync(admin, approved, "close")).ProblemCodeAsync());
        Assert.Equal(PurchaseOrderStatus.Cancelled, (await OkAsync<PurchaseOrderDto>(await ActAsync(admin, approved, "cancel"))).Status);

        var partial = await ApprovedAsync(admin, supplier.Id, fab, L(item.Id, 5));
        await OkAsync<GoodsReceiptDto>(await ReceiveAsync(admin, partial, R(partial, item.Id, 2)));
        partial = await GetAsync(admin, partial.Id);
        Assert.Equal("purchase_order_not_cancellable", await (await ActAsync(admin, partial, "cancel")).ProblemCodeAsync());
        var closed = await OkAsync<PurchaseOrderDto>(await ActAsync(admin, partial, "close"));
        Assert.Equal((PurchaseOrderStatus.Closed, 3m), (closed.Status, closed.Lines.Single().PendingQty));
        Assert.Equal("purchase_order_invalid_status", await (await ReceiveAsync(admin, closed, R(closed, item.Id, 1))).ProblemCodeAsync());
    }

    [Fact]
    public async Task Purchase_order_and_receipt_validations()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var lotItem = await ItemAsync(admin, tracksLots: true);
        var plain = await ItemAsync(admin, tracksLots: false);
        var notInCatalog = await ItemAsync(admin, tracksLots: false);
        var supplier = await SupplierWithAsync(admin, (lotItem, 100m), (plain, 10m));

        Assert.Equal(HttpStatusCode.BadRequest, (await CreateAsync(admin, supplier.Id, fab, L(notInCatalog.Id, 1, 5m))).StatusCode);
        Assert.Equal("purchase_order_location_cannot_purchase",
            await (await CreateAsync(admin, supplier.Id, await factory.LocationIdAsync("SUC-01"), L(plain.Id, 1))).ProblemCodeAsync());

        var draft = await OkAsync<PurchaseOrderDto>(await CreateAsync(admin, supplier.Id, fab, L(plain.Id, 1)));
        draft = await OkAsync<PurchaseOrderDto>(await admin.PutAsJsonAsync($"/api/v1/purchase-orders/{draft.Id}",
            new UpdatePurchaseOrderRequest(draft.Version, fab, Today, "Urgente", [L(plain.Id, 3, 9.5m), L(lotItem.Id, 2)])));
        Assert.Equal((2, 228.5m, "Urgente"), (draft.Lines.Count, draft.Subtotal, draft.Notes));
        var stale = await admin.PutAsJsonAsync($"/api/v1/purchase-orders/{draft.Id}",
            new UpdatePurchaseOrderRequest(draft.Version - 1, fab, Today, null, [L(plain.Id, 1)]));
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);

        var order = await ApprovedAsync(admin, supplier.Id, fab, L(lotItem.Id, 5), L(plain.Id, 5));
        Assert.Equal("lot_required", await (await ReceiveAsync(admin, order, R(order, lotItem.Id, 1))).ProblemCodeAsync());
        Assert.Equal("lot_expired",
            await (await ReceiveAsync(admin, order, R(order, lotItem.Id, 1, "L-OLD", Today.AddDays(-1)))).ProblemCodeAsync());
        Assert.Equal("lot_not_allowed", await (await ReceiveAsync(admin, order, R(order, plain.Id, 1, "L-X"))).ProblemCodeAsync());
        Assert.Equal("purchase_order_line_not_found",
            await (await ReceiveAsync(admin, order, new GoodsReceiptLineRequest(Guid.NewGuid(), 1, null, null))).ProblemCodeAsync());

        // Nothing was posted by the failed attempts.
        await using (var scope = factory.CreateScope())
        {
            var db = SgoApiFactory.Db(scope);
            Assert.False(await db.InventoryMovements.AnyAsync(m => m.ItemId == lotItem.Id || m.ItemId == plain.Id));
        }

        await OkAsync<GoodsReceiptDto>(await ReceiveAsync(admin, order, R(order, plain.Id, 1)));
        // The order changed: the old version is stale.
        Assert.Equal(HttpStatusCode.Conflict, (await ReceiveAsync(admin, order, R(order, plain.Id, 1))).StatusCode);
    }

    [Fact]
    public async Task Concurrent_receipts_of_the_same_version_post_once()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false);
        var supplier = await SupplierWithAsync(admin, (item, 10m));
        var order = await ApprovedAsync(admin, supplier.Id, fab, L(item.Id, 10));

        var responses = await Task.WhenAll(ReceiveAsync(admin, order, R(order, item.Id, 4)), ReceiveAsync(admin, order, R(order, item.Id, 4)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(100m, (await StockAsync(admin, fab, item.Id)).OnHand);
        Assert.Equal(4m, (await GetAsync(admin, order.Id)).Lines.Single().ReceivedQty);
    }

    [Fact]
    public async Task Concurrent_receipts_of_different_orders_share_a_new_lot()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: true);
        var supplier = await SupplierWithAsync(admin, (item, 10m));
        var orders = new List<PurchaseOrderDto>();
        for (var i = 0; i < 4; i++)
            orders.Add(await ApprovedAsync(admin, supplier.Id, fab, L(item.Id, 1)));
        var expiration = Today.AddDays(90);

        // Before the lot lock, all of them missed the lot and every insert but one broke the unique index (500).
        var responses = await Task.WhenAll(orders.Select(o => ReceiveAsync(admin, o, R(o, item.Id, 1, "L-CONC", expiration))));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        await using var scope = factory.CreateScope();
        var lot = await SgoApiFactory.Db(scope).Lots.SingleAsync(l => l.ItemId == item.Id);
        Assert.Equal("L-CONC", lot.LotNumber);
        Assert.Equal(100m, (await StockAsync(admin, fab, item.Id)).OnHand); // 4 cajas × 25 kg
    }

    [Fact]
    public async Task Editing_a_converted_order_keeps_the_requisition_link()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false);
        var supplier = await admin.CreateSupplierAsync();
        await OkAsync<SupplierItemDto>(await admin.AddSupplierItemAsync(supplier.Id, item.Id, 10m, preferred: true));

        var requisition = await OkAsync<RequisitionDto>(await admin.PostAsJsonAsync("/api/v1/requisitions",
            new CreateRequisitionRequest(fab, Today, null, [new RequisitionLineRequest(item.Id, 3, null)])));
        requisition = await OkAsync<RequisitionDto>(await admin.PostAsJsonAsync($"/api/v1/requisitions/{requisition.Id}/submit", new VersionRequest(requisition.Version)));
        requisition = await OkAsync<RequisitionDto>(await admin.PostAsJsonAsync($"/api/v1/requisitions/{requisition.Id}/approve", new VersionRequest(requisition.Version)));
        var converted = Assert.Single(await OkAsync<List<PurchaseOrderListItemDto>>(await admin.PostAsJsonAsync("/api/v1/requisitions/convert",
            new ConvertRequisitionsRequest([requisition.Id]))));
        var order = await GetAsync(admin, converted.Id);
        var line = order.Lines.Single();

        order = await OkAsync<PurchaseOrderDto>(await admin.PutAsJsonAsync($"/api/v1/purchase-orders/{order.Id}",
            new UpdatePurchaseOrderRequest(order.Version, fab, Today, null, [L(item.Id, 5, 9m, line.Id)])));

        Assert.Equal((5m, 9m, requisition.Folio), (order.Lines.Single().Quantity, order.Lines.Single().UnitPrice, order.Lines.Single().RequisitionFolio));
    }

    [Fact]
    public async Task Purchase_permissions_and_location_scope()
    {
        var admin = await AdminAsync();
        var fab = await factory.LocationIdAsync("FAB");
        var item = await ItemAsync(admin, tracksLots: false);
        var supplier = await SupplierWithAsync(admin, (item, 10m));

        // Compras creates and submits but does not approve.
        var buyer = await factory.CreateUserAsync("Compras", "FAB");
        var buyerClient = await factory.CreateAuthenticatedClientAsync(buyer.Email, buyer.Password);
        var order = await OkAsync<PurchaseOrderDto>(await CreateAsync(buyerClient, supplier.Id, fab, L(item.Id, 5)));
        order = await OkAsync<PurchaseOrderDto>(await ActAsync(buyerClient, order, "submit"));
        Assert.Equal(HttpStatusCode.Forbidden, (await ActAsync(buyerClient, order, "approve")).StatusCode);

        var manager = await factory.CreateUserAsync("Gerente de operaciones");
        var managerClient = await factory.CreateAuthenticatedClientAsync(manager.Email, manager.Password);
        order = await OkAsync<PurchaseOrderDto>(await ActAsync(managerClient, order, "approve"));

        // The warehouse receives but does not manage orders.
        var warehouse = await factory.CreateUserAsync("Almacén comisariato/fábrica", "FAB");
        var warehouseClient = await factory.CreateAuthenticatedClientAsync(warehouse.Email, warehouse.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await CreateAsync(warehouseClient, supplier.Id, fab, L(item.Id, 1))).StatusCode);
        var receipt = await OkAsync<GoodsReceiptDto>(await ReceiveAsync(warehouseClient, order, R(order, item.Id, 5)));
        var viewer = await factory.CreateUserAsync("Consulta", "FAB");
        var viewerClient = await factory.CreateAuthenticatedClientAsync(viewer.Email, viewer.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await ReceiveAsync(viewerClient, await GetAsync(admin, order.Id), R(order, item.Id, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await viewerClient.GetAsync($"/api/v1/goods-receipts/{receipt.Id}")).StatusCode);

        // Out of scope (COM user).
        var comUser = await factory.CreateUserAsync("Almacén comisariato/fábrica", "COM");
        var comClient = await factory.CreateAuthenticatedClientAsync(comUser.Email, comUser.Password);
        Assert.Equal(HttpStatusCode.Forbidden, (await comClient.GetAsync($"/api/v1/purchase-orders/{order.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await comClient.GetAsync($"/api/v1/goods-receipts/{receipt.Id}")).StatusCode);
        Assert.DoesNotContain((await comClient.GetJsonAsync<PagedResult<GoodsReceiptListItemDto>>("/api/v1/goods-receipts?pageSize=100"))!.Items,
            r => r.Id == receipt.Id);
    }
}
