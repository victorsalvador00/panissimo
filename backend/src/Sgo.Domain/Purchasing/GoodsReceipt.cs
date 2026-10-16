using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Purchasing;

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="UnitPrice">PO line price per purchase unit, without VAT.</param>
/// <param name="PurchaseToBaseFactor">Base units per purchase unit.</param>
/// <param name="LotId">Required when the item tracks lots.</param>
public sealed record GoodsReceiptLineInput(
    Guid PurchaseOrderLineId, Guid ItemId, decimal Quantity, decimal UnitPrice, decimal PurchaseToBaseFactor,
    Guid? LotId, string? LotNumber, DateOnly? ExpirationDate);

/// <summary>
/// Goods receipt of a purchase order (dominio §4.6). Immutable once created: it records the PurchaseReceipt
/// movements at the delivery location, in base units at cost = UnitPrice / PurchaseToBaseFactor (RN-33).
/// </summary>
[Audited]
public class GoodsReceipt : AuditableEntity
{
    public const string DocType = "GoodsReceipt";

    private readonly List<GoodsReceiptLine> _lines = [];

    private GoodsReceipt() { }

    public GoodsReceipt(Guid id, string folio, Guid purchaseOrderId, Guid locationId, DateTimeOffset receivedAt, Guid? receivedBy,
        string? supplierInvoiceNumber, IReadOnlyList<GoodsReceiptLineInput> lines)
    {
        if (lines.Count == 0)
            throw new BusinessRuleException("goods_receipt_without_lines", "Captura al menos una línea recibida.");
        if (lines.Any(l => l.PurchaseToBaseFactor <= 0))
            throw new ArgumentException("The purchase-to-base factor must be positive.", nameof(lines));

        Id = id;
        Folio = folio;
        PurchaseOrderId = purchaseOrderId;
        LocationId = locationId;
        ReceivedAt = receivedAt;
        ReceivedBy = receivedBy;
        SupplierInvoiceNumber = string.IsNullOrWhiteSpace(supplierInvoiceNumber) ? null : supplierInvoiceNumber.Trim();
        _lines.AddRange(lines.Select(l => new GoodsReceiptLine(id, l)));
    }

    public string Folio { get; private set; } = null!;
    public Guid PurchaseOrderId { get; private set; }
    public Guid LocationId { get; private set; }
    public DateTimeOffset ReceivedAt { get; private set; }
    public Guid? ReceivedBy { get; private set; }
    public string? SupplierInvoiceNumber { get; private set; }
    public IReadOnlyList<GoodsReceiptLine> Lines => _lines;

    /// <summary>Value of the receipt without VAT.</summary>
    public decimal TotalCost => _lines.Sum(l => l.Amount);

    /// <summary>RN-33: PurchaseReceipt entries at the delivery location, in base units.</summary>
    public IReadOnlyList<MovementRequest> ToMovementRequests() =>
        _lines.Select(l => new MovementRequest(LocationId, l.ItemId, l.LotId, MovementType.PurchaseReceipt, l.BaseQuantity,
            l.UnitCostBase, DocType, Id, Folio, $"Recepción {Folio}")).ToList();
}

public class GoodsReceiptLine : Entity
{
    private GoodsReceiptLine() { }

    internal GoodsReceiptLine(Guid goodsReceiptId, GoodsReceiptLineInput input)
    {
        GoodsReceiptId = goodsReceiptId;
        PurchaseOrderLineId = input.PurchaseOrderLineId;
        ItemId = input.ItemId;
        Quantity = input.Quantity;
        BaseQuantity = InventoryMath.Round(input.Quantity * input.PurchaseToBaseFactor);
        UnitCostBase = InventoryMath.Round(input.UnitPrice / input.PurchaseToBaseFactor);
        LotId = input.LotId;
        LotNumber = input.LotNumber;
        ExpirationDate = input.ExpirationDate;
        Amount = Money.Round(input.Quantity * input.UnitPrice);
    }

    public Guid GoodsReceiptId { get; private set; }
    public Guid PurchaseOrderLineId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In the item's purchase unit.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>In the item's base unit.</summary>
    public decimal BaseQuantity { get; private set; }

    /// <summary>RN-33: UnitPrice / PurchaseToBaseFactor, without VAT.</summary>
    public decimal UnitCostBase { get; private set; }

    public Guid? LotId { get; private set; }
    public string? LotNumber { get; private set; }
    public DateOnly? ExpirationDate { get; private set; }

    /// <summary>Quantity × PO price, without VAT.</summary>
    public decimal Amount { get; private set; }
}
