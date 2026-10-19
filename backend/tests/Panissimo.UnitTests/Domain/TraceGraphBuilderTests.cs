using Panissimo.Application.Inventory.Traceability;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Sales;

namespace Panissimo.UnitTests.Domain;

/// <summary>An in-memory chain for the graph builder: every query filters these lists.</summary>
internal sealed class FakeTraceData : ITraceDataSource
{
    public static readonly DateTimeOffset T0 = new(2026, 10, 20, 12, 0, 0, TimeSpan.Zero);

    public List<TraceLot> Lots { get; } = [];
    public List<TraceItem> Items { get; } = [];
    public List<TraceLocation> Locations { get; } = [];
    public List<TraceClose> Closes { get; } = [];
    public List<TraceCloseLine> Lines { get; } = [];
    public List<TraceCloseLot> CloseLots { get; } = [];
    public List<TraceReceiptLine> Receipts { get; } = [];
    public List<TraceTransferLine> Transfers { get; } = [];
    public List<TraceShipmentLot> Shipments { get; } = [];
    public List<TraceMovement> Movements { get; } = [];
    public List<TraceBalance> Balances { get; } = [];
    public int Queries { get; private set; }

    private long _sequence;

    public Guid Plant { get; } = Guid.NewGuid();
    public Guid Branch { get; } = Guid.NewGuid();

    public FakeTraceData()
    {
        Locations.Add(new TraceLocation(Plant, "PLANTA", "Planta", LocationType.Plant, null));
        Locations.Add(new TraceLocation(Branch, "SUC-02", "Sucursal 2", LocationType.Branch, null));
    }

    public TraceItem Item(string sku, ItemType type, string uom = "kg", bool tracksLots = true)
    {
        var item = new TraceItem(Guid.NewGuid(), sku, sku, type, uom, uom, tracksLots);
        Items.Add(item);
        return item;
    }

    public TraceLot Lot(TraceItem item, string number, string docType = "GoodsReceipt")
    {
        var lot = new TraceLot(Guid.NewGuid(), item.Id, number, null, docType, Guid.NewGuid(), T0);
        Lots.Add(lot);
        return lot;
    }

    /// <summary>A close that consumed <paramref name="inputs"/> (lot, qty) and produced <paramref name="output"/>.</summary>
    public TraceClose Close(string folio, TraceLot? output, decimal produced, params (TraceLot? Lot, TraceItem Item, decimal Qty)[] inputs)
    {
        var close = new TraceClose(Guid.NewGuid(), folio, Guid.NewGuid(), 1, ProductionCloseKind.Partial, DateOnly.FromDateTime(T0.Date), null,
            T0.AddMinutes(Closes.Count), null, produced, output?.Id, Plant, 100, 1);
        Closes.Add(close);
        foreach (var (lot, item, qty) in inputs)
        {
            var line = new TraceCloseLine(close.Id, Guid.NewGuid(), item.Id, Plant, qty, qty, 2, 0);
            Lines.Add(line);
            if (lot is not null)
                CloseLots.Add(new TraceCloseLot(close.Id, line.LineId, lot.Id, qty));
        }
        return close;
    }

    public void Move(TraceLot lot, Guid location, MovementType type, decimal qty, string folio, int minutes = 0) =>
        Movements.Add(new TraceMovement(++_sequence, lot.Id, location, type, qty, T0.AddMinutes(minutes), "Test", folio));

