using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Domain.Purchasing;

/// <param name="Quantity">In purchase unit.</param>
/// <param name="BaseQuantity">Quantity × PurchaseToBaseFactor, rounded to 4 decimals (RN-03).</param>
/// <param name="UnitCostBase">UnitPrice / PurchaseToBaseFactor, without VAT (RN-33).</param>
/// <param name="LocationId">Stock location it enters: the plant, or the sub-warehouse chosen (RN-45).</param>
public sealed record GoodsReceiptLineInput(
    Guid PurchaseOrderLineId,
    Guid LocationId,
    Guid ItemId,
    decimal Quantity,
    decimal BaseQuantity,
    decimal UnitCostBase,
    Guid? LotId,
    string? LotNumber,
    DateOnly? ExpirationDate);

public static class PurchaseReceiptMath
{
    /// <summary>RN-03: base quantity of a purchase quantity.</summary>
    public static decimal BaseQuantity(decimal purchaseQty, decimal purchaseToBaseFactor) => InventoryMath.Round(purchaseQty * purchaseToBaseFactor);

    /// <summary>RN-33: cost per base unit of a purchase price, without VAT.</summary>
    public static decimal UnitCostBase(decimal unitPrice, decimal purchaseToBaseFactor) => InventoryMath.Round(unitPrice / purchaseToBaseFactor);
}

/// <summary>Goods received for a purchase order at the plant (dominio §4.7, RN-32, RN-33). Immutable once saved.</summary>
[Audited]
public class GoodsReceipt : AuditableEntity
{
    public const string DocType = "GoodsReceipt";
    public const int NotesMaxLength = 500;
    public const int InvoiceMaxLength = 50;

    private readonly List<GoodsReceiptLine> _lines = [];

    private GoodsReceipt() { }

    public GoodsReceipt(Guid id, string folio, Guid purchaseOrderId, Guid locationId, DateTimeOffset receivedAt, Guid? receivedBy,
        string? supplierInvoiceNumber, string? notes, IReadOnlyList<GoodsReceiptLineInput> lines)
    {
        if (lines.Count == 0)
            throw new BusinessRuleException("receipt_without_lines", "Captura al menos una cantidad recibida.");
        Id = id;
        Folio = folio;
        PurchaseOrderId = purchaseOrderId;
        LocationId = locationId;
        ReceivedAt = receivedAt;
        ReceivedBy = receivedBy;
        SupplierInvoiceNumber = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim();
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.AddRange(lines.Select(l => new GoodsReceiptLine(id, l)));
    }

    public string Folio { get; private set; } = null!;
    public Guid PurchaseOrderId { get; private set; }
    public Guid LocationId { get; private set; }
    public DateTimeOffset ReceivedAt { get; private set; }
    public Guid? ReceivedBy { get; private set; }
    public string? SupplierInvoiceNumber { get; private set; }
    public string? Notes { get; private set; }
    public IReadOnlyList<GoodsReceiptLine> Lines => _lines;

    /// <summary>Received value at cost, without VAT.</summary>
    public decimal TotalCost => _lines.Sum(l => InventoryMath.Round(l.BaseQuantity * l.UnitCostBase));
}

public class GoodsReceiptLine : Entity
{
    private GoodsReceiptLine() { }

    internal GoodsReceiptLine(Guid goodsReceiptId, GoodsReceiptLineInput input)
    {
        GoodsReceiptId = goodsReceiptId;
        PurchaseOrderLineId = input.PurchaseOrderLineId;
        LocationId = input.LocationId;
        ItemId = input.ItemId;
        Quantity = input.Quantity;
        BaseQuantity = input.BaseQuantity;
        UnitCostBase = input.UnitCostBase;
        LotId = input.LotId;
        LotNumber = input.LotNumber;
        ExpirationDate = input.ExpirationDate;
    }

    public Guid GoodsReceiptId { get; private set; }
    public Guid PurchaseOrderLineId { get; private set; }

    /// <summary>Where it entered: the plant or one of its sub-warehouses (RN-45).</summary>
    public Guid LocationId { get; private set; }

    public Guid ItemId { get; private set; }

    /// <summary>In purchase unit.</summary>
    public decimal Quantity { get; private set; }

    public decimal BaseQuantity { get; private set; }
    public decimal UnitCostBase { get; private set; }
    public Guid? LotId { get; private set; }
    public string? LotNumber { get; private set; }
    public DateOnly? ExpirationDate { get; private set; }
}
