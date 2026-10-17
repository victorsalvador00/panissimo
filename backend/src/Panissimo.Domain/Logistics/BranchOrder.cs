using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Domain.Logistics;

public enum BranchOrderStatus
{
    Draft,
    Submitted,
    Approved,
    PartiallyFulfilled,
    Fulfilled,
    Rejected,
    Cancelled,
}

/// <param name="RequestedQty">In base unit (RN-20).</param>
public sealed record BranchOrderLineInput(Guid ItemId, decimal RequestedQty);

public sealed record BranchOrderApproval(Guid LineId, decimal ApprovedQty);

public static class BranchOrderRules
{
    /// <summary>RN-20 (D-05): branches order bulk finished goods and supplies; never packaged or semi-finished goods.</summary>
    public static bool IsOrderable(ItemType type, ItemPresentation? presentation) =>
        type == ItemType.Supply || (type == ItemType.FinishedGood && presentation == ItemPresentation.Bulk);

    /// <summary>
    /// RN-20 suggestion: projected = stock + in transit + submitted or approved not yet dispatched; at or below the
    /// minimum, suggest maximum − projected (rounded up to whole pieces). Null when nothing is needed.
    /// </summary>
    public static decimal? Suggest(decimal minQty, decimal maxQty, decimal projected, bool wholeQuantities)
    {
        if (projected > minQty)
            return null;
        var qty = maxQty - projected;
        if (wholeQuantities)
            qty = decimal.Ceiling(qty);
        return qty > 0 ? InventoryMath.Round(qty) : null;
    }
}

/// <summary>
/// Order of a branch to the plant (dominio §4.5, RN-20, RN-24): Draft → Submitted → Approved → PartiallyFulfilled | Fulfilled;
/// Rejected (from Submitted) and Cancelled (from Draft or Submitted, or with its transfer).
/// </summary>
[Audited]
public class BranchOrder : AuditableEntity, IVersioned
{
    public const string DocType = "BranchOrder";
    public const int NotesMaxLength = 500;

    private readonly List<BranchOrderLine> _lines = [];

    private BranchOrder() { }

    public BranchOrder(string folio, Guid requestingLocationId, Guid supplyingLocationId, DateOnly requiredDate, string? notes,
        IReadOnlyList<BranchOrderLineInput> lines, DateOnly today)
    {
        Folio = folio;
        RequestingLocationId = requestingLocationId;
        SupplyingLocationId = supplyingLocationId;
        Status = BranchOrderStatus.Draft;
        SetPlan(requiredDate, notes, lines, today);
    }

    public string Folio { get; private set; } = null!;

    /// <summary>The branch (RN-20).</summary>
    public Guid RequestingLocationId { get; private set; }

    /// <summary>The plant (RN-20).</summary>
    public Guid SupplyingLocationId { get; private set; }