    public Task<IReadOnlyList<TraceLot>> LotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) => Q<TraceLot>(Lots.Where(l => lotIds.Contains(l.Id)));
    public Task<IReadOnlyList<TraceItem>> ItemsAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken ct) => Q<TraceItem>(Items.Where(i => itemIds.Contains(i.Id)));
    public Task<IReadOnlyList<TraceLocation>> LocationsAsync(CancellationToken ct) => Q<TraceLocation>(Locations);
    public Task<IReadOnlyList<Guid>> ClosesProducingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<Guid>(Closes.Where(c => c.OutputLotId is { } o && lotIds.Contains(o)).Select(c => c.Id));
    public Task<IReadOnlyList<Guid>> ClosesConsumingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<Guid>(CloseLots.Where(l => lotIds.Contains(l.LotId)).Select(l => l.CloseId).Distinct());
    public Task<TraceCloseDetails> CloseDetailsAsync(IReadOnlyCollection<Guid> closeIds, CancellationToken ct)
    {
        Queries++;
        return Task.FromResult(new TraceCloseDetails([.. Closes.Where(c => closeIds.Contains(c.Id))], [.. Lines.Where(l => closeIds.Contains(l.CloseId))],
            [.. CloseLots.Where(l => closeIds.Contains(l.CloseId))]));
    }
    public Task<IReadOnlyList<TraceOrder>> OrdersAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct) => Q<TraceOrder>([]);
    public Task<IReadOnlyList<TraceDemand>> DemandsAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct) => Q<TraceDemand>([]);
    public Task<IReadOnlyList<TraceReceiptLine>> ReceiptLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<TraceReceiptLine>(Receipts.Where(r => lotIds.Contains(r.LotId)));
    public Task<IReadOnlyList<TraceOrigin>> OriginsAsync(IReadOnlyCollection<TraceLot> lots, CancellationToken ct) => Q<TraceOrigin>([]);
    public Task<IReadOnlyList<TraceTransferLine>> TransferLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<TraceTransferLine>(Transfers.Where(t => lotIds.Contains(t.LotId)));
    public Task<IReadOnlyList<TraceShipmentLot>> ShipmentLotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<TraceShipmentLot>(Shipments.Where(s => lotIds.Contains(s.LotId)));
    public Task<IReadOnlyList<TraceMovement>> MovementsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<TraceMovement>(Movements.Where(m => lotIds.Contains(m.LotId)));
    public Task<IReadOnlyList<TraceBalance>> BalancesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        Q<TraceBalance>(Balances.Where(b => lotIds.Contains(b.LotId)));
    public Task<IReadOnlyDictionary<Guid, string>> UserNamesAsync(IReadOnlyCollection<Guid> userIds, CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<Guid, string>>(new Dictionary<Guid, string>());

    private Task<IReadOnlyList<T>> Q<T>(IEnumerable<T> rows)
    {
        Queries++;
        return Task.FromResult<IReadOnlyList<T>>([.. rows]);
    }
}

public class TraceGraphBuilderTests
{
    private static TraceBuildOptions Options(TraceDirection direction, int maxDepth = 10, int maxNodes = 2000, bool costs = true) =>
        new(direction, maxDepth, maxNodes, costs, costs);

    private static Task<TraceBuildResult> Build(FakeTraceData data, TraceLot seed, TraceBuildOptions options) =>
        new TraceGraphBuilder(data).BuildAsync([seed.Id], options, CancellationToken.None);

    [Fact]
    public async Task A_cycle_is_not_expanded_twice()
    {
        var data = new FakeTraceData();
        var item = data.Item("MASA", ItemType.SemiFinished);
        var a = data.Lot(item, "A", "ProductionClose");
        var b = data.Lot(item, "B", "ProductionClose");
        data.Close("CP-1", b, 10, (a, item, 5));
        data.Close("CP-2", a, 10, (b, item, 5));

        var result = await Build(data, a, Options(TraceDirection.Both));

        Assert.False(result.Truncated);
        Assert.Equal(["A", "B"], result.Nodes.Where(n => n.Type == TraceNodeType.Lot).Select(n => n.LotNumber).Order());
        Assert.Equal(2, result.Nodes.Count(n => n.Type == TraceNodeType.ProductionClose));
    }

