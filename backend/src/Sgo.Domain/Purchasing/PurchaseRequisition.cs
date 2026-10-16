using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Purchasing;

public enum RequisitionStatus
{
    Draft,
    Submitted,
    Approved,
    Converted,
    Rejected,
    Cancelled,
}

/// <param name="Quantity">In the item's purchase unit.</param>
/// <param name="SuggestedSupplierId">Required to submit; the service fills in the item's preferred supplier.</param>
public sealed record RequisitionLineInput(Guid ItemId, decimal Quantity, Guid? SuggestedSupplierId);

/// <summary>
/// Purchase requisition (dominio §4.6): Draft → Submitted → Approved → Converted; Rejected from Submitted;
/// Cancelled from Draft, Submitted or Approved. RN-34: approved requisitions become purchase orders.
/// </summary>
[Audited]
public class PurchaseRequisition : AuditableEntity, IVersioned
{
    private readonly List<PurchaseRequisitionLine> _lines = [];

    private PurchaseRequisition() { }

    public PurchaseRequisition(string folio, Guid locationId, DateOnly neededBy, string? notes, IReadOnlyList<RequisitionLineInput> lines)
    {
        Folio = folio;
        LocationId = locationId;
        Status = RequisitionStatus.Draft;
        SetContent(neededBy, notes, lines);
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }
    public DateOnly NeededBy { get; private set; }
    public RequisitionStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset? SubmittedAt { get; private set; }
    public Guid? SubmittedBy { get; private set; }
    public DateTimeOffset? ApprovedAt { get; private set; }
    public Guid? ApprovedBy { get; private set; }
    public DateTimeOffset? RejectedAt { get; private set; }
    public Guid? RejectedBy { get; private set; }
    public string? RejectionReason { get; private set; }
    public DateTimeOffset? ConvertedAt { get; private set; }
    public Guid? ConvertedBy { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<PurchaseRequisitionLine> Lines => _lines;

    public void UpdateDraft(DateOnly neededBy, string? notes, IReadOnlyList<RequisitionLineInput> lines)
    {
        EnsureStatus(RequisitionStatus.Draft, "Solo una requisición en borrador puede editarse.");
        SetContent(neededBy, notes, lines);
    }

    public void Submit(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus(RequisitionStatus.Draft, "Solo una requisición en borrador puede enviarse.");
        if (_lines.Any(l => l.SuggestedSupplierId is null))
            throw new BusinessRuleException("requisition_line_without_supplier",
                "Todas las líneas necesitan proveedor sugerido para enviar la requisición.");
        Status = RequisitionStatus.Submitted;
        SubmittedAt = now;
        SubmittedBy = userId;
    }

    public void Approve(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus(RequisitionStatus.Submitted, "Solo una requisición enviada puede aprobarse.");
        Status = RequisitionStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
    }

    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus(RequisitionStatus.Submitted, "Solo una requisición enviada puede rechazarse.");
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("requisition_rejection_reason_required", "Indica el motivo del rechazo.");
        Status = RequisitionStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    public void Cancel()
    {
        if (Status is not (RequisitionStatus.Draft or RequisitionStatus.Submitted or RequisitionStatus.Approved))
            throw new BusinessRuleException("requisition_not_cancellable",
                "Solo se cancelan requisiciones en borrador, enviadas o aprobadas; una convertida ya no.");
        Status = RequisitionStatus.Cancelled;
    }

    /// <summary>RN-34: only approved requisitions are converted to purchase orders.</summary>
    public void MarkConverted(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus(RequisitionStatus.Approved, $"La requisición {Folio} no está aprobada; solo las aprobadas se convierten en OC.");
        Status = RequisitionStatus.Converted;
        ConvertedAt = now;
        ConvertedBy = userId;
    }

    private void SetContent(DateOnly neededBy, string? notes, IReadOnlyList<RequisitionLineInput> lines)
    {
        if (lines.Count == 0)
            throw new BusinessRuleException("requisition_without_lines", "La requisición debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("requisition_line_duplicated", "Hay artículos repetidos en la requisición.");

        NeededBy = neededBy;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select(l => new PurchaseRequisitionLine(Id, l.ItemId, l.Quantity, l.SuggestedSupplierId)));
    }

    private void EnsureStatus(RequisitionStatus expected, string message)
    {
        if (Status != expected)
            throw new BusinessRuleException(expected == RequisitionStatus.Approved ? "requisition_not_approved" : "requisition_invalid_status", message);
    }
}

public class PurchaseRequisitionLine : Entity
{
    private PurchaseRequisitionLine() { }

    internal PurchaseRequisitionLine(Guid requisitionId, Guid itemId, decimal quantity, Guid? suggestedSupplierId)
    {
        RequisitionId = requisitionId;
        ItemId = itemId;
        Quantity = quantity;
        SuggestedSupplierId = suggestedSupplierId;
    }

    public Guid RequisitionId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In the item's purchase unit.</summary>
    public decimal Quantity { get; private set; }

    public Guid? SuggestedSupplierId { get; private set; }
}
