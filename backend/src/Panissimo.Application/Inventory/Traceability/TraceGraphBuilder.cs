using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Inventory.Traceability;

/// <param name="ProductionCosts">production.view: close, order and produced lot costs.</param>
/// <param name="PurchaseCosts">purchasing.view: receipt prices and order subtotals.</param>
public sealed record TraceBuildOptions(TraceDirection Direction, int MaxDepth, int MaxNodes, bool ProductionCosts, bool PurchaseCosts);

public sealed record TraceBuildResult(
    bool Truncated, IReadOnlyList<string> UnexpandedNodeIds, IReadOnlyList<string> Warnings, IReadOnlyList<TraceNodeDto> Nodes,
    IReadOnlyList<TraceEdgeDto> Edges, IReadOnlyList<TraceGroupDto> Groups, IReadOnlyList<TraceEventDto> Events, TraceSummaryDto Summary);

/// <summary>
/// Assembles the traceability graph (trazabilidad §5.2) level by level from the seed lots: backward to the closes that
/// produced each lot, the lots they consumed, the purchase receipts and the adjustments that created lots; forward to the
/// closes that consumed each lot, the lots they produced, the transfers and customer shipments that took it, and its stock
/// in every plant or branch (RN-106). A lot is expanded once per direction (RN-103); <c>MaxDepth</c> levels and
/// <c>MaxNodes</c> nodes stop the walk with <c>Truncated</c> and the lots left unexpanded.
/// </summary>
public sealed class TraceGraphBuilder(ITraceDataSource source)
{
    public const int DefaultMaxDepth = 10;
    public const int MaxMaxDepth = 20;
    public const int MaxStockMovements = 50;

    private static readonly HashSet<MovementType> Consumptions = [MovementType.Consumption, MovementType.ProductionConsumption];
    private static readonly HashSet<MovementType> Losses = [MovementType.Waste, MovementType.Adjustment, MovementType.PhysicalCountAdjustment];

    private readonly Dictionary<string, TraceNodeDto> _nodes = [];
    private readonly Dictionary<(string, string, TraceEdgeKind), TraceEdgeDto> _edges = [];
    private readonly Dictionary<Guid, TraceLot> _lots = [];
    private readonly Dictionary<Guid, TraceItem> _items = [];
    private Dictionary<Guid, TraceLocation> _locations = [];
    private readonly Dictionary<Guid, TraceClose> _closes = [];
    private readonly List<TraceCloseLine> _closeLines = [];
    private readonly List<TraceCloseLot> _closeLots = [];
    private readonly List<TraceReceiptLine> _receipts = [];
    private readonly List<TraceOrigin> _origins = [];
    private readonly Dictionary<Guid, TraceTransferLine> _transferLines = [];
    private readonly Dictionary<(Guid, Guid), TraceShipmentLot> _shipmentLots = [];
    private readonly HashSet<(Guid LotId, Guid RootId)> _stocks = [];
    private readonly HashSet<Guid> _expandedBackward = [];
    private readonly HashSet<Guid> _expandedForward = [];
    private readonly HashSet<Guid> _receiptsQueried = [];
    private readonly List<string> _unexpanded = [];
    private TraceBuildOptions _options = null!;
    private bool _truncated;

    /// <summary>Nodes so far: lot and stock nodes are only built at the end, but they count for the limit (RN-103).</summary>
    private int NodeCount => _nodes.Count + _lots.Count + _stocks.Count;

    public async Task<TraceBuildResult> BuildAsync(IReadOnlyCollection<Guid> seeds, TraceBuildOptions options, CancellationToken ct)
    {
        _options = options;
        _locations = (await source.LocationsAsync(ct)).ToDictionary(l => l.Id);
        if (options.Direction is TraceDirection.Backward or TraceDirection.Both)
            await WalkAsync(seeds, backward: true, ct);
        if (options.Direction is TraceDirection.Forward or TraceDirection.Both)
            await WalkAsync(seeds, backward: false, ct);
        await AddLotNodesAsync(_lots.Keys.ToList(), ct);
        var movements = await FillStockAsync(ct);
        var groups = await GroupsAsync(ct);
        AddCloseDetails();

        var warnings = new List<string>();
        if (_truncated)
            warnings.Add(TraceWarnings.Truncated);
        if (_nodes.Values.Any(n => n.UnlottedConsumption is { Count: > 0 }))
            warnings.Add(TraceWarnings.UnlottedComponents);
        if (_receiptsQueried.Any(id => _lots[id].CreatedFromDocType == GoodsReceipt.DocType && _receipts.All(r => r.LotId != id)))
            warnings.Add(TraceWarnings.MissingReceiptLink);

        return new TraceBuildResult(_truncated, _unexpanded.Distinct().ToList(), warnings,
            [.. _nodes.Values.OrderBy(n => n.Type).ThenBy(n => n.Label, StringComparer.Ordinal)], [.. _edges.Values], groups,
            Events(movements), Summary());
    }

    // ---- Walk ------------------------------------------------------------------------------------------------------

