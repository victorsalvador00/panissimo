namespace Sgo.Domain.Common;

/// <summary>Document types that receive a sequential folio.</summary>
public enum DocType
{
    PurchaseOrder,
    Requisition,
    GoodsReceipt,
    Transfer,
    BranchOrder,
    ProductionOrder,
    Adjustment,
    PhysicalCount,
    Consumption,
}