    [Fact]
    public async Task Max_depth_stops_the_walk_and_lists_what_was_not_expanded()
    {
        var data = new FakeTraceData();
        var item = data.Item("SEMI", ItemType.SemiFinished);
        var lots = Enumerable.Range(0, 4).Select(i => data.Lot(item, $"L{i}", "ProductionClose")).ToList();
        for (var i = 0; i < 3; i++)
            data.Close($"CP-{i}", lots[i], 10, (lots[i + 1], item, 5));   // L0 ← L1 ← L2 ← L3

        var result = await Build(data, lots[0], Options(TraceDirection.Backward, maxDepth: 2));

        Assert.True(result.Truncated);
        Assert.Contains(TraceWarnings.Truncated, result.Warnings);
        Assert.Equal([TraceGraphBuilder.LotId(lots[2].Id)], result.UnexpandedNodeIds);
        Assert.Equal(["CP-0", "CP-1"], result.Nodes.Where(n => n.Type == TraceNodeType.ProductionClose).Select(n => n.Folio).Order());
    }

    [Fact]
    public async Task The_node_limit_truncates_too()
    {
        var data = new FakeTraceData();
        var item = data.Item("SEMI", ItemType.SemiFinished);
        var lots = Enumerable.Range(0, 6).Select(i => data.Lot(item, $"L{i}", "ProductionClose")).ToList();
        for (var i = 0; i < 5; i++)
            data.Close($"CP-{i}", lots[i], 10, (lots[i + 1], item, 5));

        var result = await Build(data, lots[0], Options(TraceDirection.Backward, maxNodes: 6));

        Assert.True(result.Truncated);
        Assert.NotEmpty(result.UnexpandedNodeIds);
        Assert.True(result.Nodes.Count(n => n.Type == TraceNodeType.ProductionClose) < 5);
    }

    [Fact]
    public async Task Each_level_is_read_in_batches_not_per_lot()
    {
        var data = new FakeTraceData();
        var flour = data.Item("HARINA", ItemType.RawMaterial);
        var bread = data.Item("PAN", ItemType.FinishedGood, "pza");
        var flourLot = data.Lot(flour, "HT-1");
        // One flour lot consumed by 30 closes: forward is still a handful of queries.
        for (var i = 0; i < 30; i++)
            data.Close($"CP-{i:00}", data.Lot(bread, $"P-{i:00}", "ProductionClose"), 100, (flourLot, flour, 2));

        var result = await Build(data, flourLot, Options(TraceDirection.Forward));

        Assert.Equal(30, result.Nodes.Count(n => n.Type == TraceNodeType.ProductionClose));
        Assert.True(data.Queries < 20, $"{data.Queries} consultas");
    }

