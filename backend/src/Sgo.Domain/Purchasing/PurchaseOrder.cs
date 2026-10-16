using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Purchasing;

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

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="UnitPrice">Per purchase unit, MXN without VAT (RN-30: suggested from SupplierItem.Price).</param>
/// <param name="TaxRate">VAT as a fraction, e.g. 0.16.</param>
public sealed record PurchaseOrderLineInput(Guid ItemId, decimal Quantity, decimal UnitPrice, decimal TaxRate, Guid? RequisitionLineId);

/// <summary>Quantity received on a PO line in one receipt, in the item's purchase unit.</summary>
public sealed record LineReceipt(Guid LineId, decimal Quantity);

public static class Money
{
    /// <summary>Document amounts are stored with 2 decimals.</summary>
    public static decimal Round(decimal amount) => decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
}

/// <summary>
/// Purchase order (dominio §4.6): Draft → PendingApproval → Approved → PartiallyReceived → Received;
/// Rejected (final) from PendingApproval; Cancelled before anything is received; Closed from PartiallyReceived.
/// </summary>
[Audited]
public class PurchaseOrder : AuditableEntity, IVersioned
{
    private readonly List<PurchaseOrderLine> _lines = [];

    private PurchaseOrder() { }

    public PurchaseOrder(string folio, Guid supplierId, Guid deliveryLocationId, DateOnly? expectedDate, string? notes,
        IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        Folio = folio;
        SupplierId = supplierId;
        Status = PurchaseOrderStatus.Draft;
        SetContent(deliveryLocationId, expectedDate, notes, lines);
    }

    public string Folio { get; private set; } = null!;
    public Guid SupplierId { get; private set; }
    public Guid DeliveryLocationId { get; private set; }
    public DateOnly? ExpectedDate { get; private set; }
    public PurchaseOrderStatus Status { get; private set; }
    public string? Notes { get; private set; }

    /// <summary>Without VAT.</summary>
    public decimal Subtotal { get; private set; }

