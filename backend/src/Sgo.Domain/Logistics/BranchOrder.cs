using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Logistics;

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

/// <param name="RequestedQty">In the item's base unit.</param>
public sealed record BranchOrderLineInput(Guid ItemId, decimal RequestedQty);

public sealed record LineApproval(Guid LineId, decimal ApprovedQty);

/// <summary>
/// Branch order (dominio §4.5): the branch asks its factory or commissary for stock.
/// Draft → Submitted → Approved → PartiallyFulfilled | Fulfilled; Rejected from Submitted; Cancelled from Draft or
/// Submitted, or from Approved when the origin cancels the order's draft transfer.
/// RN-20: approving yields the lines of one draft transfer. RN-24: receiving that transfer updates ShippedQty and the status.
/// </summary>
[Audited]
public class BranchOrder : AuditableEntity, IVersioned
{
    private readonly List<BranchOrderLine> _lines = [];

    private BranchOrder() { }

    public BranchOrder(string folio, Guid requestingLocationId, Guid supplyingLocationId, DateOnly requiredDate, string? notes,
        IReadOnlyList<BranchOrderLineInput> lines)
    {
        Folio = folio;
        RequestingLocationId = requestingLocationId;
        Status = BranchOrderStatus.Draft;
        SetContent(supplyingLocationId, requiredDate, notes, lines);
    }

    public string Folio { get; private set; } = null!;

    /// <summary>The branch that orders.</summary>
    public Guid RequestingLocationId { get; private set; }

    /// <summary>Factory or commissary that supplies it.</summary>
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
    public DateTimeOffset? FulfilledAt { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<BranchOrderLine> Lines => _lines;

    public void UpdateDraft(Guid supplyingLocationId, DateOnly requiredDate, string? notes, IReadOnlyList<BranchOrderLineInput> lines)
    {
        EnsureStatus("Solo un pedido en borrador puede editarse.", BranchOrderStatus.Draft);
        SetContent(supplyingLocationId, requiredDate, notes, lines);
    }

    public void Submit(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido en borrador puede enviarse.", BranchOrderStatus.Draft);
        Status = BranchOrderStatus.Submitted;
        SubmittedAt = now;
        SubmittedBy = userId;
    }

    /// <summary>
    /// RN-20: every line gets 0 ≤ ApprovedQty ≤ RequestedQty. Returns the lines of the draft transfer (approved &gt; 0).
    /// Approving nothing is a rejection, not an approval.
    /// </summary>
    public IReadOnlyList<TransferLineInput> Approve(IReadOnlyList<LineApproval> approvals, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido enviado puede aprobarse.", BranchOrderStatus.Submitted);
        if (approvals.Select(a => a.LineId).Distinct().Count() != approvals.Count
            || approvals.Count != _lines.Count
            || approvals.Any(a => _lines.All(l => l.Id != a.LineId)))
            throw new BusinessRuleException("branch_order_approval_incomplete", "Indica la cantidad aprobada de todas las líneas del pedido.");
        if (approvals.All(a => a.ApprovedQty == 0))
            throw new BusinessRuleException("branch_order_nothing_approved", "No se aprobó ninguna cantidad; si no se va a surtir, rechaza el pedido.");

        foreach (var approval in approvals)
            _lines.Single(l => l.Id == approval.LineId).Approve(approval.ApprovedQty);

        Status = BranchOrderStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
        return _lines.Where(l => l.ApprovedQty > 0).Select(l => new TransferLineInput(l.ItemId, null, l.ApprovedQty!.Value)).ToList();
    }

    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido enviado puede rechazarse.", BranchOrderStatus.Submitted);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("branch_order_rejection_reason_required", "Indica el motivo del rechazo.");
        Status = BranchOrderStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    /// <summary>The branch cancels an order that has not been approved.</summary>
    public void Cancel()
    {
        EnsureStatus("Solo se cancela un pedido en borrador o enviado; uno aprobado se cancela cancelando su traspaso.",
            BranchOrderStatus.Draft, BranchOrderStatus.Submitted);
        Status = BranchOrderStatus.Cancelled;
    }

    /// <summary>The origin cancelled the order's draft transfer: there is no other way to supply it.</summary>
    public void CancelWithTransfer()
    {
        EnsureStatus("El pedido del traspaso no está aprobado.", BranchOrderStatus.Approved);
        Status = BranchOrderStatus.Cancelled;
    }

    /// <summary>
    /// Maximum per item that the order's transfer may carry: its approved quantity (items not approved: none).
    /// </summary>
    public IReadOnlyDictionary<Guid, decimal> ApprovedByItem() =>
        _lines.Where(l => l.ApprovedQty > 0).ToDictionary(l => l.ItemId, l => l.ApprovedQty!.Value);

    /// <summary>
    /// RN-24: when its transfer is received, ShippedQty = what was dispatched per item (a loss in transit is recorded on the
    /// transfer, RN-22). Fulfilled when every approved line was shipped in full; otherwise PartiallyFulfilled (final).
    /// </summary>
    public void RegisterShipment(IReadOnlyDictionary<Guid, decimal> shippedByItem, DateTimeOffset now)
    {
        EnsureStatus("El pedido del traspaso no está aprobado.", BranchOrderStatus.Approved);
        foreach (var line in _lines)
            line.Ship(shippedByItem.GetValueOrDefault(line.ItemId));

        Status = _lines.Where(l => l.ApprovedQty > 0).All(l => l.ShippedQty >= l.ApprovedQty)
            ? BranchOrderStatus.Fulfilled
            : BranchOrderStatus.PartiallyFulfilled;
        FulfilledAt = now;
    }

    private void SetContent(Guid supplyingLocationId, DateOnly requiredDate, string? notes, IReadOnlyList<BranchOrderLineInput> lines)
    {
        if (supplyingLocationId == RequestingLocationId)
            throw new BusinessRuleException("branch_order_same_location", "La sucursal no puede pedirse a sí misma.");
        if (lines.Count == 0)
            throw new BusinessRuleException("branch_order_without_lines", "El pedido debe tener al menos una línea.");
        if (lines.Any(l => l.RequestedQty <= 0 || InventoryMath.Round(l.RequestedQty) != l.RequestedQty))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("branch_order_line_duplicated", "Hay artículos repetidos en el pedido.");

        SupplyingLocationId = supplyingLocationId;
        RequiredDate = requiredDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select(l => new BranchOrderLine(Id, l.ItemId, l.RequestedQty)));
    }