    /// <summary>RN-106, RN-107, RN-108: a finished lot produced at the plant, sent to a branch with 10 damaged, consumed and wasted there.</summary>
    [Fact]
    public async Task The_summary_has_stock_by_location_and_the_loss_in_transit()
    {
        var data = new FakeTraceData();
        var flour = data.Item("HARINA", ItemType.RawMaterial);
        var water = data.Item("AGUA", ItemType.RawMaterial, "l", tracksLots: false);
        var bread = data.Item("MICHAS", ItemType.FinishedGood, "pza");
        var flourLot = data.Lot(flour, "HT-2609-C");
        var breadLot = data.Lot(bread, "OP-000412-01", "ProductionClose");
        data.Close("CP-000801", breadLot, 1800, (flourLot, flour, 62), (null, water, 45.05m));
        data.Receipts.Add(new TraceReceiptLine(Guid.NewGuid(), "REC-000301", FakeTraceData.T0.AddDays(-20), "A-1182", data.Plant, flourLot.Id,
            flour.Id, 20, 880, 9.5m, Guid.NewGuid(), "OC-000214", FakeTraceData.T0.AddDays(-24), PurchaseOrderStatus.Received, 8360, 418,
            Guid.NewGuid(), "Proveedor Harinas", "PHA010101AAA", 30));
        data.Move(breadLot, data.Plant, MovementType.ProductionOutput, 1800, "CP-000801");
        data.Move(breadLot, data.Plant, MovementType.TransferOut, -1000, "TR-001502", 10);
        data.Move(breadLot, data.Branch, MovementType.TransferIn, 990, "TR-001502", 20);
        data.Move(breadLot, data.Branch, MovementType.Consumption, -100, "CS-1", 30);
        data.Move(breadLot, data.Branch, MovementType.Waste, -20, "AJ-1", 40);
        data.Balances.Add(new TraceBalance(breadLot.Id, data.Plant, 800));
        data.Balances.Add(new TraceBalance(breadLot.Id, data.Branch, 870));
        data.Transfers.Add(new TraceTransferLine(Guid.NewGuid(), "TR-001502", Guid.NewGuid(), data.Plant, data.Branch, breadLot.Id, bread.Id,
            1000, 990, DiscrepancyReason.Damaged, null, TransferStatus.ReceivedWithDiscrepancies, FakeTraceData.T0.AddMinutes(10),
            FakeTraceData.T0.AddMinutes(20), "U-07", "Chofer", "PED-000902", null, 1000, 1000));

        var result = await Build(data, breadLot, Options(TraceDirection.Both));

        var plant = result.Summary.Locations.Single(l => l.LocationCode == "PLANTA");
        var branch = result.Summary.Locations.Single(l => l.LocationCode == "SUC-02");
        Assert.Equal((1800m, 800m), (plant.ReceivedQty, plant.OnHandQty));
        Assert.Equal((990m, 100m, 20m, 870m), (branch.ReceivedQty, branch.ConsumedQty, branch.WasteQty, branch.OnHandQty));
        Assert.Equal(10m, result.Summary.InTransitLossQty);
        Assert.Equal([("OP-000412-01", 1800m)], result.Summary.FinishedLots.Select(l => (l.LotNumber, l.ProducedQty)));
        var origin = result.Summary.Origins.Single();
        Assert.Equal(("Proveedor Harinas", "OC-000214", "REC-000301", 62m), (origin.SupplierName!, origin.PurchaseOrderFolio!, origin.ReceiptFolio!, origin.ConsumedQty));
        Assert.Contains(result.Edges, e => e.Kind == TraceEdgeKind.Received && e.Qty == 880);

        var delivered = result.Edges.Single(e => e.Kind == TraceEdgeKind.Delivered);
        Assert.Equal((990m, (decimal?)1000m, (DiscrepancyReason?)DiscrepancyReason.Damaged), (delivered.Qty!.Value, delivered.ShippedQty, delivered.DiscrepancyReason));

        // RN-104: the water has no lot; it shows with its quantity and the warning.
        var close = result.Nodes.Single(n => n.Type == TraceNodeType.ProductionClose);
        Assert.Equal([("AGUA", 45.05m)], close.UnlottedConsumption!.Select(u => (u.Sku, u.Qty)));
        Assert.Contains(TraceWarnings.UnlottedComponents, result.Warnings);
    }

