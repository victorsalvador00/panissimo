using Panissimo.Domain.Common;

namespace Panissimo.Domain.Purchasing;

public enum PurchaseOrderStatus
{
    Draft,
    PendingApproval,
    Approved,
    PartiallyReceived,
    Received,
    Rejected,
    Cancelled,
    Closed,
}

/// <param name="Quantity">In purchase unit.</param>
/// <param name="UnitPrice">Per purchase unit, without VAT.</param>
/// <param name="RequisitionLineId">The requisition line it came from (RN-34), if any.</param>
public sealed record PurchaseOrderLineInput(Guid ItemId, decimal Quantity, decimal UnitPrice, decimal TaxRate, Guid? RequisitionLineId);

/// <summary>PO amounts are rounded to cents per line, and the header adds the rounded lines (backend §4).</summary>
public static class PurchaseOrderMath
{
    public static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal LineSubtotal(decimal quantity, decimal unitPrice) => Money(quantity * unitPrice);

    public static decimal LineTax(decimal quantity, decimal unitPrice, decimal taxRate) => Money(LineSubtotal(quantity, unitPrice) * taxRate);
}

/// <summary>
/// Purchase order (dominio §4.7): Draft → PendingApproval → Approved → PartiallyReceived → Received;
/// Rejected, Cancelled and Closed. B-15 creates drafts from requisitions; B-16 adds editing, approval and receipts.
/// </summary>
[Audited]
public class PurchaseOrder : AuditableEntity, IVersioned
{
    public const string DocType = "PurchaseOrder";
    public const int NotesMaxLength = 500;

    private readonly List<PurchaseOrderLine> _lines = [];

    private PurchaseOrder() { }

    public PurchaseOrder(string folio, Guid supplierId, Guid deliveryLocationId, DateOnly expectedDate, string? notes,
        IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        Folio = folio;
        SupplierId = supplierId;
        DeliveryLocationId = deliveryLocationId;
        Status = PurchaseOrderStatus.Draft;
        ExpectedDate = expectedDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        SetLines(lines);
    }

    public string Folio { get; private set; } = null!;
    public Guid SupplierId { get; private set; }

    /// <summary>The plant (RN-33).</summary>
    public Guid DeliveryLocationId { get; private set; }

    public DateOnly ExpectedDate { get; private set; }
    public PurchaseOrderStatus Status { get; private set; }
    public decimal Subtotal { get; private set; }
    public decimal TaxTotal { get; private set; }
    public decimal Total { get; private set; }
    public Guid? ApprovedBy { get; private set; }
    public DateTimeOffset? ApprovedAt { get; private set; }
    public string? RejectionReason { get; private set; }
    public string? Notes { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<PurchaseOrderLine> Lines => _lines;

    private void SetLines(IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        if (lines.Count == 0)
            throw new BusinessRuleException("purchase_order_without_lines", "La orden de compra debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero.");
        if (lines.Any(l => l.UnitPrice < 0))
            throw new BusinessRuleException("invalid_price", "El precio no puede ser negativo.");

        _lines.Clear();
        _lines.AddRange(lines.Select((l, i) => new PurchaseOrderLine(Id, i + 1, l)));
        Subtotal = _lines.Sum(l => l.Subtotal);
        TaxTotal = _lines.Sum(l => l.TaxAmount);
        Total = Subtotal + TaxTotal;
    }
}

public class PurchaseOrderLine : Entity
{
    private PurchaseOrderLine() { }

    internal PurchaseOrderLine(Guid purchaseOrderId, int lineNumber, PurchaseOrderLineInput input)
    {
        PurchaseOrderId = purchaseOrderId;
        LineNumber = lineNumber;
        ItemId = input.ItemId;
        Quantity = input.Quantity;
        UnitPrice = input.UnitPrice;
        TaxRate = input.TaxRate;
        RequisitionLineId = input.RequisitionLineId;
        Subtotal = PurchaseOrderMath.LineSubtotal(Quantity, UnitPrice);
        TaxAmount = PurchaseOrderMath.LineTax(Quantity, UnitPrice, TaxRate);
    }

    public Guid PurchaseOrderId { get; private set; }
    public int LineNumber { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In purchase unit.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Per purchase unit, without VAT.</summary>
    public decimal UnitPrice { get; private set; }

    public decimal TaxRate { get; private set; }

    /// <summary>Rounded to cents.</summary>
    public decimal Subtotal { get; private set; }

    /// <summary>VAT of the line, rounded to cents.</summary>
    public decimal TaxAmount { get; private set; }

    /// <summary>In purchase unit (RN-32).</summary>
    public decimal ReceivedQty { get; private set; }

    public Guid? RequisitionLineId { get; private set; }
}

/// <summary>A purchase order to create from approved requisitions (RN-34).</summary>
public sealed record PurchaseOrderDraft(
    Guid SupplierId,
    Guid DeliveryLocationId,
    DateOnly ExpectedDate,
    IReadOnlyList<string> RequisitionFolios,
    IReadOnlyList<PurchaseOrderLineInput> Lines);

public static class RequisitionConversion
{
    /// <summary>
    /// RN-34: groups the lines by supplier + delivery location; one PO line per requisition line (keeps its id),
    /// catalog price, the item's VAT and the closest NeededBy as expected date. Requisitions are taken in folio order.
    /// </summary>
    /// <param name="prices">Catalog price per (supplier, item); every line must have one.</param>
    /// <param name="taxRates">VAT per item.</param>
    public static IReadOnlyList<PurchaseOrderDraft> Group(
        IEnumerable<PurchaseRequisition> requisitions,
        IReadOnlyDictionary<(Guid SupplierId, Guid ItemId), decimal> prices,
        IReadOnlyDictionary<Guid, decimal> taxRates)
    {
        var lines = from r in requisitions.OrderBy(r => r.Folio, StringComparer.Ordinal)
                    from l in r.Lines.OrderBy(l => l.LineNumber)
                    select (Requisition: r, Line: l, SupplierId: l.SuggestedSupplierId
                        ?? throw new InvalidOperationException($"Line {l.Id} of {r.Folio} has no supplier."));

        return lines
            .GroupBy(x => (x.SupplierId, x.Requisition.LocationId))
            .Select(g => new PurchaseOrderDraft(
                g.Key.SupplierId,
                g.Key.LocationId,
                g.Min(x => x.Requisition.NeededBy),
                g.Select(x => x.Requisition.Folio).Distinct().ToList(),
                g.Select(x => new PurchaseOrderLineInput(x.Line.ItemId, x.Line.Quantity, prices[(g.Key.SupplierId, x.Line.ItemId)],
                    taxRates[x.Line.ItemId], x.Line.Id)).ToList()))
            .ToList();
    }
}
