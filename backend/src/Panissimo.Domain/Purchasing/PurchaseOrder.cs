using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

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

/// <summary>Quantity received for a PO line in one receipt (several entries per line when it comes in several lots).</summary>
public sealed record PurchaseReceiptQuantity(Guid LineId, decimal Quantity);

/// <summary>PO amounts are rounded to cents per line, and the header adds the rounded lines (backend §4).</summary>
public static class PurchaseOrderMath
{
    public static decimal Money(decimal value) => decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    public static decimal LineSubtotal(decimal quantity, decimal unitPrice) => Money(quantity * unitPrice);

    public static decimal LineTax(decimal quantity, decimal unitPrice, decimal taxRate) => Money(LineSubtotal(quantity, unitPrice) * taxRate);
}

/// <summary>
/// Purchase order (dominio §4.7): Draft → PendingApproval → Approved → PartiallyReceived → Received;
/// Rejected (final), Cancelled and Closed (RN-31, RN-32).
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
    public DateTimeOffset? SubmittedAt { get; private set; }
    public Guid? SubmittedBy { get; private set; }

    /// <summary>Null with <see cref="ApprovedAt"/> set: approved automatically below the threshold (RN-31).</summary>
    public Guid? ApprovedBy { get; private set; }

    public DateTimeOffset? ApprovedAt { get; private set; }
    public DateTimeOffset? RejectedAt { get; private set; }
    public Guid? RejectedBy { get; private set; }
    public string? RejectionReason { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }
    public Guid? ClosedBy { get; private set; }
    public string? CloseReason { get; private set; }
    public string? Notes { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<PurchaseOrderLine> Lines => _lines;

    /// <summary>RN-33: only approved or partially received orders are received.</summary>
    public bool IsReceivable => Status is PurchaseOrderStatus.Approved or PurchaseOrderStatus.PartiallyReceived;

    public bool HasReceipts => _lines.Any(l => l.ReceivedQty > 0);

    /// <summary>The supplier is fixed once saved; the plant, date, notes and lines change only in draft.</summary>
    public void UpdateDraft(Guid deliveryLocationId, DateOnly expectedDate, string? notes, IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        EnsureStatus("Solo una orden de compra en borrador puede editarse.", PurchaseOrderStatus.Draft);
        DeliveryLocationId = deliveryLocationId;
        ExpectedDate = expectedDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        SetLines(lines);
    }

    /// <summary>RN-31: Subtotal at or above the threshold waits for approval; below it the order is approved on sending.</summary>
    public void Submit(decimal approvalThreshold, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra en borrador puede enviarse.", PurchaseOrderStatus.Draft);
        SubmittedAt = now;
        SubmittedBy = userId;
        if (Subtotal >= approvalThreshold)
        {
            Status = PurchaseOrderStatus.PendingApproval;
        }
        else
        {
            Status = PurchaseOrderStatus.Approved;
            ApprovedAt = now;
        }
    }

    public void Approve(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra por aprobar puede aprobarse.", PurchaseOrderStatus.PendingApproval);
        Status = PurchaseOrderStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
    }

    /// <summary>RN-31: rejecting needs a reason and is final.</summary>
    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra por aprobar puede rechazarse.", PurchaseOrderStatus.PendingApproval);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("rejection_reason_required", "Indica el motivo del rechazo.");
        Status = PurchaseOrderStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    /// <summary>RN-32: in Draft, PendingApproval or Approved, with nothing received.</summary>
    public void Cancel()
    {
        EnsureStatus("Solo se cancela una orden de compra en borrador, por aprobar o aprobada sin recepciones.",
            PurchaseOrderStatus.Draft, PurchaseOrderStatus.PendingApproval, PurchaseOrderStatus.Approved);
        if (HasReceipts)
            throw new BusinessRuleException("invalid_purchase_order_status", "La orden de compra ya tiene recepciones: ciérrala con saldo.");
        Status = PurchaseOrderStatus.Cancelled;
    }

    /// <summary>RN-32: an order with a pending balance is closed by hand, only from PartiallyReceived, with a reason.</summary>
    public void Close(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo se cierra con saldo una orden de compra parcialmente recibida.", PurchaseOrderStatus.PartiallyReceived);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("close_reason_required", "Indica el motivo del cierre con saldo.");
        CloseReason = reason.Trim();
        Status = PurchaseOrderStatus.Closed;
        ClosedAt = now;
        ClosedBy = userId;
    }

    /// <summary>
    /// RN-32: adds a receipt to the lines. A line may come in several entries (lots); its total received may exceed
    /// the ordered quantity up to <paramref name="tolerancePct"/>. All lines complete: Received; otherwise PartiallyReceived.
    /// </summary>
    public void RegisterReceipt(IReadOnlyList<PurchaseReceiptQuantity> quantities, decimal tolerancePct)
    {
        if (!IsReceivable)
            throw new BusinessRuleException("purchase_order_not_receivable",
                "Solo se reciben órdenes de compra aprobadas o parcialmente recibidas (RN-33).");
        if (quantities.Count == 0)
            throw new BusinessRuleException("receipt_without_lines", "Captura al menos una cantidad recibida.");
        if (quantities.Any(q => q.Quantity <= 0 || InventoryMath.Round(q.Quantity) != q.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades recibidas deben ser mayores que cero, con máximo 4 decimales.");

        foreach (var group in quantities.GroupBy(q => q.LineId))
        {
            var line = _lines.SingleOrDefault(l => l.Id == group.Key)
                       ?? throw new BusinessRuleException("purchase_order_line_not_found", "Una línea indicada no pertenece a la orden de compra.");
            line.Receive(group.Sum(q => q.Quantity), tolerancePct);
        }

        Status = _lines.All(l => l.ReceivedQty >= l.Quantity) ? PurchaseOrderStatus.Received : PurchaseOrderStatus.PartiallyReceived;
    }

    private void EnsureStatus(string message, params PurchaseOrderStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("invalid_purchase_order_status", message);
    }

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

    /// <summary>Never negative: an over-receipt within tolerance leaves nothing pending.</summary>
    public decimal PendingQty => Math.Max(0, Quantity - ReceivedQty);

    /// <summary>RN-32: the most that may ever be received on this line.</summary>
    public decimal MaxReceivableQty(decimal tolerancePct) => InventoryMath.Round(Quantity * (1 + tolerancePct / 100));

    internal void Receive(decimal quantity, decimal tolerancePct)
    {
        var max = MaxReceivableQty(tolerancePct);
        if (ReceivedQty + quantity > max)
            throw new BusinessRuleException("receipt_over_tolerance",
                $"La línea {LineNumber} excede lo pedido: puedes recibir máximo {max - ReceivedQty:0.####} más " +
                $"(pedido {Quantity:0.####}, tolerancia {tolerancePct:0.##} %, RN-32).");
        ReceivedQty += quantity;
    }
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