    private async Task WalkAsync(IReadOnlyCollection<Guid> seeds, bool backward, CancellationToken ct)
    {
        var expanded = backward ? _expandedBackward : _expandedForward;
        var frontier = seeds.Where(id => !expanded.Contains(id)).Distinct().ToList();
        for (var depth = 0; frontier.Count > 0; depth++)
        {
            if (depth >= _options.MaxDepth || NodeCount >= _options.MaxNodes)
            {
                _truncated = true;
                _unexpanded.AddRange(frontier.Select(LotId));
                return;
            }
            await EnsureLotsAsync(frontier, ct);
            foreach (var id in frontier)
                expanded.Add(id);
            var next = backward ? await BackwardLevelAsync(frontier, ct) : await ForwardLevelAsync(frontier, ct);
            frontier = next.Where(id => !expanded.Contains(id)).Distinct().ToList();
        }
    }

    /// <summary>RN-101: who produced these lots (and what they consumed), who sold them to us, or which adjustment created them.</summary>
    private async Task<List<Guid>> BackwardLevelAsync(List<Guid> lots, CancellationToken ct)
    {
        foreach (var id in lots)
            _receiptsQueried.Add(id);
        foreach (var receipt in await source.ReceiptLinesAsync(lots, ct))
            AddReceipt(receipt);
        foreach (var origin in await source.OriginsAsync([.. lots.Select(id => _lots[id])], ct))
            AddOrigin(origin);

        var closeIds = await source.ClosesProducingAsync(lots, ct);
        await LoadClosesAsync(closeIds, ct);
        var next = new List<Guid>();
        foreach (var closeId in closeIds)
        {
            var close = _closes[closeId];
            AddProduced(close);
            foreach (var used in _closeLots.Where(l => l.CloseId == closeId))
            {
                AddConsumed(used, _closeLines.Single(l => l.LineId == used.LineId));
                next.Add(used.LotId);
            }
        }
        return next;
    }

    /// <summary>RN-102: closes that consumed these lots (and what they produced), transfers and customer shipments.</summary>
    private async Task<List<Guid>> ForwardLevelAsync(List<Guid> lots, CancellationToken ct)
    {
        var next = new List<Guid>();
        var closeIds = await source.ClosesConsumingAsync(lots, ct);
        await LoadClosesAsync(closeIds, ct);
        var set = lots.ToHashSet();
        foreach (var used in _closeLots.Where(l => set.Contains(l.LotId) && closeIds.Contains(l.CloseId)))
        {
            AddConsumed(used, _closeLines.Single(l => l.LineId == used.LineId));
            var close = _closes[used.CloseId];
            AddProduced(close);
            if (close.OutputLotId is { } output)
                next.Add(output);
        }
        await EnsureLotsAsync(next, ct);

        foreach (var line in await source.TransferLinesAsync(lots, ct))
            AddTransfer(line);
        foreach (var shipped in await source.ShipmentLotsAsync(lots, ct))
            AddShipment(shipped);
        return next;
    }

    private async Task LoadClosesAsync(IReadOnlyCollection<Guid> closeIds, CancellationToken ct)
    {
        var missing = closeIds.Where(id => !_closes.ContainsKey(id)).ToList();
        if (missing.Count == 0)
            return;
        var details = await source.CloseDetailsAsync(missing, ct);
        foreach (var close in details.Closes)
            _closes[close.Id] = close;
        _closeLines.AddRange(details.Lines);
        _closeLots.AddRange(details.Lots);
        await EnsureItemsAsync(details.Lines.Select(l => l.ComponentItemId), ct);
        // Output and consumed lots of these closes, in one query.
        await EnsureLotsAsync([.. details.Closes.Where(c => c.OutputLotId is not null).Select(c => c.OutputLotId!.Value)
            .Concat(details.Lots.Select(l => l.LotId))], ct);
    }

