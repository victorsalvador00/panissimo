using Sgo.Domain.Common;

namespace Sgo.Domain.Inventory;

public enum PhysicalCountStatus
{
    Draft,
    InProgress,
    Closed,
    Cancelled,
}

public sealed record SnapshotLine(Guid ItemId, Guid? LotId, decimal SnapshotQty);

/// <summary>
/// Physical count (dominio §4.3, RN-06): Draft → InProgress → Closed | Cancelled.
/// The snapshot is taken when it starts; closing posts the difference counted − snapshot of every line.
/// </summary>
[Audited]
public class PhysicalCount : AuditableEntity, IVersioned
{
    public const string DocType = "PhysicalCount";

    private readonly List<PhysicalCountLine> _lines = [];

    private PhysicalCount() { }

    public PhysicalCount(string folio, Guid locationId, Guid? categoryId, string? notes)
    {
        Folio = folio;
        LocationId = locationId;
        CategoryId = categoryId;
        Notes = Clean(notes);
        Status = PhysicalCountStatus.Draft;
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }

    /// <summary>Partial count limited to one category; null = every item.</summary>
    public Guid? CategoryId { get; private set; }

    public PhysicalCountStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset? StartedAt { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }

    /// <summary>Last kardex sequence included in the snapshot; lines added later are valued at this point.</summary>
    public long? SnapshotSequence { get; private set; }

    public uint Version { get; private set; }
    public IReadOnlyList<PhysicalCountLine> Lines => _lines;

    public void UpdateDraft(Guid? categoryId, string? notes)
    {
        EnsureStatus(PhysicalCountStatus.Draft, "count_not_draft", "Solo un conteo en borrador puede cambiar su categoría.");
        CategoryId = categoryId;
        Notes = Clean(notes);
    }

    public void UpdateNotes(string? notes)
    {
        if (Status is PhysicalCountStatus.Closed or PhysicalCountStatus.Cancelled)
            throw new BusinessRuleException("count_finished", "El conteo ya está cerrado o cancelado.");
        Notes = Clean(notes);
    }

    /// <summary>RN-06: saves the snapshot of every line.</summary>
    public void Start(DateTimeOffset now, long snapshotSequence, IEnumerable<SnapshotLine> snapshot)
    {
        EnsureStatus(PhysicalCountStatus.Draft, "count_not_draft", "Solo un conteo en borrador puede iniciarse.");
        Status = PhysicalCountStatus.InProgress;
        StartedAt = now;
        SnapshotSequence = snapshotSequence;
        foreach (var line in snapshot)
            _lines.Add(new PhysicalCountLine(Id, line.ItemId, line.LotId, line.SnapshotQty));
    }

    /// <summary>An item or lot found during the count that was not in the snapshot list.</summary>
    public PhysicalCountLine AddLine(Guid itemId, Guid? lotId, decimal snapshotQty)
    {
        EnsureStatus(PhysicalCountStatus.InProgress, "count_not_in_progress", "Solo se agregan líneas a un conteo en curso.");
        if (_lines.Any(l => l.ItemId == itemId && l.LotId == lotId))
            throw new BusinessRuleException("count_line_duplicated", "El artículo y lote ya están en el conteo.");
        var line = new PhysicalCountLine(Id, itemId, lotId, snapshotQty);
        _lines.Add(line);
        return line;
    }

    public void RecordCount(Guid lineId, decimal countedQty)
    {
        EnsureStatus(PhysicalCountStatus.InProgress, "count_not_in_progress", "Solo se captura en un conteo en curso.");
        var line = _lines.SingleOrDefault(l => l.Id == lineId)
                   ?? throw new BusinessRuleException("count_line_not_found", "La línea no pertenece a este conteo.");
        line.Record(countedQty);
    }

    /// <summary>RN-06: returns the PhysicalCountAdjustment movements (one per line with difference).</summary>
    public IReadOnlyList<MovementRequest> Close(DateTimeOffset now)
    {
        EnsureStatus(PhysicalCountStatus.InProgress, "count_not_in_progress", "Solo un conteo en curso puede cerrarse.");
        var pending = _lines.Count(l => l.CountedQty is null);
        if (pending > 0)
            throw new BusinessRuleException("count_incomplete",
                $"Faltan {pending} línea(s) por contar. Captura 0 en lo que no encontraste.");

        Status = PhysicalCountStatus.Closed;
        ClosedAt = now;
        return _lines.Where(l => l.Difference != 0)
            .Select(l => new MovementRequest(LocationId, l.ItemId, l.LotId, MovementType.PhysicalCountAdjustment,
                l.Difference!.Value, null, DocType, Id, Folio, "Diferencia de conteo físico"))
            .ToList();
    }

    public void Cancel(DateTimeOffset now)
    {
        if (Status is not (PhysicalCountStatus.Draft or PhysicalCountStatus.InProgress))
            throw new BusinessRuleException("count_finished", "El conteo ya está cerrado o cancelado.");
        Status = PhysicalCountStatus.Cancelled;
        ClosedAt = now;
    }

    private void EnsureStatus(PhysicalCountStatus expected, string code, string message)
    {
        if (Status != expected)
            throw new BusinessRuleException(code, message);
    }

    private static string? Clean(string? notes) => string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
}

public class PhysicalCountLine : Entity
{
    private PhysicalCountLine() { }

    internal PhysicalCountLine(Guid countId, Guid itemId, Guid? lotId, decimal snapshotQty)
    {
        CountId = countId;
        ItemId = itemId;
        LotId = lotId;
        SnapshotQty = snapshotQty;
    }

    public Guid CountId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }
    public decimal SnapshotQty { get; private set; }
    public decimal? CountedQty { get; private set; }

    /// <summary>CountedQty − SnapshotQty; null while not counted.</summary>
    public decimal? Difference { get; private set; }

    internal void Record(decimal countedQty)
    {
        if (countedQty < 0)
            throw new BusinessRuleException("invalid_quantity", "La cantidad contada no puede ser negativa.");
        if (InventoryMath.Round(countedQty) != countedQty)
            throw new BusinessRuleException("invalid_quantity", $"La cantidad contada admite máximo {InventoryMath.Decimals} decimales.");
        CountedQty = countedQty;
        Difference = countedQty - SnapshotQty;
    }
}
