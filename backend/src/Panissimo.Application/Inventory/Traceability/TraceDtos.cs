using FluentValidation;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Purchasing;
using Panissimo.Domain.Sales;

namespace Panissimo.Application.Inventory.Traceability;

/// <summary>Entry point of a traceability query (RN-100).</summary>
public enum TraceSourceType
{
    Lot,
    PurchaseOrder,
    ProductionOrder,
    Transfer,
    CustomerShipment,
}

public enum TraceDirection
{
    Backward,
    Forward,
    Both,
}

public enum TraceNodeType
{
    Supplier,
    PurchaseReceipt,
    /// <summary>Origin of a lot without a supplier: an adjustment entry (initial stock included) or a physical count.</summary>
    InitialStock,
    Lot,
    ProductionClose,
    Stock,
    Transfer,
    CustomerShipment,
    Customer,

    /// <summary>RN-114: what the customer rejected on delivery: returned to the plant or lost.</summary>
    Rejection,
}

public enum TraceEdgeKind
{
    Supplied,
    Received,
    Created,
    Entered,
    Consumed,
    Produced,
    Dispatched,
    Delivered,
    Shipped,

    /// <summary>RN-114: from a shipment to what its customer rejected.</summary>
    Rejected,
}

public sealed record TraceQuery
{
    public TraceSourceType SourceType { get; init; }
    public Guid SourceId { get; init; }

    /// <summary>Default by entry point (RN-100).</summary>
    public TraceDirection? Direction { get; init; }

    /// <summary>Levels of lot → close → lot (RN-103): 10 by default, 20 at most.</summary>
    public int MaxDepth { get; init; } = TraceGraphBuilder.DefaultMaxDepth;
}

public sealed class TraceQueryValidator : AbstractValidator<TraceQuery>
{
    public TraceQueryValidator()
    {
        RuleFor(x => x.SourceType).IsInEnum().WithName("Tipo de entrada");
        RuleFor(x => x.SourceId).NotEmpty().WithName("Entrada");
        RuleFor(x => x.Direction).IsInEnum().WithName("Dirección");
        RuleFor(x => x.MaxDepth).InclusiveBetween(1, TraceGraphBuilder.MaxMaxDepth).WithName("Profundidad");
    }
}

public sealed record TraceSourceDto(TraceSourceType Type, Guid Id, string Label);

public sealed record TraceQtyDto(Guid ItemId, string Sku, string ItemName, decimal Qty, string BaseUom);

public sealed record TraceCloseLineDto(
    Guid ItemId, string Sku, string ItemName, Guid? LotId, string? LotNumber, decimal TheoreticalQty, decimal ActualQty,
    decimal? UnitCost, string BaseUom);

public sealed record TraceStockMovementDto(DateTimeOffset At, MovementType Type, string Folio, decimal Quantity, decimal Balance);

/// <param name="RejectedQty">RN-116: what the branch refused of the lot; it returned or was lost (<c>RejectionDisposition</c>).</param>
public sealed record TraceTransferLineDto(
    Guid? LotId, string? LotNumber, decimal ShippedQty, decimal? ReceivedQty, DiscrepancyReason? DiscrepancyReason,
    string? DiscrepancyNotes, decimal RejectedQty = 0, RejectionDisposition? RejectionDisposition = null);

/// <summary>
/// A node of the traceability graph (trazabilidad §5.3 and trazabilidad-ui §8). The fields of each <see cref="Type"/> are
/// filled; the rest stay null. Costs and prices are null without production.view or purchasing.view.
/// </summary>
public sealed record TraceNodeDto
{
    public required string Id { get; init; }
    public required TraceNodeType Type { get; init; }
    public required string Label { get; init; }

    // Item of the node (lot, receipt, stock, close output).
    public Guid? ItemId { get; init; }
    public string? Sku { get; init; }
    public string? ItemName { get; init; }
    public ItemType? ItemType { get; init; }
    public string? BaseUom { get; init; }

    // Supplier
    public Guid? SupplierId { get; init; }
    public string? TaxId { get; init; }
    public int? PaymentTermsDays { get; init; }