    private async Task EnsureLotsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        var missing = ids.Where(id => !_lots.ContainsKey(id)).Distinct().ToList();
        if (missing.Count == 0)
            return;
        foreach (var lot in await source.LotsAsync(missing, ct))
            _lots[lot.Id] = lot;
        await EnsureItemsAsync(_lots.Values.Select(l => l.ItemId), ct);
    }

    private async Task EnsureItemsAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var missing = ids.Where(id => !_items.ContainsKey(id)).Distinct().ToList();
        if (missing.Count == 0)
            return;
        foreach (var item in await source.ItemsAsync(missing, ct))
            _items[item.Id] = item;
    }

    // ---- Nodes and edges -----------------------------------------------------------------------------------------

    public static string LotId(Guid id) => $"lot:{id}";
    public static string CloseId(Guid id) => $"cp:{id}";
    public static string StockId(Guid lotId, Guid rootId) => $"stk:{lotId}:{rootId}";
    public static string TransferId(Guid id) => $"tr:{id}";
    public static string ShipmentId(Guid id) => $"rm:{id}";
    public static string CustomerId(Guid id) => $"cus:{id}";
    public static string RejectionId(Guid shipmentId) => $"rej:{shipmentId}";
    public static string OrderId(Guid id) => $"op:{id}";
    private static string ReceiptId(Guid receiptId, Guid lotId) => $"rec:{receiptId}:{lotId}";
    private static string SupplierId(Guid id) => $"sup:{id}";
    private static string OriginId(Guid docId, Guid lotId) => $"ini:{docId}:{lotId}";

    private void AddEdge(TraceEdgeDto edge)
    {
        var key = (edge.From, edge.To, edge.Kind);
        if (_edges.TryGetValue(key, out var existing))
            // The same link reached twice (several lines, both directions): one edge with the quantities of the documents.
            _edges[key] = existing.Qty == edge.Qty ? existing : existing with { Qty = edge.Qty };
        else
            _edges[key] = edge;
    }

    private string Root(Guid locationId) => _locations.TryGetValue(locationId, out var l) ? l.RootId.ToString() : locationId.ToString();

    private Guid RootId(Guid locationId) => _locations.TryGetValue(locationId, out var l) ? l.RootId : locationId;

    private string Stock(Guid lotId, Guid locationId)
    {
        var root = RootId(locationId);
        _stocks.Add((lotId, root));
        return StockId(lotId, root);
    }

    private string Uom(Guid itemId) => _items.TryGetValue(itemId, out var i) ? i.BaseUom : "";

    private void AddReceipt(TraceReceiptLine r)
    {
        var id = ReceiptId(r.ReceiptId, r.LotId);
        if (_nodes.TryGetValue(id, out var existing))
        {
            // Two lines of one receipt with the same lot: one node with both quantities.
            _nodes[id] = existing with { PurchaseQty = existing.PurchaseQty + r.Quantity, BaseQty = existing.BaseQty + r.BaseQuantity };
        }
        else
        {
            _receipts.Add(r);
            var item = _items.GetValueOrDefault(r.ItemId);
            _nodes[id] = new TraceNodeDto
            {
                Id = id, Type = TraceNodeType.PurchaseReceipt, Label = $"{r.ReceiptFolio} · {r.PurchaseOrderFolio}",
                ItemId = r.ItemId, Sku = item?.Sku, ItemName = item?.Name, ItemType = item?.Type, BaseUom = item?.BaseUom,
                PurchaseOrderId = r.PurchaseOrderId, PurchaseOrderFolio = r.PurchaseOrderFolio,
                PurchaseOrderDate = DateOnly.FromDateTime(r.PurchaseOrderCreatedAt.UtcDateTime), PurchaseOrderStatus = r.PurchaseOrderStatus,
                PurchaseOrderSubtotal = _options.PurchaseCosts ? r.PurchaseOrderSubtotal : null,
                ReceiptId = r.ReceiptId, ReceiptFolio = r.ReceiptFolio, ReceivedAt = r.ReceivedAt, PurchaseQty = r.Quantity,
                PurchaseUom = item?.PurchaseUom, BaseQty = r.BaseQuantity, SupplierInvoiceNumber = r.SupplierInvoiceNumber,
                UnitPrice = _options.PurchaseCosts ? r.UnitPrice : null, UnitCostBase = _options.PurchaseCosts ? r.UnitCostBase : null,
                LotId = r.LotId, LocationId = RootId(r.LocationId), LocationCode = Code(r.LocationId),
            };
        }
        _nodes.TryAdd(SupplierId(r.SupplierId), new TraceNodeDto
        {
            Id = SupplierId(r.SupplierId), Type = TraceNodeType.Supplier, Label = r.SupplierName, SupplierId = r.SupplierId,
            TaxId = r.SupplierTaxId, PaymentTermsDays = r.PaymentTermsDays,
        });
        AddEdge(new TraceEdgeDto(SupplierId(r.SupplierId), id, TraceEdgeKind.Supplied, null, null, r.ReceivedAt));
        var received = _receipts.Where(x => x.ReceiptId == r.ReceiptId && x.LotId == r.LotId).Sum(x => x.BaseQuantity);
        AddEdge(new TraceEdgeDto(id, LotId(r.LotId), TraceEdgeKind.Received, received, Uom(r.ItemId), r.ReceivedAt));
    }

    private void AddOrigin(TraceOrigin o)
    {
        var id = OriginId(o.DocId, o.LotId);
        _origins.Add(o);
        _nodes.TryAdd(id, new TraceNodeDto
        {
            Id = id, Type = TraceNodeType.InitialStock, Label = o.Folio, Folio = o.Folio, DocType = o.DocType, DocId = o.DocId,
            PostedAt = o.At, LotId = o.LotId, LocationId = RootId(o.LocationId), LocationCode = Code(o.LocationId),
        });
        AddEdge(new TraceEdgeDto(id, LotId(o.LotId), TraceEdgeKind.Created, o.Qty, Uom(_lots[o.LotId].ItemId), o.At));
    }

    /// <summary>The close and the lot it produced.</summary>
    private void AddProduced(TraceClose close)
    {
        _nodes.TryAdd(CloseId(close.Id), new TraceNodeDto { Id = CloseId(close.Id), Type = TraceNodeType.ProductionClose, Label = close.Folio });
        if (close.OutputLotId is { } lot)
            AddEdge(new TraceEdgeDto(CloseId(close.Id), LotId(lot), TraceEdgeKind.Produced, close.ProducedQty,
                Uom(_lots.TryGetValue(lot, out var l) ? l.ItemId : Guid.Empty), close.ClosedAt));
    }

    /// <summary>The stock of a lot a close consumed (RN-105: the quantity of the close's line lot).</summary>
    private void AddConsumed(TraceCloseLot used, TraceCloseLine line)
    {
        _nodes.TryAdd(CloseId(used.CloseId), new TraceNodeDto { Id = CloseId(used.CloseId), Type = TraceNodeType.ProductionClose, Label = _closes[used.CloseId].Folio });
        AddEdge(new TraceEdgeDto(Stock(used.LotId, line.LocationId), CloseId(used.CloseId), TraceEdgeKind.Consumed, used.Qty,
            Uom(line.ComponentItemId), _closes[used.CloseId].ClosedAt));
    }

    private void AddTransfer(TraceTransferLine t)
    {
        _transferLines[t.LineId] = t;
        _nodes.TryAdd(TransferId(t.TransferId), new TraceNodeDto { Id = TransferId(t.TransferId), Type = TraceNodeType.Transfer, Label = t.Folio });
        var uom = Uom(t.ItemId);
        var shipped = _transferLines.Values.Where(x => x.TransferId == t.TransferId && x.LotId == t.LotId).Sum(x => x.ShippedQty);
        AddEdge(new TraceEdgeDto(Stock(t.LotId, t.FromLocationId), TransferId(t.TransferId), TraceEdgeKind.Dispatched, shipped, uom,
            t.DispatchedAt));
        if (t.ReceivedQty is not null)
        {
            var lines = _transferLines.Values.Where(x => x.TransferId == t.TransferId && x.LotId == t.LotId).ToList();
            AddEdge(new TraceEdgeDto(TransferId(t.TransferId), Stock(t.LotId, t.ToLocationId), TraceEdgeKind.Delivered,
                lines.Sum(x => x.ReceivedQty ?? 0), uom, t.ReceivedAt, shipped,
                lines.Select(x => x.DiscrepancyReason).FirstOrDefault(r => r is not null)));
        }
    }

    private void AddShipment(TraceShipmentLot s)
    {
        _shipmentLots[(s.ShipmentId, s.LotId)] = s;
        _nodes.TryAdd(ShipmentId(s.ShipmentId), new TraceNodeDto { Id = ShipmentId(s.ShipmentId), Type = TraceNodeType.CustomerShipment, Label = s.Folio });
        _nodes.TryAdd(CustomerId(s.CustomerId), new TraceNodeDto
        {
            Id = CustomerId(s.CustomerId), Type = TraceNodeType.Customer, Label = s.CustomerName, CustomerId = s.CustomerId,
            CustomerCode = s.CustomerCode, CustomerName = s.CustomerName,
        });
        var uom = Uom(s.ItemId);
        AddEdge(new TraceEdgeDto(Stock(s.LotId, s.LineLocationId), ShipmentId(s.ShipmentId), TraceEdgeKind.Shipped, s.Qty, uom, s.DispatchedAt));
        var lots = _shipmentLots.Values.Where(x => x.ShipmentId == s.ShipmentId).ToList();
        // RN-114: the customer keeps what it accepted; what it rejected goes to its own card.
        AddEdge(new TraceEdgeDto(ShipmentId(s.ShipmentId), CustomerId(s.CustomerId), TraceEdgeKind.Delivered,
            lots.Sum(x => x.Qty - x.ReturnedQty - x.LostQty), uom, s.DeliveredAt ?? s.DispatchedAt));
        var rejected = lots.Sum(x => x.ReturnedQty + x.LostQty);
        if (rejected <= 0)
            return;
        _nodes.TryAdd(RejectionId(s.ShipmentId), new TraceNodeDto { Id = RejectionId(s.ShipmentId), Type = TraceNodeType.Rejection, Label = s.Folio });
        AddEdge(new TraceEdgeDto(ShipmentId(s.ShipmentId), RejectionId(s.ShipmentId), TraceEdgeKind.Rejected, rejected, uom, s.DeliveredAt));
    }

    private string Code(Guid locationId) => _locations.TryGetValue(RootId(locationId), out var l) ? l.Code : "";

    private async Task AddLotNodesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct)
    {
        await EnsureItemsAsync(_lots.Values.Select(l => l.ItemId), ct);
        foreach (var lot in lotIds.Select(id => _lots[id]))
        {
            var item = _items[lot.ItemId];
            var producedBy = _closes.Values.FirstOrDefault(c => c.OutputLotId == lot.Id);
            _nodes[LotId(lot.Id)] = new TraceNodeDto
            {
                Id = LotId(lot.Id), Type = TraceNodeType.Lot, Label = $"{lot.LotNumber} · {item.Name}", LotId = lot.Id,
                LotNumber = lot.LotNumber, ItemId = item.Id, Sku = item.Sku, ItemName = item.Name, ItemType = item.Type, BaseUom = item.BaseUom,
                ExpirationDate = lot.ExpirationDate, CreatedAt = lot.CreatedAt,
                UnitCost = producedBy is not null && _options.ProductionCosts ? producedBy.UnitCost : null,
            };
        }
    }

    // ---- Stock (RN-106) ------------------------------------------------------------------------------------------

    /// <summary>
    /// Every (lot, plant or branch) reached gets its stock node: entries, exits by type, current stock and its kardex. Going
    /// forward, also the locations the lot reached without a document of the chain (e.g. consumed in a branch).
    /// </summary>
    private async Task<IReadOnlyList<TraceMovement>> FillStockAsync(CancellationToken ct)
    {
        var lotIds = _stocks.Select(s => s.LotId).Concat(_expandedForward).Distinct().ToList();
        if (lotIds.Count == 0)
            return [];
        var movements = (await source.MovementsAsync(lotIds, ct)).OrderBy(m => m.Sequence).ToList();
        var balances = await source.BalancesAsync(lotIds, ct);
        foreach (var m in movements.Where(m => _expandedForward.Contains(m.LotId)))
            _stocks.Add((m.LotId, RootId(m.LocationId)));

        foreach (var (lotId, rootId) in _stocks)
        {
            var lot = _lots[lotId];
            var item = _items[lot.ItemId];
            var here = movements.Where(m => m.LotId == lotId && RootId(m.LocationId) == rootId).ToList();
            var balance = 0m;
            var history = here.Select(m => new TraceStockMovementDto(m.At, m.Type, m.Folio, m.Quantity, balance += m.Quantity)).ToList();
            var entries = here.Where(m => m.Quantity > 0 && m.Type != MovementType.TransferIn).ToList();
            var location = _locations[rootId];
            var id = StockId(lotId, rootId);
            _nodes[id] = new TraceNodeDto
            {
                Id = id, Type = TraceNodeType.Stock, Label = $"{lot.LotNumber} · {location.Code}", LotId = lotId, LotNumber = lot.LotNumber,
                ItemId = item.Id, Sku = item.Sku, ItemName = item.Name, ItemType = item.Type, BaseUom = item.BaseUom,
                LocationId = rootId, LocationCode = location.Code, LocationName = location.Name, LocationType = location.Type,
                InQty = here.Where(m => m.Quantity > 0).Sum(m => m.Quantity),
                OutByType = here.Where(m => m.Quantity < 0).GroupBy(m => m.Type).ToDictionary(g => g.Key.ToString(), g => -g.Sum(m => m.Quantity)),
                OnHandQty = balances.Where(b => b.LotId == lotId && RootId(b.LocationId) == rootId).Sum(b => b.Quantity),
                Movements = history.Count > MaxStockMovements ? history[^MaxStockMovements..] : history,
                MovementsTruncated = history.Count > MaxStockMovements,
            };
            // The lot enters the location where it was received, produced or adjusted (transfers bring it elsewhere).
            if (entries.Count > 0)
                AddEdge(new TraceEdgeDto(LotId(lotId), id, TraceEdgeKind.Entered, entries.Sum(m => m.Quantity), item.BaseUom, entries[0].At));
        }
        return movements;
    }

    // ---- Groups, close details, events, summary ------------------------------------------------------------------

    private async Task<IReadOnlyList<TraceGroupDto>> GroupsAsync(CancellationToken ct)
    {
        var orderIds = _closes.Values.Select(c => c.ProductionOrderId).Distinct().ToList();
        if (orderIds.Count == 0)
            return [];
        var orders = await source.OrdersAsync(orderIds, ct);
        var demands = await source.DemandsAsync(orderIds, ct);
        await EnsureItemsAsync(orders.Select(o => o.OutputItemId), ct);
        var users = await source.UserNamesAsync(
            [.. orders.SelectMany(o => new[] { o.CreatedBy, o.ReleasedBy, o.CompletedBy }).Concat(_closes.Values.Select(c => c.ClosedBy))
                .Where(u => u is not null).Select(u => u!.Value).Distinct()], ct);
        string? Name(Guid? id) => id is { } u && users.TryGetValue(u, out var name) ? name : null;

        foreach (var close in _closes.Values)
            if (_nodes.TryGetValue(CloseId(close.Id), out var node))
                _nodes[node.Id] = node with { ClosedByName = Name(close.ClosedBy) };

        return [.. orders.OrderBy(o => o.Folio).Select(o =>
        {
            var item = _items[o.OutputItemId];
            var history = new List<TraceStatusDto> { new(ProductionOrderStatus.Draft, o.CreatedAt, Name(o.CreatedBy)) };
            if (o.ReleasedAt is { } released)
                history.Add(new TraceStatusDto(ProductionOrderStatus.Released, released, Name(o.ReleasedBy)));
            if (_closes.Values.Where(c => c.ProductionOrderId == o.Id).MinBy(c => c.ClosedAt) is { } first)
                history.Add(new TraceStatusDto(ProductionOrderStatus.InProgress, first.ClosedAt, Name(first.ClosedBy)));
            if (o.CompletedAt is { } completed)
                history.Add(new TraceStatusDto(ProductionOrderStatus.Completed, completed, Name(o.CompletedBy)));
            if (o.CancelledAt is { } cancelled)
                history.Add(new TraceStatusDto(ProductionOrderStatus.Cancelled, cancelled, null));
            return new TraceGroupDto(OrderId(o.Id), o.Id, o.Folio, item.Id, item.Sku, item.Name, o.PlannedQty, o.ProducedQty, item.BaseUom,
                o.Status, o.ScheduledDate, o.Shift, o.AreaName, item.Name, o.RecipeVersion, o.Source,
                _options.ProductionCosts ? o.TotalCost : null, _options.ProductionCosts ? o.UnitCost : null, o.ShortfallReason,
                history, [.. demands.Where(d => d.ProductionOrderId == o.Id).Select(d => new TraceDemandDto(d.Type, d.Folio, d.PartyName, d.Quantity))],
                [.. _closes.Values.Where(c => c.ProductionOrderId == o.Id && _nodes.ContainsKey(CloseId(c.Id))).OrderBy(c => c.Sequence)
                    .Select(c => CloseId(c.Id))]);
        })];
    }

    /// <summary>Close nodes with their data: what they produced, every line with its lots and the components without lot (RN-104).</summary>
    private void AddCloseDetails()
    {
        foreach (var close in _closes.Values)
        {
            if (!_nodes.TryGetValue(CloseId(close.Id), out var node))
                continue;
            var lines = _closeLines.Where(l => l.CloseId == close.Id).ToList();
            var unlotted = lines.Where(l => _items.TryGetValue(l.ComponentItemId, out var i) && !i.TracksLots).ToList();
            var output = close.OutputLotId is { } lot && _lots.TryGetValue(lot, out var l) ? _items[l.ItemId] : null;
            _nodes[node.Id] = node with
            {
                Label = output is null ? close.Folio : $"{close.Folio} · {output.Name}",
                CloseId = close.Id, Folio = close.Folio, Kind = close.Kind, Sequence = close.Sequence, ProductionOrderId = close.ProductionOrderId,
                ClosedAt = close.ClosedAt, BusinessDate = close.BusinessDate, Shift = close.Shift, ProducedQty = close.ProducedQty,
                ItemId = output?.Id, Sku = output?.Sku, ItemName = output?.Name, ItemType = output?.Type, BaseUom = output?.BaseUom,
                LocationId = RootId(close.OutputLocationId), LocationCode = Code(close.OutputLocationId),
                TotalCost = _options.ProductionCosts ? close.TotalCost : null,
                UnitCost = _options.ProductionCosts ? close.UnitCost : null,
                WasteCost = _options.ProductionCosts ? InventoryMath.Round(lines.Sum(x => x.WasteQty * x.UnitCost)) : null,
                UnlottedConsumption = [.. unlotted.Select(x => new TraceQtyDto(x.ComponentItemId, _items[x.ComponentItemId].Sku,
                    _items[x.ComponentItemId].Name, x.ActualQty, _items[x.ComponentItemId].BaseUom))],
                Lines = [.. lines.SelectMany(x =>
                {
                    var item = _items[x.ComponentItemId];
                    var cost = _options.ProductionCosts ? x.UnitCost : (decimal?)null;
                    var used = _closeLots.Where(u => u.LineId == x.LineId).ToList();
                    return used.Count == 0
                        ? [new TraceCloseLineDto(item.Id, item.Sku, item.Name, null, null, x.TheoreticalQty, x.ActualQty, cost, item.BaseUom)]
                        : used.Select(u => new TraceCloseLineDto(item.Id, item.Sku, item.Name, u.LotId,
                            _lots.TryGetValue(u.LotId, out var ul) ? ul.LotNumber : null,
                            x.ActualQty == 0 ? 0 : InventoryMath.Round(x.TheoreticalQty * u.Qty / x.ActualQty), u.Qty, cost, item.BaseUom));
                }).OrderBy(x => x.Sku, StringComparer.Ordinal)],
            };
        }
        foreach (var transfer in _transferLines.Values.GroupBy(t => t.TransferId))
        {
            var first = transfer.First();
            var id = TransferId(first.TransferId);
            _nodes[id] = _nodes[id] with
            {
                Label = $"{first.Folio} · {Code(first.FromLocationId)} → {Code(first.ToLocationId)}", TransferId = first.TransferId,
                Folio = first.Folio, BranchOrderFolio = first.BranchOrderFolio, FromLocationCode = Code(first.FromLocationId),
                ToLocationCode = Code(first.ToLocationId), TransferStatus = first.Status, DispatchedAt = first.DispatchedAt,
                DeliveredAt = first.ReceivedAt, VehicleDescription = first.VehicleDescription, DriverName = first.DriverName,
                RequestedQty = first.RequestedQty, ApprovedQty = first.ApprovedQty, ApprovedAt = first.ApprovedAt,
                ItemId = first.ItemId, Sku = _items.GetValueOrDefault(first.ItemId)?.Sku, ItemName = _items.GetValueOrDefault(first.ItemId)?.Name,
                BaseUom = Uom(first.ItemId),
                TransferLines = [.. transfer.Select(t => new TraceTransferLineDto(t.LotId, _lots.TryGetValue(t.LotId, out var tl) ? tl.LotNumber : null,
                    t.ShippedQty, t.ReceivedQty, t.DiscrepancyReason, t.DiscrepancyNotes))],
            };
        }
        foreach (var shipment in _shipmentLots.Values.GroupBy(s => s.ShipmentId))
        {
            var first = shipment.First();
            var id = ShipmentId(first.ShipmentId);
            _nodes[id] = _nodes[id] with
            {
                Label = $"{first.Folio} · {first.CustomerName}", ShipmentId = first.ShipmentId, Folio = first.Folio,
                CustomerOrderFolio = first.CustomerOrderFolio, ShipmentStatus = first.Status, CustomerId = first.CustomerId,
                CustomerCode = first.CustomerCode, CustomerName = first.CustomerName, DispatchedAt = first.DispatchedAt,
                FromLocationCode = Code(first.FromLocationId), VehicleDescription = first.VehicleDescription, DriverName = first.DriverName,
                ItemId = first.ItemId, Sku = _items.GetValueOrDefault(first.ItemId)?.Sku, ItemName = _items.GetValueOrDefault(first.ItemId)?.Name,
                BaseUom = Uom(first.ItemId), ProducedQty = shipment.Sum(s => s.Qty), DeliveredAt = first.DeliveredAt,
            };
            // RN-114: the rejection card of the shipment.
            if (_nodes.TryGetValue(RejectionId(first.ShipmentId), out var rejection))
            {
                static string? Join(IEnumerable<string?> values) =>
                    string.Join(", ", values.SelectMany(v => (v ?? "").Split(", ", StringSplitOptions.RemoveEmptyEntries)).Distinct().Order()) is { Length: > 0 } text
                        ? text : null;
                _nodes[rejection.Id] = rejection with
                {
                    Label = $"Rechazo de {first.Folio}", ShipmentId = first.ShipmentId, Folio = first.Folio, CustomerName = first.CustomerName,
                    ItemId = first.ItemId, Sku = _items.GetValueOrDefault(first.ItemId)?.Sku, ItemName = _items.GetValueOrDefault(first.ItemId)?.Name,
                    BaseUom = Uom(first.ItemId), DeliveredAt = first.DeliveredAt, ReturnedQty = shipment.Sum(s => s.ReturnedQty),
                    LostQty = shipment.Sum(s => s.LostQty), ReturnLocationCodes = Join(shipment.Select(s => s.ReturnLocationCodes)),
                    ReturnFolios = Join(shipment.Select(s => s.ReturnFolios)),
                };
            }
        }
    }

    private IReadOnlyList<TraceEventDto> Events(IReadOnlyList<TraceMovement> movements)
    {
        var events = new List<TraceEventDto>();
        string? Sku(Guid itemId) => _items.GetValueOrDefault(itemId)?.Sku;
        string? LotNumber(Guid lotId) => _lots.GetValueOrDefault(lotId)?.LotNumber;

        foreach (var r in _receipts)
            events.Add(new TraceEventDto(r.ReceivedAt, GoodsReceipt.DocType, r.ReceiptId, r.ReceiptFolio, "Recepción de compra", Sku(r.ItemId),
                LotNumber(r.LotId), r.BaseQuantity, Uom(r.ItemId), Code(r.LocationId)));
        foreach (var o in _origins)
            events.Add(new TraceEventDto(o.At, o.DocType, o.DocId, o.Folio,
                o.DocType == InventoryAdjustment.DocType ? "Entrada por ajuste" : "Entrada por conteo físico",
                Sku(_lots[o.LotId].ItemId), LotNumber(o.LotId), o.Qty, Uom(_lots[o.LotId].ItemId), Code(o.LocationId)));
        foreach (var c in _closes.Values.Where(c => _nodes.ContainsKey(CloseId(c.Id))))
        {
            var output = c.OutputLotId is { } lot ? _lots.GetValueOrDefault(lot) : null;
            events.Add(new TraceEventDto(c.ClosedAt, ProductionClose.DocType, c.Id, c.Folio,
                c.Kind == ProductionCloseKind.Final ? "Cierre final de producción" : "Cierre parcial de producción",
                output is null ? null : Sku(output.ItemId), output?.LotNumber, c.ProducedQty, output is null ? null : Uom(output.ItemId),
                Code(c.OutputLocationId)));
        }
        foreach (var t in _transferLines.Values.GroupBy(t => (t.TransferId, t.LotId)))
        {
            var first = t.First();
            if (first.DispatchedAt is { } dispatched)
                events.Add(new TraceEventDto(dispatched, "Transfer", first.TransferId, first.Folio, $"Despacho a {Code(first.ToLocationId)}",
                    Sku(first.ItemId), LotNumber(first.LotId), t.Sum(x => x.ShippedQty), Uom(first.ItemId), Code(first.FromLocationId)));
            if (first.ReceivedAt is { } received)
                events.Add(new TraceEventDto(received, "Transfer", first.TransferId, first.Folio, "Recepción de traspaso",
                    Sku(first.ItemId), LotNumber(first.LotId), t.Sum(x => x.ReceivedQty ?? 0), Uom(first.ItemId), Code(first.ToLocationId)));
        }
        foreach (var s in _shipmentLots.Values.Where(s => s.DispatchedAt is not null))
            events.Add(new TraceEventDto(s.DispatchedAt!.Value, "CustomerShipment", s.ShipmentId, s.Folio, $"Remisión a {s.CustomerName}",
                Sku(s.ItemId), LotNumber(s.LotId), s.Qty, Uom(s.ItemId), Code(s.FromLocationId)));
        // RN-114: what the customer rejected on delivery (the return itself is the CustomerReturn adjustment's entry).
        foreach (var s in _shipmentLots.Values.Where(s => s.DeliveredAt is not null && s.ReturnedQty + s.LostQty > 0))
            events.Add(new TraceEventDto(s.DeliveredAt!.Value, "CustomerShipment", s.ShipmentId, s.Folio,
                s.LostQty == 0 ? $"Rechazo de {s.CustomerName}: regresa" : s.ReturnedQty == 0 ? $"Rechazo de {s.CustomerName}: merma"
                    : $"Rechazo de {s.CustomerName}: {s.ReturnedQty:0.####} regresan y {s.LostQty:0.####} de merma",
                Sku(s.ItemId), LotNumber(s.LotId), s.ReturnedQty + s.LostQty, Uom(s.ItemId), s.ReturnLocationCodes ?? Code(s.FromLocationId)));
        // What happened to the lot in each location that no document of the chain explains: consumption, waste, adjustments.
        foreach (var m in movements.Where(m => _stocks.Contains((m.LotId, RootId(m.LocationId))) && (Consumptions.Contains(m.Type) || Losses.Contains(m.Type))
                     && m.Type != MovementType.ProductionConsumption
                     // The adjustment that created the lot already is an event of its own.
                     && !_origins.Any(o => o.LotId == m.LotId && o.Folio == m.Folio)))
            events.Add(new TraceEventDto(m.At, m.SourceDocType, Guid.Empty, m.Folio, m.Type switch
            {
                MovementType.Consumption => "Consumo",
                MovementType.Waste => "Merma",
                MovementType.PhysicalCountAdjustment => "Ajuste por conteo",
                _ => m.Quantity > 0 ? "Ajuste de entrada" : "Ajuste de salida",
            }, Sku(_lots[m.LotId].ItemId), LotNumber(m.LotId), m.Quantity, Uom(_lots[m.LotId].ItemId), Code(m.LocationId)));

        // Chronological; a tie (same moment) goes by folio.
        return [.. events.OrderBy(e => e.At).ThenBy(e => e.Folio, StringComparer.Ordinal)];
    }

    /// <summary>RN-108: what to collect and where, from the finished lots reached.</summary>
    private TraceSummaryDto Summary()
    {
        var finished = _nodes.Values.Where(n => n.Type == TraceNodeType.Lot && n.ItemType == ItemType.FinishedGood).ToList();
        var finishedIds = finished.Select(n => n.LotId!.Value).ToHashSet();
        decimal ConsumedFrom(Guid lotId) => _edges.Values
            .Where(e => e.Kind == TraceEdgeKind.Consumed && e.From.StartsWith($"stk:{lotId}:", StringComparison.Ordinal)).Sum(e => e.Qty ?? 0);

        var origins = _receipts.Select(r => new TraceOriginDto(r.SupplierName, r.PurchaseOrderFolio, r.ReceiptFolio, null, r.LotId,
                _lots[r.LotId].LotNumber, _items[r.ItemId].Sku, ConsumedFrom(r.LotId), _items[r.ItemId].BaseUom))
            .Concat(_origins.Select(o => new TraceOriginDto(null, null, null, o.Folio, o.LotId, _lots[o.LotId].LotNumber,
                _items[_lots[o.LotId].ItemId].Sku, ConsumedFrom(o.LotId), _items[_lots[o.LotId].ItemId].BaseUom)))
            .GroupBy(o => (o.ReceiptFolio, o.DocFolio, o.LotId)).Select(g => g.First())
            .OrderBy(o => o.Sku, StringComparer.Ordinal).ThenBy(o => o.LotNumber, StringComparer.Ordinal).ToList();

        var finishedLots = finished.Select(n => new TraceFinishedLotDto(n.LotId!.Value, n.LotNumber!, n.Sku!, n.ItemName!,
                _edges.Values.Where(e => e.Kind == TraceEdgeKind.Produced && e.To == n.Id).Sum(e => e.Qty ?? 0), n.BaseUom!, n.ExpirationDate))
            .OrderBy(l => l.LotNumber, StringComparer.Ordinal).ToList();

        var locations = _nodes.Values.Where(n => n.Type == TraceNodeType.Stock && finishedIds.Contains(n.LotId!.Value))
            .GroupBy(n => (n.LocationId!.Value, n.BaseUom!))
            .Select(g =>
            {
                decimal Out(Func<MovementType, bool> filter) =>
                    g.Sum(n => n.OutByType!.Where(o => filter(Enum.Parse<MovementType>(o.Key))).Sum(o => o.Value));
                var first = g.First();
                return new TraceLocationSummaryDto(g.Key.Item1, first.LocationCode!, first.LocationName!, first.LocationType!.Value,
                    g.Sum(n => n.InQty ?? 0), Out(Consumptions.Contains), Out(Losses.Contains), g.Sum(n => n.OnHandQty ?? 0), g.Key.Item2);
            })
            .OrderBy(l => l.LocationType).ThenBy(l => l.LocationCode, StringComparer.Ordinal).ToList();

        var customers = _shipmentLots.Values.Where(s => finishedIds.Contains(s.LotId)).GroupBy(s => (s.CustomerId, Uom(s.ItemId)))
            .Select(g => new TraceCustomerSummaryDto(g.Key.CustomerId, g.First().CustomerName, g.Sum(s => s.Qty), g.Key.Item2,
                [.. g.Select(s => s.Folio).Distinct().Order(StringComparer.Ordinal)]))
            .OrderBy(c => c.CustomerName, StringComparer.Ordinal).ToList();

        // RN-107: shipped and not received is lost in transit; it is in no location.
        var loss = _transferLines.Values.Where(t => finishedIds.Contains(t.LotId) && t.ReceivedQty is not null)
            .Sum(t => t.ShippedQty - t.ReceivedQty!.Value);
        return new TraceSummaryDto(origins, finishedLots, locations, customers, loss);
    }
}