    public decimal TaxTotal { get; private set; }
    public decimal Total { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public Guid? SubmittedBy { get; private set; }

    /// <summary>Whether the subtotal reached the threshold when submitted (RN-31); otherwise it was approved automatically.</summary>
    public bool ApprovalRequired { get; private set; }

    public Guid? ApprovedBy { get; private set; }
    public DateTimeOffset? ApprovedAt { get; private set; }
    public DateTimeOffset? RejectedAt { get; private set; }
    public Guid? RejectedBy { get; private set; }
    public string? RejectionReason { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }
    public Guid? ClosedBy { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<PurchaseOrderLine> Lines => _lines;

    public bool HasReceipts => _lines.Any(l => l.ReceivedQty > 0);

    public void UpdateDraft(Guid deliveryLocationId, DateOnly? expectedDate, string? notes, IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        EnsureStatus("Solo una orden de compra en borrador puede editarse.", PurchaseOrderStatus.Draft);
        SetContent(deliveryLocationId, expectedDate, notes, lines);
    }

    /// <summary>RN-31: subtotal (without VAT) ≥ threshold needs approval; below it the order is approved directly.</summary>
    public void Submit(decimal approvalThreshold, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra en borrador puede enviarse.", PurchaseOrderStatus.Draft);
        SubmittedAt = now;
        SubmittedBy = userId;
        ApprovalRequired = Subtotal >= approvalThreshold;
        if (ApprovalRequired)
        {
            Status = PurchaseOrderStatus.PendingApproval;
        }
        else
        {
            Status = PurchaseOrderStatus.Approved;
            ApprovedAt = now;
            ApprovedBy = userId;
        }
    }

    public void Approve(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra pendiente de aprobación puede aprobarse.", PurchaseOrderStatus.PendingApproval);
        Status = PurchaseOrderStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
    }

    /// <summary>Final: to try again a new order is captured.</summary>
    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra pendiente de aprobación puede rechazarse.", PurchaseOrderStatus.PendingApproval);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("purchase_order_rejection_reason_required", "Indica el motivo del rechazo.");
        Status = PurchaseOrderStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    public void Cancel()
    {
        if (Status is not (PurchaseOrderStatus.Draft or PurchaseOrderStatus.PendingApproval or PurchaseOrderStatus.Approved) || HasReceipts)
            throw new BusinessRuleException("purchase_order_not_cancellable",
                "Solo se cancela una orden de compra en borrador, pendiente o aprobada, sin nada recibido. Si ya tiene recepciones, ciérrala.");
        Status = PurchaseOrderStatus.Cancelled;
    }

    /// <summary>RN-32: abandons the pending balance of a partially received order.</summary>
    public void Close(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una orden de compra parcialmente recibida puede cerrarse; si no tiene recepciones, cancélala.",
            PurchaseOrderStatus.PartiallyReceived);
        Status = PurchaseOrderStatus.Closed;
        ClosedAt = now;
        ClosedBy = userId;
    }

    /// <summary>
    /// RN-32/33: only Approved or PartiallyReceived orders are received; partial receipts are allowed and each line may
    /// exceed its quantity up to <paramref name="tolerancePct"/>. A line may appear several times (one per lot).
    /// The order becomes Received when every line is complete.
    /// </summary>
    public void Receive(IReadOnlyList<LineReceipt> receipts, decimal tolerancePct)
    {
        EnsureStatus("Solo se reciben órdenes de compra aprobadas o parcialmente recibidas (RN-33).",
            PurchaseOrderStatus.Approved, PurchaseOrderStatus.PartiallyReceived);
        if (receipts.Count == 0)
            throw new BusinessRuleException("goods_receipt_without_lines", "Captura al menos una línea recibida.");
        if (receipts.Any(r => r.Quantity <= 0 || InventoryMath.Round(r.Quantity) != r.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");

        foreach (var group in receipts.GroupBy(r => r.LineId))
        {
            var line = _lines.SingleOrDefault(l => l.Id == group.Key)
                       ?? throw new BusinessRuleException("purchase_order_line_not_found", "Una línea indicada no pertenece a la orden de compra.");
            line.Receive(group.Sum(r => r.Quantity), tolerancePct);
        }

        Status = _lines.All(l => l.IsComplete) ? PurchaseOrderStatus.Received : PurchaseOrderStatus.PartiallyReceived;
    }

    private void SetContent(Guid deliveryLocationId, DateOnly? expectedDate, string? notes, IReadOnlyList<PurchaseOrderLineInput> lines)
    {
        if (lines.Count == 0)
            throw new BusinessRuleException("purchase_order_without_lines", "La orden de compra debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.Any(l => l.UnitPrice < 0 || l.TaxRate < 0 || InventoryMath.Round(l.UnitPrice) != l.UnitPrice))
            throw new BusinessRuleException("purchase_order_invalid_price",
                "El precio y el IVA no pueden ser negativos; el precio admite máximo 4 decimales.");
        // Lines from different requisition lines may repeat an item (B-13); manual lines may not.
        if (lines.Where(l => l.RequisitionLineId is null).GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("purchase_order_line_duplicated", "Hay artículos repetidos en la orden de compra.");

        DeliveryLocationId = deliveryLocationId;
        ExpectedDate = expectedDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select(l => new PurchaseOrderLine(Id, l.ItemId, l.Quantity, l.UnitPrice, l.TaxRate, l.RequisitionLineId)));
        Subtotal = _lines.Sum(l => l.Subtotal);
        TaxTotal = _lines.Sum(l => l.TaxAmount);
        Total = Subtotal + TaxTotal;
    }

    private void EnsureStatus(string message, params PurchaseOrderStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("purchase_order_invalid_status", message);
    }
}

public class PurchaseOrderLine : Entity
{
    private PurchaseOrderLine() { }

    internal PurchaseOrderLine(Guid purchaseOrderId, Guid itemId, decimal quantity, decimal unitPrice, decimal taxRate, Guid? requisitionLineId)
    {
        PurchaseOrderId = purchaseOrderId;
        ItemId = itemId;
        Quantity = quantity;
        UnitPrice = unitPrice;
        TaxRate = taxRate;
        RequisitionLineId = requisitionLineId;
    }

    public Guid PurchaseOrderId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In the item's purchase unit.</summary>
    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }
    public decimal TaxRate { get; private set; }

    /// <summary>In the item's purchase unit.</summary>
    public decimal ReceivedQty { get; private set; }

    public Guid? RequisitionLineId { get; private set; }

    public decimal Subtotal => Money.Round(Quantity * UnitPrice);
    public decimal TaxAmount => Money.Round(Subtotal * TaxRate);
    public decimal PendingQty => Math.Max(0, Quantity - ReceivedQty);
    public bool IsComplete => ReceivedQty >= Quantity;

    /// <summary>RN-32: over-receipt allowed up to the tolerance (default 0%).</summary>
    internal void Receive(decimal quantity, decimal tolerancePct)
    {
        var max = InventoryMath.Round(Quantity * (1 + tolerancePct / 100m));
        if (ReceivedQty + quantity > max)
            throw new BusinessRuleException("goods_receipt_over_tolerance",
                $"Se recibiría {ReceivedQty + quantity:0.####} de {Quantity:0.####}; la tolerancia permite máximo {max:0.####}.");
        ReceivedQty += quantity;
    }
}

/// <summary>A purchase order to create from approved requisitions (RN-34).</summary>
public sealed record PurchaseOrderPlan(
    Guid SupplierId, Guid DeliveryLocationId, DateOnly ExpectedDate, IReadOnlyList<string> RequisitionFolios,
    IReadOnlyList<PurchaseOrderLineInput> Lines);

public static class RequisitionConversion
{
    /// <summary>
    /// RN-34: groups the lines of approved requisitions by suggested supplier and delivery location (one PO has a
    /// single delivery location). One PO line per requisition line, keeping the link; the expected date is the
    /// earliest NeededBy of the group. <paramref name="priceOf"/> gives the supplier's price for an item.
    /// </summary>
    public static IReadOnlyList<PurchaseOrderPlan> Plan(
        IReadOnlyList<PurchaseRequisition> requisitions,
        Func<Guid, Guid, decimal> priceOf,
        Func<Guid, decimal> taxRateOf)
    {
        if (requisitions.Count == 0)
            throw new BusinessRuleException("requisition_conversion_empty", "Selecciona al menos una requisición.");
        if (requisitions.FirstOrDefault(r => r.Status != RequisitionStatus.Approved) is { } notApproved)
            throw new BusinessRuleException("requisition_not_approved",
                $"La requisición {notApproved.Folio} no está aprobada; solo las aprobadas se convierten en OC.");

        return requisitions
            .SelectMany(r => r.Lines.Select(line => (Requisition: r, Line: line)))
            .GroupBy(x => (SupplierId: x.Line.SuggestedSupplierId
                                       ?? throw new InvalidOperationException("Approved requisition line without supplier."),
                           x.Requisition.LocationId))
            .OrderBy(g => g.Key.SupplierId).ThenBy(g => g.Key.LocationId)
            .Select(g => new PurchaseOrderPlan(
                g.Key.SupplierId,
                g.Key.LocationId,
                g.Min(x => x.Requisition.NeededBy),
                g.Select(x => x.Requisition.Folio).Distinct().Order().ToList(),
                g.Select(x => new PurchaseOrderLineInput(x.Line.ItemId, x.Line.Quantity, priceOf(g.Key.SupplierId, x.Line.ItemId),
                    taxRateOf(x.Line.ItemId), x.Line.Id)).ToList()))
            .ToList();
    }
}
