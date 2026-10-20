using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.Application.Logistics;
using Panissimo.Application.Organization;
using Panissimo.Application.Production;
using Panissimo.Application.Purchasing;
using Panissimo.Application.Sales;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Persistence;
using Panissimo.IntegrationTests.Infrastructure;

namespace Panissimo.IntegrationTests.Inventory;

/// <summary>
/// B-28 with the scenario of trazabilidad §9, built through the API (quantities of the reference diagram where they
/// matter): two flour purchase orders received in different lots, sugar in purchase units and water without lot; an order
/// of MICHAS with a partial close (FEFO takes the 62 kg of the oldest flour and 28.1 of the newer) and a final close; three
/// transfers, the second one with two lots and 10 damaged; and a second chain dough → packaged bread → customer (two
/// levels, RN-103). Moves inventory.
/// </summary>
[Collection(ApiCollection.Name)]
public class TraceabilityTests(ApiFactory factory)
{
    private static DateOnly Today => ApiFactory.Today;

    private sealed record Scenario(
        Guid Plant, Guid Suc1, Guid Suc2, Guid Suc3, string Suc3Code, Item Flour, Item Sugar, Item Water, Item Bread,
        PurchaseOrderDto OldFlourOrder, PurchaseOrderDto NewFlourOrder, PurchaseOrderDto SugarOrder,
        Guid OldFlourLot, Guid NewFlourLot, ProductionOrderDto Order, string Lot1, string Lot2,
        TransferDto Tr1, TransferDto Tr2, TransferDto Tr3, CustomerShipmentDto Shipment, Item Packaged);

    private static Scenario? _scenario;