    public DateOnly RequiredDate { get; private set; }
    public BranchOrderStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public Guid? SubmittedBy { get; private set; }
    public DateTimeOffset? ApprovedAt { get; private set; }
    public Guid? ApprovedBy { get; private set; }
    public DateTimeOffset? RejectedAt { get; private set; }
    public Guid? RejectedBy { get; private set; }
    public string? RejectionReason { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<BranchOrderLine> Lines => _lines;

    public void UpdateDraft(DateOnly requiredDate, string? notes, IReadOnlyList<BranchOrderLineInput> lines, DateOnly today)
    {
        EnsureStatus("Solo un pedido en borrador puede editarse.", BranchOrderStatus.Draft);
        SetPlan(requiredDate, notes, lines, today);
    }

    public void Submit(DateOnly today, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido en borrador puede enviarse.", BranchOrderStatus.Draft);
        EnsureNotPast(RequiredDate, today);
        Status = BranchOrderStatus.Submitted;
        SubmittedAt = now;
        SubmittedBy = userId;
    }

    /// <summary>
    /// RN-20: every line gets 0 to its requested quantity; all in 0 is a rejection, not an approval. The caller creates
    /// the linked transfer with the approved lines.
    /// </summary>
    public void Approve(IReadOnlyList<BranchOrderApproval> approvals, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido enviado puede aprobarse.", BranchOrderStatus.Submitted);
        if (approvals.Select(a => a.LineId).Distinct().Count() != approvals.Count
            || approvals.Count != _lines.Count
            || approvals.Any(a => _lines.All(l => l.Id != a.LineId)))
            throw new BusinessRuleException("branch_order_approval_incomplete", "Indica la cantidad aprobada de todas las líneas del pedido.");
        if (approvals.All(a => a.ApprovedQty == 0))
            throw new BusinessRuleException("branch_order_nothing_approved",
                "No puedes aprobar todo en cero: rechaza el pedido con un motivo (RN-20).");

        foreach (var approval in approvals)
            _lines.Single(l => l.Id == approval.LineId).Approve(approval.ApprovedQty);

        Status = BranchOrderStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
    }

    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido enviado puede rechazarse.", BranchOrderStatus.Submitted);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("rejection_reason_required", "Indica el motivo del rechazo.");
        Status = BranchOrderStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    /// <summary>RN-20: the branch cancels only in Draft or Submitted.</summary>
    public void Cancel(DateTimeOffset now)
    {
        EnsureStatus("Solo se cancela un pedido en borrador o enviado; uno aprobado se cancela cancelando su traspaso.",
            BranchOrderStatus.Draft, BranchOrderStatus.Submitted);
        Status = BranchOrderStatus.Cancelled;
        CancelledAt = now;
    }

    /// <summary>RN-20: cancelling the linked transfer cancels the order.</summary>
    public void CancelWithTransfer(DateTimeOffset now)
    {
        EnsureStatus("El pedido ya no está pendiente de despacho.", BranchOrderStatus.Approved);
        Status = BranchOrderStatus.Cancelled;
        CancelledAt = now;
    }

    /// <summary>
    /// RN-24: the dispatch of the linked transfer sets ShippedQty per item; everything approved shipped → Fulfilled,
    /// otherwise PartiallyFulfilled (final: what is missing is ordered again).
    /// </summary>
    public void RegisterShipment(IReadOnlyDictionary<Guid, decimal> shippedByItem)
    {
        EnsureStatus("El pedido ya no está pendiente de despacho.", BranchOrderStatus.Approved);
        if (shippedByItem.Keys.Any(itemId => _lines.All(l => l.ItemId != itemId)))
            throw new BusinessRuleException("transfer_item_not_in_order", "El traspaso lleva artículos que no están en el pedido.");

        foreach (var line in _lines)
            line.Ship(shippedByItem.GetValueOrDefault(line.ItemId));

        Status = _lines.All(l => l.ShippedQty >= (l.ApprovedQty ?? 0)) ? BranchOrderStatus.Fulfilled : BranchOrderStatus.PartiallyFulfilled;
    }

    private void SetPlan(DateOnly requiredDate, string? notes, IReadOnlyList<BranchOrderLineInput> lines, DateOnly today)
    {
        EnsureNotPast(requiredDate, today);
        if (lines.Count == 0)
            throw new BusinessRuleException("branch_order_without_lines", "El pedido debe tener al menos una línea.");
        if (lines.Any(l => l.RequestedQty <= 0 || InventoryMath.Round(l.RequestedQty) != l.RequestedQty))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("branch_order_line_duplicated", "Hay artículos repetidos en el pedido.");

        RequiredDate = requiredDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select((l, i) => new BranchOrderLine(Id, i + 1, l.ItemId, l.RequestedQty)));
    }

    private static void EnsureNotPast(DateOnly requiredDate, DateOnly today)
    {
        if (requiredDate < today)
            throw new BusinessRuleException("required_date_past", "La fecha requerida no puede ser anterior a hoy (RN-20).");
    }

    private void EnsureStatus(string message, params BranchOrderStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("invalid_branch_order_status", message);
    }
}

public class BranchOrderLine : Entity
{
    private BranchOrderLine() { }

    internal BranchOrderLine(Guid branchOrderId, int lineNumber, Guid itemId, decimal requestedQty)
    {
        BranchOrderId = branchOrderId;
        LineNumber = lineNumber;
        ItemId = itemId;
        RequestedQty = requestedQty;
    }

    public Guid BranchOrderId { get; private set; }
    public int LineNumber { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In base unit.</summary>
    public decimal RequestedQty { get; private set; }

    /// <summary>Set by the plant when approving: 0 to RequestedQty.</summary>
    public decimal? ApprovedQty { get; private set; }

    public decimal ShippedQty { get; private set; }

    internal void Approve(decimal approvedQty)
    {
        if (approvedQty < 0 || approvedQty > RequestedQty || InventoryMath.Round(approvedQty) != approvedQty)
            throw new BusinessRuleException("invalid_approved_quantity",
                $"La cantidad aprobada de la línea {LineNumber} debe ir de 0 a lo solicitado ({RequestedQty:0.####}).");
        ApprovedQty = approvedQty;
    }

    internal void Ship(decimal shippedQty) => ShippedQty = shippedQty;
}
