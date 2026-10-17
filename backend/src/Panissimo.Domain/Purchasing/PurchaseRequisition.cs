using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Domain.Purchasing;

public enum RequisitionStatus
{
    Draft,
    Submitted,
    Approved,
    Converted,
    Rejected,
    Cancelled,
}

/// <param name="Quantity">In purchase unit (RN-34).</param>
/// <param name="SuggestedSupplierId">Resolved by the service: the preferred supplier when the user gives none.</param>
public sealed record RequisitionLineInput(Guid ItemId, decimal Quantity, Guid? SuggestedSupplierId);

/// <summary>
/// Purchase requisition of the plant (dominio §4.7, RN-34): Draft → Submitted → Approved → Converted;
/// Rejected (from Submitted) and Cancelled (from Draft, Submitted or Approved).
/// </summary>
[Audited]
public class PurchaseRequisition : AuditableEntity, IVersioned
{
    public const int NotesMaxLength = 500;

    private readonly List<PurchaseRequisitionLine> _lines = [];

    private PurchaseRequisition() { }

    public PurchaseRequisition(string folio, Guid locationId, DateOnly neededBy, string? notes,
        IReadOnlyList<RequisitionLineInput> lines, DateOnly today)
    {
        Folio = folio;
        LocationId = locationId;
        Status = RequisitionStatus.Draft;
        SetPlan(neededBy, notes, lines, today);
    }

    public string Folio { get; private set; } = null!;

    /// <summary>The plant (RN-34); also the delivery location of the purchase orders it becomes.</summary>
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
    public uint Version { get; private set; }
    public IReadOnlyList<PurchaseRequisitionLine> Lines => _lines;

    public void UpdateDraft(DateOnly neededBy, string? notes, IReadOnlyList<RequisitionLineInput> lines, DateOnly today)
    {
        EnsureStatus("Solo una requisición en borrador puede editarse.", RequisitionStatus.Draft);
        SetPlan(neededBy, notes, lines, today);
    }

    /// <summary>RN-34: sending requires a supplier on every line and a date that has not passed.</summary>
    public void Submit(DateOnly today, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una requisición en borrador puede enviarse.", RequisitionStatus.Draft);
        EnsureNotPast(NeededBy, today);
        if (_lines.Any(l => l.SuggestedSupplierId is null))
            throw new BusinessRuleException("requisition_supplier_missing",
                "Indica el proveedor de todas las líneas antes de enviar la requisición (RN-34).");
        Status = RequisitionStatus.Submitted;
        SubmittedAt = now;
        SubmittedBy = userId;
    }

    public void Approve(DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una requisición enviada puede aprobarse.", RequisitionStatus.Submitted);
        Status = RequisitionStatus.Approved;
        ApprovedAt = now;
        ApprovedBy = userId;
    }

    public void Reject(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo una requisición enviada puede rechazarse.", RequisitionStatus.Submitted);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("rejection_reason_required", "Indica el motivo del rechazo.");
        Status = RequisitionStatus.Rejected;
        RejectionReason = reason.Trim();
        RejectedAt = now;
        RejectedBy = userId;
    }

    public void Cancel()
    {
        EnsureStatus("Solo se cancela una requisición en borrador, enviada o aprobada.",
            RequisitionStatus.Draft, RequisitionStatus.Submitted, RequisitionStatus.Approved);
        Status = RequisitionStatus.Cancelled;
    }

    /// <summary>RN-34: only approved requisitions become purchase orders, all their lines at once.</summary>
    public void MarkConverted(DateTimeOffset now)
    {
        EnsureStatus($"La requisición {Folio} no está aprobada: solo las aprobadas se convierten en OC.", RequisitionStatus.Approved);
        Status = RequisitionStatus.Converted;
        ConvertedAt = now;
    }

    private void SetPlan(DateOnly neededBy, string? notes, IReadOnlyList<RequisitionLineInput> lines, DateOnly today)
    {
        EnsureNotPast(neededBy, today);
        if (lines.Count == 0)
            throw new BusinessRuleException("requisition_without_lines", "La requisición debe tener al menos una línea.");
        if (lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (lines.GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("requisition_line_duplicated", "Hay artículos repetidos en la requisición.");

        NeededBy = neededBy;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(lines.Select((l, i) => new PurchaseRequisitionLine(Id, i + 1, l.ItemId, l.Quantity, l.SuggestedSupplierId)));
    }

    private static void EnsureNotPast(DateOnly neededBy, DateOnly today)
    {
        if (neededBy < today)
            throw new BusinessRuleException("needed_by_past", "La fecha requerida no puede ser anterior a hoy (RN-34).");
    }

    private void EnsureStatus(string message, params RequisitionStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("invalid_requisition_status", message);
    }
}

public class PurchaseRequisitionLine : Entity
{
    private PurchaseRequisitionLine() { }

    internal PurchaseRequisitionLine(Guid requisitionId, int lineNumber, Guid itemId, decimal quantity, Guid? suggestedSupplierId)
    {
        RequisitionId = requisitionId;
        LineNumber = lineNumber;
        ItemId = itemId;
        Quantity = quantity;
        SuggestedSupplierId = suggestedSupplierId;
    }

    public Guid RequisitionId { get; private set; }

    /// <summary>Capture order; the purchase order keeps it.</summary>
    public int LineNumber { get; private set; }

    public Guid ItemId { get; private set; }

    /// <summary>In purchase unit (or base unit when the item has none).</summary>
    public decimal Quantity { get; private set; }

    public Guid? SuggestedSupplierId { get; private set; }
}