    private void EnsureStatus(string message, params BranchOrderStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("branch_order_invalid_status", message);
    }
}

public class BranchOrderLine : Entity
{
    private BranchOrderLine() { }

    internal BranchOrderLine(Guid branchOrderId, Guid itemId, decimal requestedQty)
    {
        BranchOrderId = branchOrderId;
        ItemId = itemId;
        RequestedQty = requestedQty;
    }

    public Guid BranchOrderId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>All quantities in the item's base unit.</summary>
    public decimal RequestedQty { get; private set; }

    public decimal? ApprovedQty { get; private set; }
    public decimal ShippedQty { get; private set; }

    internal void Approve(decimal approvedQty)
    {
        if (approvedQty < 0 || approvedQty > RequestedQty || InventoryMath.Round(approvedQty) != approvedQty)
            throw new BusinessRuleException("branch_order_invalid_approved_qty",
                "La cantidad aprobada va de cero a lo solicitado, con máximo 4 decimales.");
        ApprovedQty = approvedQty;
    }

    internal void Ship(decimal quantity) => ShippedQty += quantity;
}

public static class BranchOrderSuggestion
{
    /// <summary>
    /// Min/max suggestion: projected = on hand + in transit to the branch + pending orders. When projected ≤ min,
    /// suggests max − projected; otherwise nothing (null).
    /// </summary>
    public static decimal? Calculate(decimal minQty, decimal maxQty, decimal onHand, decimal inTransit, decimal pending)
    {
        var projected = onHand + inTransit + pending;
        if (projected > minQty) return null;
        var suggested = InventoryMath.Round(maxQty - projected);
        return suggested > 0 ? suggested : null;
    }
}