    [Fact]
    public async Task A_rejection_on_delivery_gets_its_card_and_the_customer_keeps_what_it_accepted()
    {
        var data = new FakeTraceData();
        var bread = data.Item("DONA", ItemType.FinishedGood, "pza");
        var lot = data.Lot(bread, "OP-000003-01", "ProductionClose");
        data.Move(lot, data.Plant, MovementType.ProductionOutput, 200, "CP-000002");
        data.Move(lot, data.Plant, MovementType.CustomerShipment, -100, "RM-000001", 10);
        data.Move(lot, data.Plant, MovementType.Adjustment, 10, "AJ-000007", 30);
        var shipment = Guid.NewGuid();
        var customer = Guid.NewGuid();
        data.Shipments.Add(new TraceShipmentLot(shipment, "RM-000001", "PC-000001", customer, "CLI-00001", "OXXO-01", data.Plant, data.Plant,
            FakeTraceData.T0.AddMinutes(10), CustomerShipmentStatus.DeliveredWithDiscrepancies, "Camioneta", "Juan", lot.Id, bread.Id, 100,
            FakeTraceData.T0.AddMinutes(30), ReturnedQty: 10, LostQty: 5, ReturnLocationCodes: "PLANTA-PT", ReturnFolios: "AJ-000007"));

        var result = await Build(data, lot, Options(TraceDirection.Forward));

        Assert.Equal(85m, result.Edges.Single(e => e.Kind == TraceEdgeKind.Delivered && e.To == TraceGraphBuilder.CustomerId(customer)).Qty);
        var rejected = result.Edges.Single(e => e.Kind == TraceEdgeKind.Rejected);
        Assert.Equal((TraceGraphBuilder.ShipmentId(shipment), TraceGraphBuilder.RejectionId(shipment), 15m), (rejected.From, rejected.To, rejected.Qty!.Value));
        var card = result.Nodes.Single(n => n.Type == TraceNodeType.Rejection);
        Assert.Equal(("Rechazo de RM-000001", 10m, 5m, "PLANTA-PT", "AJ-000007"),
            (card.Label, card.ReturnedQty!.Value, card.LostQty!.Value, card.ReturnLocationCodes!, card.ReturnFolios!));
        Assert.Contains(result.Events, e => e.Description.StartsWith("Rechazo de OXXO-01") && e.Qty == 15);
    }

    [Fact]
    public async Task Events_are_chronological_and_a_tie_goes_by_folio()
    {
        var data = new FakeTraceData();
        var bread = data.Item("PAN", ItemType.FinishedGood, "pza");
        var lot = data.Lot(bread, "P-1", "ProductionClose");
        data.Move(lot, data.Branch, MovementType.Consumption, -1, "CS-B", 5);
        data.Move(lot, data.Branch, MovementType.Consumption, -1, "CS-A", 5);
        data.Move(lot, data.Branch, MovementType.Waste, -1, "AJ-0", 1);
        data.Balances.Add(new TraceBalance(lot.Id, data.Branch, 7));

        var result = await Build(data, lot, Options(TraceDirection.Forward));

        Assert.Equal(["AJ-0", "CS-A", "CS-B"], result.Events.Select(e => e.Folio));
    }

    [Fact]
    public async Task Costs_are_null_without_their_permission()
    {
        var data = new FakeTraceData();
        var flour = data.Item("HARINA", ItemType.RawMaterial);
        var bread = data.Item("PAN", ItemType.FinishedGood, "pza");
        var flourLot = data.Lot(flour, "HT-1");
        var breadLot = data.Lot(bread, "P-1", "ProductionClose");
        data.Close("CP-1", breadLot, 100, (flourLot, flour, 2));

        var withCosts = await Build(data, breadLot, Options(TraceDirection.Backward));
        var without = await Build(data, breadLot, Options(TraceDirection.Backward, costs: false));

        Assert.Equal(100m, withCosts.Nodes.Single(n => n.Type == TraceNodeType.ProductionClose).TotalCost);
        var close = without.Nodes.Single(n => n.Type == TraceNodeType.ProductionClose);
        Assert.Null(close.TotalCost);
        Assert.All(close.Lines!, l => Assert.Null(l.UnitCost));
        Assert.Null(without.Nodes.Single(n => n.LotId == breadLot.Id && n.Type == TraceNodeType.Lot).UnitCost);
    }

    [Theory]
    [InlineData(TraceSourceType.Lot, TraceDirection.Both)]
    [InlineData(TraceSourceType.PurchaseOrder, TraceDirection.Forward)]
    [InlineData(TraceSourceType.ProductionOrder, TraceDirection.Both)]
    [InlineData(TraceSourceType.Transfer, TraceDirection.Both)]
    [InlineData(TraceSourceType.CustomerShipment, TraceDirection.Backward)]
    public void Each_entry_point_has_its_default_direction(TraceSourceType type, TraceDirection expected) =>
        Assert.Equal(expected, TraceSources.DefaultDirection(type));
}
