using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Production;
using Panissimo.Domain.Sales;

namespace Panissimo.Infrastructure.Inventory.Traceability;

/// <summary>
/// The links of the chain by level and in batches (trazabilidad §5.1): every method takes the ids of a whole level and
/// runs one query (`= ANY(@ids)`), using the indexes of §3.2. Read only.
/// </summary>
public sealed class TraceabilityQueries(IAppDbContext db, IUserDirectory userDirectory) : ITraceDataSource
{
    public async Task<IReadOnlyList<TraceLot>> LotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id))
            .Select(l => new TraceLot(l.Id, l.ItemId, l.LotNumber, l.ExpirationDate, l.CreatedFromDocType, l.CreatedFromDocId, l.CreatedAt,
                l.SupplierLotNumber))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TraceItem>> ItemsAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken ct) =>
        await (from i in db.Items.AsNoTracking()
               join b in db.UnitsOfMeasure on i.BaseUomId equals b.Id
               join p in db.UnitsOfMeasure on i.PurchaseUomId ?? i.BaseUomId equals p.Id
               where itemIds.Contains(i.Id)
               select new TraceItem(i.Id, i.Sku, i.Name, i.Type, b.Code, p.Code, i.TracksLots))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TraceLocation>> LocationsAsync(CancellationToken ct) =>
        await db.Locations.AsNoTracking()
            .Select(l => new TraceLocation(l.Id, l.Code, l.Name, l.Type, l.ParentLocationId))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Guid>> ClosesProducingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await db.ProductionCloses.AsNoTracking()
            .Where(c => c.OutputLotId != null && lotIds.Contains(c.OutputLotId.Value)).Select(c => c.Id)
            .ToListAsync(ct);

    public async Task<IReadOnlyList<Guid>> ClosesConsumingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await db.ProductionCloses.AsNoTracking()
            .Where(c => c.Lines.Any(l => l.Lots.Any(x => lotIds.Contains(x.LotId)))).Select(c => c.Id)
            .ToListAsync(ct);

    public async Task<TraceCloseDetails> CloseDetailsAsync(IReadOnlyCollection<Guid> closeIds, CancellationToken ct)
    {
        var closes = await db.ProductionCloses.AsNoTracking().Where(c => closeIds.Contains(c.Id))
            .Select(c => new TraceClose(c.Id, c.Folio, c.ProductionOrderId, c.Sequence, c.Kind, c.BusinessDate, c.Shift, c.ClosedAt,
                c.ClosedBy, c.ProducedQty, c.OutputLotId, c.OutputLocationId, c.TotalCost, c.UnitCost))
            .ToListAsync(ct);
        var lines = await db.ProductionCloses.AsNoTracking().Where(c => closeIds.Contains(c.Id))
            .SelectMany(c => c.Lines.Select(l => new TraceCloseLine(c.Id, l.Id, l.ComponentItemId, l.LocationId, l.TheoreticalQty,
                l.ActualQty, l.UnitCost, l.WasteQty)))
            .ToListAsync(ct);
        var lots = await db.ProductionCloses.AsNoTracking().Where(c => closeIds.Contains(c.Id))
            .SelectMany(c => c.Lines.SelectMany(l => l.Lots.Select(x => new TraceCloseLot(c.Id, l.Id, x.LotId, x.Quantity))))
            .ToListAsync(ct);
        return new TraceCloseDetails(closes, lines, lots);
    }

    public async Task<IReadOnlyList<TraceOrder>> OrdersAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct) =>
        await (from o in db.ProductionOrders.AsNoTracking()
               join r in db.Recipes on o.RecipeId equals r.Id
               join f in db.Locations on r.FactoryId equals f.Id into factories
               from f in factories.DefaultIfEmpty()
               where orderIds.Contains(o.Id)
               select new TraceOrder(o.Id, o.Folio, o.OutputItemId, o.PlannedQty, o.ProducedQty, o.Status, o.ScheduledDate, o.Shift,
                   f == null ? null : f.Name, r.VersionNumber, o.Source, o.TotalCost, o.UnitCost, o.ShortfallReason, o.CreatedAt, o.CreatedBy,
                   o.ReleasedAt, o.ReleasedBy, o.CompletedAt, o.CompletedBy, o.CancelledAt))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TraceDemand>> DemandsAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct)
    {
        var branch = await (from d in db.ProductionOrderDemands.AsNoTracking()
                            where orderIds.Contains(d.ProductionOrderId) && d.DemandType == DemandType.BranchOrderLine
                            from o in db.BranchOrders
                            from l in o.Lines
                            where l.Id == d.DemandLineId
                            join b in db.Locations on o.RequestingLocationId equals b.Id
                            select new TraceDemand(d.ProductionOrderId, d.DemandType, o.Folio, b.Name, d.Quantity))
            .ToListAsync(ct);
        var customer = await (from d in db.ProductionOrderDemands.AsNoTracking()
                              where orderIds.Contains(d.ProductionOrderId) && d.DemandType == DemandType.CustomerOrderLine
                              from o in db.CustomerOrders
                              from l in o.Lines
                              where l.Id == d.DemandLineId
                              join c in db.Customers on o.CustomerId equals c.Id
                              select new TraceDemand(d.ProductionOrderId, d.DemandType, o.Folio, c.Name, d.Quantity))
            .ToListAsync(ct);
        return [.. branch, .. customer];
    }

    public async Task<IReadOnlyList<TraceReceiptLine>> ReceiptLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await (from r in db.GoodsReceipts.AsNoTracking()
               from l in r.Lines
               where l.LotId != null && lotIds.Contains(l.LotId.Value)
               join o in db.PurchaseOrders on r.PurchaseOrderId equals o.Id
               from ol in o.Lines
               where ol.Id == l.PurchaseOrderLineId
               join s in db.Suppliers on o.SupplierId equals s.Id
               select new TraceReceiptLine(r.Id, r.Folio, r.ReceivedAt, r.SupplierInvoiceNumber, l.LocationId, l.LotId!.Value, l.ItemId,
                   l.Quantity, l.BaseQuantity, l.UnitCostBase, o.Id, o.Folio, o.CreatedAt, o.Status, o.Subtotal, ol.UnitPrice, s.Id, s.Name,
                   s.TaxId, s.PaymentTermsDays))
            .ToListAsync(ct);

    /// <summary>Lots an adjustment entry or a physical count created: those documents have no supplier (RN-101).</summary>
    public async Task<IReadOnlyList<TraceOrigin>> OriginsAsync(IReadOnlyCollection<TraceLot> lots, CancellationToken ct)
    {
        var fromAdjustments = lots.Where(l => l.CreatedFromDocType == InventoryAdjustment.DocType).ToList();
        var fromCounts = lots.Where(l => l.CreatedFromDocType == PhysicalCount.DocType).ToList();
        var origins = new List<TraceOrigin>();
        if (fromAdjustments.Count > 0)
        {
            var docIds = fromAdjustments.Select(l => l.CreatedFromDocId).Distinct().ToList();
            var lotIds = fromAdjustments.Select(l => l.Id).ToList();
            origins.AddRange(await (from a in db.InventoryAdjustments.AsNoTracking()
                                    from l in a.Lines
                                    where docIds.Contains(a.Id) && l.LotId != null && lotIds.Contains(l.LotId.Value) && l.Quantity > 0
                                    select new TraceOrigin(l.LotId!.Value, InventoryAdjustment.DocType, a.Id, a.Folio, a.CreatedAt, a.LocationId, l.Quantity))
                .ToListAsync(ct));
        }
        if (fromCounts.Count > 0)
        {
            // A count creates a lot through its adjustment movement: the movement gives the quantity.
            var lotIds = fromCounts.Select(l => l.Id).ToList();
            origins.AddRange(await db.InventoryMovements.AsNoTracking()
                .Where(m => m.LotId != null && lotIds.Contains(m.LotId.Value) && m.SourceDocType == PhysicalCount.DocType && m.Quantity > 0)
                .Select(m => new TraceOrigin(m.LotId!.Value, PhysicalCount.DocType, m.SourceDocId, m.SourceDocFolio, m.OccurredAt, m.LocationId, m.Quantity))
                .ToListAsync(ct));
        }
        return origins;
    }

    public async Task<IReadOnlyList<TraceTransferLine>> TransferLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct)
    {
        var lines = await (from t in db.Transfers.AsNoTracking()
                           from l in t.Lines
                           where t.Kind == TransferKind.Standard && l.LotId != null && lotIds.Contains(l.LotId.Value)
                                 && (t.Status == TransferStatus.Dispatched || t.Status == TransferStatus.Received
                                     || t.Status == TransferStatus.ReceivedWithDiscrepancies)
                           join o in db.BranchOrders on t.BranchOrderId equals o.Id into orders
                           from o in orders.DefaultIfEmpty()
                           select new
                           {
                               t.Id, t.Folio, LineId = l.Id, t.FromLocationId, t.ToLocationId, l.FromStockLocationId, l.ToStockLocationId,
                               LotId = l.LotId!.Value, l.ItemId, l.ShippedQty, l.ReceivedQty, l.DiscrepancyReason, l.DiscrepancyNotes, t.Status,
                               l.RejectedQty, l.RejectionDisposition,
                               t.DispatchedAt, t.ReceivedAt, t.VehicleDescription, t.DriverName, OrderId = o == null ? (Guid?)null : o.Id,
                               OrderFolio = o == null ? null : o.Folio, ApprovedAt = o == null ? null : o.ApprovedAt,
                           })
            .ToListAsync(ct);
        // What the branch asked for and was approved of the item, on the order the transfer serves.
        var orderIds = lines.Where(l => l.OrderId is not null).Select(l => l.OrderId!.Value).Distinct().ToList();
        var ordered = await db.BranchOrders.AsNoTracking().Where(o => orderIds.Contains(o.Id))
            .SelectMany(o => o.Lines.Select(l => new { OrderId = o.Id, l.ItemId, l.RequestedQty, l.ApprovedQty }))
            .ToListAsync(ct);
        return [.. lines.Select(l =>
        {
            var line = l.OrderId is { } orderId ? ordered.Where(x => x.OrderId == orderId && x.ItemId == l.ItemId).ToList() : [];
            return new TraceTransferLine(l.Id, l.Folio, l.LineId, l.FromStockLocationId ?? l.FromLocationId, l.ToStockLocationId ?? l.ToLocationId,
                l.LotId, l.ItemId, l.ShippedQty, l.ReceivedQty, l.DiscrepancyReason, l.DiscrepancyNotes, l.Status, l.DispatchedAt, l.ReceivedAt,
                l.VehicleDescription, l.DriverName, l.OrderFolio, l.ApprovedAt,
                line.Count == 0 ? null : line.Sum(x => x.RequestedQty), line.Count == 0 ? null : line.Sum(x => x.ApprovedQty ?? 0),
                l.RejectedQty, l.RejectionDisposition);
        })];
    }

    public async Task<IReadOnlyList<TraceShipmentLot>> ShipmentLotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct)
    {
        var lots = await (from s in db.CustomerShipments.AsNoTracking()
                          from l in s.Lines
                          from x in l.Lots
                          where lotIds.Contains(x.LotId) && (s.Status == CustomerShipmentStatus.Dispatched || s.Status == CustomerShipmentStatus.Delivered
                                                             || s.Status == CustomerShipmentStatus.DeliveredWithDiscrepancies)
                          join o in db.CustomerOrders on s.CustomerOrderId equals o.Id
                          join c in db.Customers on s.CustomerId equals c.Id
                          select new TraceShipmentLot(s.Id, s.Folio, o.Folio, c.Id, c.Code, c.Name, s.FromLocationId, l.LocationId ?? s.FromLocationId,
                              s.DispatchedAt, s.Status, s.VehicleDescription, s.DriverName, x.LotId, l.ItemId, x.Quantity, s.DeliveredAt))
            .ToListAsync(ct);
        var shipmentIds = lots.Where(l => l.Status != CustomerShipmentStatus.Dispatched).Select(l => l.ShipmentId).Distinct().ToList();
        if (shipmentIds.Count == 0)
            return lots;

        // RN-114: what the customer rejected of each lot, where it returned and with which CustomerReturn adjustment.
        var rejections = await (from shipment in db.CustomerShipments.AsNoTracking()
                                from r in shipment.Rejections
                                where shipmentIds.Contains(r.ShipmentId) && r.LotId != null
                                join loc in db.Locations on r.ReturnLocationId equals loc.Id into locs
                                from loc in locs.DefaultIfEmpty()
                                join a in db.InventoryAdjustments on r.ReturnAdjustmentId equals a.Id into adjs
                                from a in adjs.DefaultIfEmpty()
                                select new { r.ShipmentId, LotId = r.LotId!.Value, r.Quantity, r.Disposition, Location = loc == null ? null : loc.Code,
                                    Folio = a == null ? null : a.Folio })
            .ToListAsync(ct);
        static string? Join(IEnumerable<string?> values) =>
            string.Join(", ", values.OfType<string>().Distinct().Order()) is { Length: > 0 } text ? text : null;
        return lots.Select(l =>
        {
            var own = rejections.Where(r => r.ShipmentId == l.ShipmentId && r.LotId == l.LotId).ToList();
            var returned = own.Where(r => r.Disposition == RejectionDisposition.Return).ToList();
            return own.Count == 0 ? l : l with
            {
                ReturnedQty = returned.Sum(r => r.Quantity),
                LostQty = own.Where(r => r.Disposition == RejectionDisposition.Loss).Sum(r => r.Quantity),
                ReturnLocationCodes = Join(returned.Select(r => r.Location)),
                ReturnFolios = Join(returned.Select(r => r.Folio)),
            };
        }).ToList();
    }

    public async Task<IReadOnlyList<TraceMovement>> MovementsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await db.InventoryMovements.AsNoTracking()
            .Where(m => m.LotId != null && lotIds.Contains(m.LotId.Value) && m.SourceDocType != Transfer.InternalDocType)
            .Select(m => new TraceMovement(m.Sequence, m.LotId!.Value, m.LocationId, m.Type, m.Quantity, m.OccurredAt, m.SourceDocType, m.SourceDocFolio))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<TraceBalance>> BalancesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct) =>
        await db.StockBalances.AsNoTracking()
            .Where(b => b.LotId != null && lotIds.Contains(b.LotId.Value) && b.Quantity != 0)
            .Select(b => new TraceBalance(b.LotId!.Value, b.LocationId, b.Quantity))
            .ToListAsync(ct);

    public async Task<IReadOnlyDictionary<Guid, string>> UserNamesAsync(IReadOnlyCollection<Guid> userIds, CancellationToken ct)
    {
        var names = await userDirectory.GetNamesAsync(userIds.Select(id => (Guid?)id), ct);
        return userIds.Select(id => (id, name: names.Of(id))).Where(x => x.name is not null).ToDictionary(x => x.id, x => x.name!);
    }
}
