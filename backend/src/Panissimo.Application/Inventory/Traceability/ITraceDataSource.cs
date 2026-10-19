using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Inventory.Traceability;

public sealed record TraceLot(Guid Id, Guid ItemId, string LotNumber, DateOnly? ExpirationDate, string CreatedFromDocType,
    Guid CreatedFromDocId, DateTimeOffset CreatedAt);

public sealed record TraceItem(Guid Id, string Sku, string Name, ItemType Type, string BaseUom, string PurchaseUom, bool TracksLots);

public sealed record TraceLocation(Guid Id, string Code, string Name, LocationType Type, Guid? ParentId)
{
    /// <summary>The plant or branch a sub-warehouse belongs to (stock is shown per plant or branch).</summary>
    public Guid RootId => Type is LocationType.Warehouse or LocationType.Factory && ParentId is { } parent ? parent : Id;
}

public sealed record TraceClose(Guid Id, string Folio, Guid ProductionOrderId, int Sequence, ProductionCloseKind Kind, DateOnly BusinessDate,
    Shift? Shift, DateTimeOffset ClosedAt, Guid? ClosedBy, decimal ProducedQty, Guid? OutputLotId, Guid OutputLocationId,
    decimal TotalCost, decimal UnitCost);

public sealed record TraceCloseLine(Guid CloseId, Guid LineId, Guid ComponentItemId, Guid LocationId, decimal TheoreticalQty,
    decimal ActualQty, decimal UnitCost, decimal WasteQty);

public sealed record TraceCloseLot(Guid CloseId, Guid LineId, Guid LotId, decimal Qty);

/// <summary>Everything a set of closes needs: the closes, their lines and the lots of their lines.</summary>
public sealed record TraceCloseDetails(IReadOnlyList<TraceClose> Closes, IReadOnlyList<TraceCloseLine> Lines, IReadOnlyList<TraceCloseLot> Lots);

public sealed record TraceOrder(Guid Id, string Folio, Guid OutputItemId, decimal PlannedQty, decimal ProducedQty, ProductionOrderStatus Status,
    DateOnly ScheduledDate, Shift? Shift, string? AreaName, int RecipeVersion, ProductionOrderSource Source, decimal TotalCost,
    decimal UnitCost, ShortfallReason? ShortfallReason, DateTimeOffset CreatedAt, Guid? CreatedBy, DateTimeOffset? ReleasedAt,
    Guid? ReleasedBy, DateTimeOffset? CompletedAt, Guid? CompletedBy, DateTimeOffset? CancelledAt);

public sealed record TraceDemand(Guid ProductionOrderId, DemandType Type, string Folio, string PartyName, decimal Quantity);

public sealed record TraceReceiptLine(Guid ReceiptId, string ReceiptFolio, DateTimeOffset ReceivedAt, string? SupplierInvoiceNumber,
    Guid LocationId, Guid LotId, Guid ItemId, decimal Quantity, decimal BaseQuantity, decimal UnitCostBase, Guid PurchaseOrderId,
    string PurchaseOrderFolio, DateTimeOffset PurchaseOrderCreatedAt, PurchaseOrderStatus PurchaseOrderStatus, decimal PurchaseOrderSubtotal,
    decimal UnitPrice, Guid SupplierId, string SupplierName, string SupplierTaxId, int PaymentTermsDays);

/// <summary>An adjustment entry or a physical count that created a lot (no supplier, RN-101).</summary>
public sealed record TraceOrigin(Guid LotId, string DocType, Guid DocId, string Folio, DateTimeOffset At, Guid LocationId, decimal Qty);

public sealed record TraceTransferLine(Guid TransferId, string Folio, Guid LineId, Guid FromLocationId, Guid ToLocationId, Guid LotId,
    Guid ItemId, decimal ShippedQty, decimal? ReceivedQty, DiscrepancyReason? DiscrepancyReason, string? DiscrepancyNotes,
    TransferStatus Status, DateTimeOffset? DispatchedAt, DateTimeOffset? ReceivedAt, string? VehicleDescription, string? DriverName,
    string? BranchOrderFolio, DateTimeOffset? ApprovedAt, decimal? RequestedQty, decimal? ApprovedQty);

public sealed record TraceShipmentLot(Guid ShipmentId, string Folio, string CustomerOrderFolio, Guid CustomerId, string CustomerCode,
    string CustomerName, Guid FromLocationId, Guid LineLocationId, DateTimeOffset? DispatchedAt, CustomerShipmentStatus Status,
    string? VehicleDescription, string? DriverName, Guid LotId, Guid ItemId, decimal Qty);

public sealed record TraceMovement(long Sequence, Guid LotId, Guid LocationId, MovementType Type, decimal Quantity, DateTimeOffset At,
    string SourceDocType, string Folio);

public sealed record TraceBalance(Guid LotId, Guid LocationId, decimal Quantity);

/// <summary>
/// The links of the traceability chain, read in batches: one query per link type and level (`lot_id = ANY(...)`), never
/// one per node (trazabilidad §5.1). <see cref="TraceGraphBuilder"/> assembles the graph in memory.
/// </summary>
public interface ITraceDataSource
{
    Task<IReadOnlyList<TraceLot>> LotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);
    Task<IReadOnlyList<TraceItem>> ItemsAsync(IReadOnlyCollection<Guid> itemIds, CancellationToken ct);
    Task<IReadOnlyList<TraceLocation>> LocationsAsync(CancellationToken ct);

    /// <summary>Closes whose output lot is one of these (backward).</summary>
    Task<IReadOnlyList<Guid>> ClosesProducingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);

    /// <summary>Closes that consumed one of these lots (forward).</summary>
    Task<IReadOnlyList<Guid>> ClosesConsumingAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);

    Task<TraceCloseDetails> CloseDetailsAsync(IReadOnlyCollection<Guid> closeIds, CancellationToken ct);
    Task<IReadOnlyList<TraceOrder>> OrdersAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct);
    Task<IReadOnlyList<TraceDemand>> DemandsAsync(IReadOnlyCollection<Guid> orderIds, CancellationToken ct);
    Task<IReadOnlyList<TraceReceiptLine>> ReceiptLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);
    Task<IReadOnlyList<TraceOrigin>> OriginsAsync(IReadOnlyCollection<TraceLot> lots, CancellationToken ct);

    /// <summary>Lines of dispatched transfers (not internal vouchers) with these lots.</summary>
    Task<IReadOnlyList<TraceTransferLine>> TransferLinesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);

    /// <summary>Lots of dispatched customer shipments.</summary>
    Task<IReadOnlyList<TraceShipmentLot>> ShipmentLotsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);

    /// <summary>Kardex of these lots, without the internal vouchers (they stay inside a plant or branch).</summary>
    Task<IReadOnlyList<TraceMovement>> MovementsAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);
    Task<IReadOnlyList<TraceBalance>> BalancesAsync(IReadOnlyCollection<Guid> lotIds, CancellationToken ct);
    Task<IReadOnlyDictionary<Guid, string>> UserNamesAsync(IReadOnlyCollection<Guid> userIds, CancellationToken ct);
}