    private static async Task<T> OkAsync<T>(Task<HttpResponseMessage> call)
    {
        var response = await call;
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadJsonAsync<T>())!;
    }

    private static string TaxId() =>
        string.Concat(Enumerable.Range(0, 3).Select(_ => (char)('A' + Random.Shared.Next(26)))) + "980312"
        + string.Concat(Enumerable.Range(0, 3).Select(_ => (char)('A' + Random.Shared.Next(26))));

    /// <summary>The order received in one line; the lot is generated (RN-117) and <paramref name="supplierLot"/> is the supplier's.</summary>
    private static async Task<(PurchaseOrderDto Order, GoodsReceiptLineDto Line)> ReceivedOrderAsync(HttpClient admin, Guid supplier,
        Guid plant, Guid itemId, decimal qty, decimal price, string supplierLot, DateOnly expiration)
    {
        var order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync("/api/v1/purchase-orders",
            new CreatePurchaseOrderRequest(supplier, plant, Today, null, [new PurchaseOrderLineRequest(null, itemId, qty, price)])));
        order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/submit", new VersionRequest(order.Version)));
        order = await OkAsync<PurchaseOrderDto>(admin.PostJsonAsync($"/api/v1/purchase-orders/{order.Id}/approve", new VersionRequest(order.Version)));
        var receipt = await OkAsync<GoodsReceiptDto>(admin.PostJsonAsync("/api/v1/goods-receipts", new CreateGoodsReceiptRequest(order.Id,
            order.Version, "A-1182", null, [new GoodsReceiptLineRequest(order.Lines[0].Id, qty, supplierLot, expiration)])));
        return (order, receipt.Lines.Single());
    }

    private static async Task<TransferDto> SentAsync(HttpClient admin, Guid from, Guid to, Guid itemId, decimal qty)
    {
        var transfer = await OkAsync<TransferDto>(admin.PostJsonAsync("/api/v1/transfers",
            new CreateTransferRequest(from, to, null, [new TransferLineRequest(itemId, null, qty)])));
        return await OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/dispatch",
            new DispatchTransferRequest(transfer.Version, ApiFactory.VehicleId, ApiFactory.DriverId, null)));
    }

    private static Task<TransferDto> ReceivedAsync(HttpClient admin, TransferDto transfer, Func<TransferLineDto, ReceiveLineRequest>? line = null) =>
        OkAsync<TransferDto>(admin.PostJsonAsync($"/api/v1/transfers/{transfer.Id}/receive", new ReceiveTransferRequest(transfer.Version,
            [.. transfer.Lines.Select(line ?? (l => new ReceiveLineRequest(l.Id, l.ShippedQty, null, null)))])));

    /// <summary>The scenario is built once and shared by the tests of this class (it moves inventory).</summary>
    private async Task<Scenario> ScenarioAsync(HttpClient admin)
    {
        if (_scenario is not null)
            return _scenario;
        var plant = await factory.LocationIdAsync("PLANTA");
        var suc1 = await factory.LocationIdAsync("SUC-01");
        var suc2 = await factory.LocationIdAsync("SUC-02");
        var suc3Code = $"S3{Guid.NewGuid():N}"[..8].ToUpperInvariant();
        var suc3 = (await OkAsync<LocationDto>(admin.PostJsonAsync("/api/v1/locations",
            new CreateLocationRequest(suc3Code, "Sucursal 3 de prueba", LocationType.Branch, null)))).Id;

        var flour = await factory.CreateItemAsync("HARINA", tracksLots: true);
        var sugar = await factory.CreateItemAsync("AZUCAR", tracksLots: true, purchaseUom: "bulto", purchaseToBaseFactor: 50);
        var water = await factory.CreateItemAsync("AGUA", uom: "l");
        var bread = await factory.CreateItemAsync("MICHAS", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 2);
        await factory.AddStockAsync(plant, water.Id, 1000, 0.01m);

        var harinas = await OkAsync<SupplierDto>(admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest(TaxId(), "Proveedor Harinas", null, null, null, 30)));
        var abarrotes = await OkAsync<SupplierDto>(admin.PostJsonAsync("/api/v1/suppliers", new CreateSupplierRequest(TaxId(), "Proveedor Abarrotes", null, null, null, 15)));
        foreach (var (supplier, item, price) in new[] { (harinas, flour, 9.5m), (abarrotes, sugar, 650m) })
            await OkAsync<SupplierItemDto>(admin.PostJsonAsync($"/api/v1/suppliers/{supplier.Id}/items", new CreateSupplierItemRequest(item.Id, null, price, 2, true)));

        // 62 kg of the oldest flour: FEFO takes all of it in the first close.
        var (oldOrder, oldLine) = await ReceivedOrderAsync(admin, harinas.Id, plant, flour.Id, 62, 9.5m, "HT-2609-C", Today.AddDays(70));
        var (newOrder, newLine) = await ReceivedOrderAsync(admin, harinas.Id, plant, flour.Id, 1760, 9.8m, "HT-2610-A", Today.AddDays(90));
        var (sugarOrder, _) = await ReceivedOrderAsync(admin, abarrotes.Id, plant, sugar.Id, 10, 650m, "AZ-2509", Today.AddDays(300)); // 10 bultos = 500 kg

        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 1800, null,
            [new RecipeLineRequest(flour.Id, 90.1m, 0), new RecipeLineRequest(sugar.Id, 2.66m, 0), new RecipeLineRequest(water.Id, 45.05m, 0)])));
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 3500, Today, Shift.Night, null)));
        order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/release", new VersionRequest(order.Version)));
        var c1 = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(order.Version, ProductionCloseKind.Partial, 1800, null, null, null, null, null)));
        var c2 = await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{order.Id}/closes",
            new CreateProductionCloseRequest(c1.Order.Version, ProductionCloseKind.Final, 1700, null, null, null, null, null)));

        // FEFO by expiration: TR1 1,200 of -01; TR2 600 of -01 and 400 of -02; TR3 900 of -02. 400 of -02 stay at the plant.
        var tr1 = await ReceivedAsync(admin, await SentAsync(admin, plant, suc1, bread.Id, 1200));
        var tr2Sent = await SentAsync(admin, plant, suc2, bread.Id, 1000);
        var tr2 = await ReceivedAsync(admin, tr2Sent, l => l.LotNumber == c2.Close.OutputLotNumber
            ? new ReceiveLineRequest(l.Id, l.ShippedQty - 10, DiscrepancyReason.Damaged, "Charolas aplastadas")
            : new ReceiveLineRequest(l.Id, l.ShippedQty, null, null));
        var tr3 = await ReceivedAsync(admin, await SentAsync(admin, plant, suc3, bread.Id, 900));

        // Two levels: dough (semi-finished) made with the new flour, packaged bread made with the dough, sold to a customer.
        var dough = await factory.CreateItemAsync("MASA", ItemType.SemiFinished, tracksLots: true, shelfLifeDays: 2);
        var packaged = await factory.CreateItemAsync("PAN-EMB", ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 5,
            presentation: ItemPresentation.Packaged);
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(dough.Id, 10, null, [new RecipeLineRequest(flour.Id, 6, 0)])));
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(packaged.Id, 10, null, [new RecipeLineRequest(dough.Id, 1, 0)])));
        foreach (var (item, qty) in new[] { (dough, 10m), (packaged, 10m) })
        {
            var op = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
                new CreateProductionOrderRequest(plant, item.Id, qty, Today, null, null)));
            op = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync($"/api/v1/production-orders/{op.Id}/release", new VersionRequest(op.Version)));
            await OkAsync<ProductionCloseResultDto>(admin.PostJsonAsync($"/api/v1/production-orders/{op.Id}/closes",
                new CreateProductionCloseRequest(op.Version, ProductionCloseKind.Final, qty, null, null, null, null, null)));
        }
        var customer = await OkAsync<CustomerDto>(admin.PostJsonAsync("/api/v1/customers",
            new CreateCustomerRequest($"CLI-{Guid.NewGuid():N}"[..12], "Cafeterías del Centro", null, null, null, null, null)));
        var customerOrder = await OkAsync<CustomerOrderDto>(admin.PostJsonAsync("/api/v1/customer-orders", new CreateCustomerOrderRequest(customer.Id,
            null, Today, null, null, [new CustomerOrderLineRequest(packaged.Id, 10, 12)])));
        customerOrder = await OkAsync<CustomerOrderDto>(admin.PostJsonAsync($"/api/v1/customer-orders/{customerOrder.Id}/confirm",
            new VersionRequest(customerOrder.Version)));
        var shipment = await OkAsync<CustomerShipmentDto>(admin.PostAsync($"/api/v1/customer-orders/{customerOrder.Id}/shipments", null));
        shipment = await OkAsync<CustomerShipmentDto>(admin.PostJsonAsync($"/api/v1/customer-shipments/{shipment.Id}/dispatch",
            new DispatchCustomerShipmentRequest(shipment.Version, ApiFactory.VehicleId, ApiFactory.DriverId, "Marta", null)));

        return _scenario = new Scenario(plant, suc1, suc2, suc3, suc3Code, flour, sugar, water, bread, oldOrder, newOrder, sugarOrder,
            oldLine.LotId!.Value, newLine.LotId!.Value, c2.Order, c1.Close.OutputLotNumber!,
            c2.Close.OutputLotNumber!, tr1, tr2, tr3, shipment, packaged);
    }

    private static Task<TraceGraphDto> GraphAsync(HttpClient client, TraceSourceType type, Guid id, TraceDirection? direction = null) =>
        OkAsync<TraceGraphDto>(client.GetAsync($"/api/v1/traceability/graph?sourceType={type}&sourceId={id}"
            + (direction is null ? "" : $"&direction={direction}")));

    private static IEnumerable<decimal> Consumed(TraceGraphDto graph, Guid lotId) => graph.Edges
        .Where(e => e.Kind == TraceEdgeKind.Consumed && e.From.StartsWith($"stk:{lotId}:", StringComparison.Ordinal)).Select(e => e.Qty!.Value);

    [Fact]
    public async Task Backward_from_what_a_branch_received_reaches_both_flour_orders_with_the_exact_quantities()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ScenarioAsync(admin);

        var graph = await GraphAsync(admin, TraceSourceType.Transfer, s.Tr2.Id, TraceDirection.Backward);

        var receipts = graph.Nodes.Where(n => n.Type == TraceNodeType.PurchaseReceipt).ToList();
        Assert.Equal(new[] { s.NewFlourOrder.Folio, s.OldFlourOrder.Folio, s.SugarOrder.Folio }.Order(), receipts.Select(r => r.PurchaseOrderFolio!).Order());
        Assert.Equal(["Proveedor Abarrotes", "Proveedor Harinas"], graph.Nodes.Where(n => n.Type == TraceNodeType.Supplier).Select(n => n.Label).Order());
        Assert.Equal(2, graph.Nodes.Count(n => n.Type == TraceNodeType.ProductionClose));
        // RN-105: the quantities of the close's lots, not a proration.
        Assert.Equal([62m], Consumed(graph, s.OldFlourLot));
        Assert.Equal([28.1m, 85.0944m], Consumed(graph, s.NewFlourLot).Order());
        // Sugar bought in purchase units: 10 bultos = 500 kg.
        var sugar = receipts.Single(r => r.PurchaseOrderFolio == s.SugarOrder.Folio);
        Assert.Equal((10m, "bulto", 500m, "kg"), (sugar.PurchaseQty!.Value, sugar.PurchaseUom!, sugar.BaseQty!.Value, sugar.BaseUom!));
        // RN-104: the water has no lot.
        Assert.Contains(TraceWarnings.UnlottedComponents, graph.Warnings);
        var first = graph.Nodes.Single(n => n.Type == TraceNodeType.ProductionClose && n.Sequence == 1);
        Assert.Equal([(s.Water.Sku, 45.05m, "l")], first.UnlottedConsumption!.Select(u => (u.Sku, u.Qty, u.BaseUom)));
        Assert.Equal(s.Order.Folio, graph.Groups.Single().Folio);
    }

    [Fact]
    public async Task Forward_from_the_oldest_flour_reaches_the_two_branches_that_got_it_and_not_the_third()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ScenarioAsync(admin);

        var fromLot = await GraphAsync(admin, TraceSourceType.Lot, s.OldFlourLot, TraceDirection.Forward);
        Assert.Equal("HT-2609-C", fromLot.Nodes.Single(n => n.Type == TraceNodeType.Lot && n.LotId == s.OldFlourLot).SupplierLotNumber);

        var transfers = fromLot.Nodes.Where(n => n.Type == TraceNodeType.Transfer).Select(n => n.Folio).Order().ToList();
        Assert.Equal([s.Tr1.Folio, s.Tr2.Folio], transfers);
        var branches = fromLot.Nodes.Where(n => n.Type == TraceNodeType.Stock && n.LocationType == LocationType.Branch).Select(n => n.LocationId).Distinct();
        Assert.Equal(new[] { s.Suc1, s.Suc2 }.Order(), branches.Select(b => b!.Value).Order());
        Assert.DoesNotContain(fromLot.Nodes, n => n.LocationCode == s.Suc3Code);
        Assert.Equal([1200m, 600m], fromLot.Edges.Where(e => e.Kind == TraceEdgeKind.Dispatched).Select(e => e.Qty!.Value).OrderDescending());

        // The purchase order gives the same chain as its lot.
        var fromOrder = await GraphAsync(admin, TraceSourceType.PurchaseOrder, s.OldFlourOrder.Id);
        Assert.Equal(TraceDirection.Forward, fromOrder.Direction);
        Assert.Equal(fromLot.Nodes.Select(n => n.Id).Order(), fromOrder.Nodes.Select(n => n.Id).Order());
    }

    [Fact]
    public async Task The_summary_of_the_order_has_the_stock_by_location_and_the_loss_in_transit()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ScenarioAsync(admin);

        var graph = await GraphAsync(admin, TraceSourceType.ProductionOrder, s.Order.Id);

        var onHand = graph.Summary.Locations.Where(l => l.BaseUom == "pza").ToDictionary(l => l.LocationId, l => (l.ReceivedQty, l.OnHandQty));
        Assert.Equal((3500m, 400m), onHand[s.Plant]);
        Assert.Equal((1200m, 1200m), onHand[s.Suc1]);
        Assert.Equal((990m, 990m), onHand[s.Suc2]);
        Assert.Equal((900m, 900m), onHand[s.Suc3]);
        Assert.Equal(10m, graph.Summary.InTransitLossQty);
        Assert.Equal([(s.Lot1, 1800m), (s.Lot2, 1700m)], graph.Summary.FinishedLots.Select(l => (l.LotNumber, l.ProducedQty)));

        // RN-107: the 10 damaged stay in the last lot shipped (-02): 600 of -01 and 390 of -02 arrived.
        var delivered = graph.Edges.Where(e => e.Kind == TraceEdgeKind.Delivered && e.From == TraceGraphBuilder.TransferId(s.Tr2.Id))
            .Select(e => (e.Qty!.Value, e.ShippedQty!.Value, e.DiscrepancyReason)).OrderDescending().ToList();
        Assert.Equal([(600m, 600m, (DiscrepancyReason?)null), (390m, 400m, DiscrepancyReason.Damaged)], delivered);
        Assert.Contains(graph.Events, e => e.Folio == s.Tr2.Folio && e.Description == "Recepción de traspaso");
    }

    [Fact]
    public async Task A_semi_finished_good_crosses_two_orders_and_reaches_the_customer()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ScenarioAsync(admin);

        var backward = await GraphAsync(admin, TraceSourceType.CustomerShipment, s.Shipment.Id);
        Assert.Equal(TraceDirection.Backward, backward.Direction);
        Assert.Equal(2, backward.Groups.Count);   // dough and packaged bread
        Assert.Contains(backward.Nodes, n => n.Type == TraceNodeType.PurchaseReceipt && n.PurchaseOrderFolio == s.NewFlourOrder.Folio);

        var forward = await GraphAsync(admin, TraceSourceType.Lot, s.NewFlourLot, TraceDirection.Forward);
        var customer = forward.Nodes.Single(n => n.Type == TraceNodeType.Customer);
        Assert.Equal("Cafeterías del Centro", customer.CustomerName);
        Assert.Equal([10m], forward.Summary.Customers.Where(c => c.CustomerId == customer.CustomerId).Select(c => c.ShippedQty));
    }

    [Fact]
    public async Task Permission_scope_costs_lookups_and_the_audit_log()
    {
        var admin = await factory.LoginAsAdminAsync();
        var s = await ScenarioAsync(admin);

        // Without inventory.traceability: 403.
        var branchEmail = ApiFactory.UniqueEmail("traza.sucursal");
        await factory.CreateUserAsync(branchEmail, ["branch_manager"], ["SUC-02"]);
        var manager = await factory.LoginAsync(branchEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync($"/api/v1/traceability/graph?sourceType=Transfer&sourceId={s.Tr2.Id}")).StatusCode);

        // Plant warehouse (D-11): only the plant in scope, yet it sees the branches (RN-109); no production.view → no costs.
        var warehouseEmail = ApiFactory.UniqueEmail("traza.almacen");
        await factory.CreateUserAsync(warehouseEmail, ["plant_warehouse"], ["PLANTA"]);
        var warehouse = await factory.LoginAsync(warehouseEmail);
        var graph = await GraphAsync(warehouse, TraceSourceType.ProductionOrder, s.Order.Id);
        Assert.Contains(graph.Nodes, n => n.Type == TraceNodeType.Stock && n.LocationId == s.Suc2);
        Assert.All(graph.Nodes.Where(n => n.Type == TraceNodeType.ProductionClose), n => Assert.Null(n.TotalCost));
        Assert.Null(graph.Groups.Single().TotalCost);
        Assert.NotNull((await GraphAsync(admin, TraceSourceType.ProductionOrder, s.Order.Id)).Groups.Single().TotalCost);

        // Lookups by folio and by lot number.
        var byFolio = await OkAsync<List<TraceSourceDto>>(admin.GetAsync($"/api/v1/traceability/sources/lookup?q={s.Order.Folio}"));
        Assert.Contains(byFolio, x => x.Type == TraceSourceType.ProductionOrder && x.Id == s.Order.Id);
        Assert.Contains(byFolio, x => x.Type == TraceSourceType.Lot && x.Label.StartsWith(s.Lot1, StringComparison.Ordinal));
        // RN-117: both flour receipts were the same day, so their lots are -01 and -02.
        var prefix = PurchaseLotNumber.Prefix(s.Flour.Sku, Today);
        var lots = await OkAsync<List<TraceLotLookupDto>>(admin.GetAsync($"/api/v1/traceability/lots/lookup?q={prefix}&itemId={s.Flour.Id}"));
        Assert.Equal([prefix + "01", prefix + "02"], lots.Select(l => l.LotNumber).Order());

        // Errors.
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/v1/traceability/graph?sourceType=Lot&sourceId={Guid.NewGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await admin.GetAsync($"/api/v1/traceability/graph?sourceType=Lot&sourceId={s.OldFlourLot}&maxDepth=25")).StatusCode);

        // RN-109: every query is in the audit log.
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.AuditLogs.AnyAsync(a => a.Action == AuditAction.Queried && a.EntityType == "Traceability"
                                                     && a.EntityId == s.Order.Id.ToString()));
    }

    [Fact]
    public async Task An_order_without_closes_answers_no_lots()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var bread = await factory.CreateItemAsync("BIROTE", ItemType.FinishedGood, "pza");
        var flour = await factory.CreateItemAsync("HAR");
        await OkAsync<RecipeDto>(admin.PostJsonAsync("/api/v1/recipes", new CreateRecipeRequest(bread.Id, 10, null, [new RecipeLineRequest(flour.Id, 1, 0)])));
        var order = await OkAsync<ProductionOrderDto>(admin.PostJsonAsync("/api/v1/production-orders",
            new CreateProductionOrderRequest(plant, bread.Id, 10, Today.AddDays(1), null, null)));

        var graph = await GraphAsync(admin, TraceSourceType.ProductionOrder, order.Id);

        Assert.Equal([TraceWarnings.NoLots], graph.Warnings);
        Assert.Empty(graph.Nodes);
        Assert.StartsWith(order.Folio, graph.Source.Label, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_seed_grants_traceability_to_the_D11_roles_only()
    {
        await using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var granted = await (from rp in db.RolePermissions
                             join r in db.Roles on rp.RoleId equals r.Id
                             where rp.PermissionCode == Permissions.InventoryTraceability && r.SystemKey != null
                             select r.SystemKey).ToListAsync();
        Assert.Equal(["administrator", "direction", "plant_warehouse", "production_manager"], granted.Order());
        Assert.True(await db.KnownPermissions.AnyAsync(p => p.Code == Permissions.InventoryTraceability));
    }
}