    // PurchaseReceipt
    public Guid? PurchaseOrderId { get; init; }
    public string? PurchaseOrderFolio { get; init; }
    public DateOnly? PurchaseOrderDate { get; init; }
    public PurchaseOrderStatus? PurchaseOrderStatus { get; init; }
    public decimal? PurchaseOrderSubtotal { get; init; }
    public Guid? ReceiptId { get; init; }
    public string? ReceiptFolio { get; init; }
    public DateTimeOffset? ReceivedAt { get; init; }
    public decimal? PurchaseQty { get; init; }
    public string? PurchaseUom { get; init; }
    public decimal? BaseQty { get; init; }
    public string? SupplierInvoiceNumber { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? UnitCostBase { get; init; }

    // InitialStock (an adjustment or a physical count that created the lot)
    public string? DocType { get; init; }
    public Guid? DocId { get; init; }
    public DateTimeOffset? PostedAt { get; init; }

    // Lot
    public Guid? LotId { get; init; }
    public string? LotNumber { get; init; }
    public DateOnly? ExpirationDate { get; init; }
    public DateTimeOffset? CreatedAt { get; init; }
    /// <summary>Lots produced: their unit cost (production.view).</summary>
    public decimal? UnitCost { get; init; }

    // ProductionClose (Folio and ProducedQty shared with other documents)
    public Guid? CloseId { get; init; }
    public string? Folio { get; init; }
    public ProductionCloseKind? Kind { get; init; }
    public int? Sequence { get; init; }
    public Guid? ProductionOrderId { get; init; }
    public DateTimeOffset? ClosedAt { get; init; }
    public DateOnly? BusinessDate { get; init; }
    public Shift? Shift { get; init; }
    public decimal? ProducedQty { get; init; }
    public decimal? TotalCost { get; init; }
    public decimal? WasteCost { get; init; }
    public string? ClosedByName { get; init; }
    /// <summary>RN-104: components without lot control, with their quantity.</summary>
    public IReadOnlyList<TraceQtyDto>? UnlottedConsumption { get; init; }
    public IReadOnlyList<TraceCloseLineDto>? Lines { get; init; }

    // Stock of a lot in a plant or branch (with its sub-warehouses), RN-106
    public Guid? LocationId { get; init; }
    public string? LocationCode { get; init; }
    public string? LocationName { get; init; }
    public LocationType? LocationType { get; init; }
    public decimal? InQty { get; init; }
    public IReadOnlyDictionary<string, decimal>? OutByType { get; init; }
    public decimal? OnHandQty { get; init; }
    public IReadOnlyList<TraceStockMovementDto>? Movements { get; init; }
    public bool? MovementsTruncated { get; init; }

    // Transfer
    public Guid? TransferId { get; init; }
    public string? BranchOrderFolio { get; init; }
    public string? FromLocationCode { get; init; }
    public string? ToLocationCode { get; init; }
    public TransferStatus? TransferStatus { get; init; }
    public DateTimeOffset? DispatchedAt { get; init; }
    public DateTimeOffset? DeliveredAt { get; init; }
    public string? VehicleDescription { get; init; }
    public string? DriverName { get; init; }
    public decimal? RequestedQty { get; init; }
    public decimal? ApprovedQty { get; init; }
    public DateTimeOffset? ApprovedAt { get; init; }
    public IReadOnlyList<TraceTransferLineDto>? TransferLines { get; init; }

    // CustomerShipment and Customer
    public Guid? ShipmentId { get; init; }
    public string? CustomerOrderFolio { get; init; }
    public CustomerShipmentStatus? ShipmentStatus { get; init; }
    public Guid? CustomerId { get; init; }
    public string? CustomerCode { get; init; }
    public string? CustomerName { get; init; }

    // Rejection (RN-114, RN-116): returned (its locations and, for a customer, the CustomerReturn adjustments) or lost.
    // A rejection on a transfer's receipt carries TransferId instead of ShipmentId.
    public decimal? ReturnedQty { get; init; }
    public decimal? LostQty { get; init; }
    public string? ReturnLocationCodes { get; init; }
    public string? ReturnFolios { get; init; }
}

/// <param name="ShippedQty">On a delivery: what left; <c>Qty</c> is what arrived (RN-107).</param>
public sealed record TraceEdgeDto(
    string From, string To, TraceEdgeKind Kind, decimal? Qty, string? BaseUom, DateTimeOffset? At, decimal? ShippedQty = null,
    DiscrepancyReason? DiscrepancyReason = null);

public sealed record TraceStatusDto(ProductionOrderStatus Status, DateTimeOffset At, string? ByName);

public sealed record TraceDemandDto(DemandType Type, string Folio, string PartyName, decimal Quantity);

/// <summary>A production order and the closes of it the graph reached.</summary>
public sealed record TraceGroupDto(
    string Id, Guid ProductionOrderId, string Folio, Guid ItemId, string Sku, string ItemName, decimal PlannedQty, decimal ProducedQty,
    string BaseUom, ProductionOrderStatus Status, DateOnly ScheduledDate, Shift? Shift, string? AreaName, string RecipeName,
    int RecipeVersion, ProductionOrderSource Source, decimal? TotalCost, decimal? UnitCost, ShortfallReason? ShortfallReason,
    IReadOnlyList<TraceStatusDto> StatusHistory, IReadOnlyList<TraceDemandDto> Demands, IReadOnlyList<string> NodeIds);

/// <summary>A step of the chain in time (Bitácora tab).</summary>
public sealed record TraceEventDto(
    DateTimeOffset At, string DocType, Guid DocId, string Folio, string Description, string? Sku, string? LotNumber, decimal? Qty,
    string? BaseUom, string? LocationCode);

public sealed record TraceOriginDto(
    string? SupplierName, string? PurchaseOrderFolio, string? ReceiptFolio, string? DocFolio, Guid LotId, string LotNumber, string Sku,
    decimal ConsumedQty, string BaseUom);

public sealed record TraceFinishedLotDto(Guid LotId, string LotNumber, string Sku, string ItemName, decimal ProducedQty, string BaseUom,
    DateOnly? ExpirationDate);

/// <summary>RN-108 by location: what the finished lots did there.</summary>
public sealed record TraceLocationSummaryDto(
    Guid LocationId, string LocationCode, string LocationName, LocationType LocationType, decimal ReceivedQty, decimal ConsumedQty,
    decimal WasteQty, decimal OnHandQty, string BaseUom);

public sealed record TraceCustomerSummaryDto(Guid CustomerId, string CustomerName, decimal ShippedQty, string BaseUom,
    IReadOnlyList<string> ShipmentFolios);

public sealed record TraceSummaryDto(
    IReadOnlyList<TraceOriginDto> Origins, IReadOnlyList<TraceFinishedLotDto> FinishedLots,
    IReadOnlyList<TraceLocationSummaryDto> Locations, IReadOnlyList<TraceCustomerSummaryDto> Customers, decimal InTransitLossQty);

public static class TraceWarnings
{
    public const string NoLots = "no_lots";
    public const string Truncated = "truncated";
    public const string UnlottedComponents = "unlotted_components";
    public const string MissingReceiptLink = "missing_receipt_link";
}

public sealed record TraceGraphDto(
    TraceSourceDto Source, TraceDirection Direction, DateTimeOffset AsOf, bool Truncated, IReadOnlyList<string> UnexpandedNodeIds,
    IReadOnlyList<string> Warnings, IReadOnlyList<TraceNodeDto> Nodes, IReadOnlyList<TraceEdgeDto> Edges,
    IReadOnlyList<TraceGroupDto> Groups, IReadOnlyList<TraceEventDto> Events, TraceSummaryDto Summary);

public sealed record TraceLotLookupDto(Guid LotId, string LotNumber, Guid ItemId, string Sku, string ItemName, DateOnly? ExpirationDate);

public sealed record TraceLotLookupQuery
{
    public string? Q { get; init; }
    public Guid? ItemId { get; init; }
    public int Limit { get; init; } = 20;
}
