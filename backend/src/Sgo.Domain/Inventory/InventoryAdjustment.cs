using Sgo.Domain.Common;

namespace Sgo.Domain.Inventory;

public enum AdjustmentReason
{
    Correction,
    Waste,
    Expired,
    Damaged,
    InternalUse,
}

public enum AdjustmentStatus
{
    Posted,
    Cancelled,
}

/// <summary>Reason → allowed sign and kardex movement type (agreed for B-07).</summary>
public static class AdjustmentReasonRules
{
    public static bool AllowsEntries(this AdjustmentReason reason) => reason == AdjustmentReason.Correction;

    public static MovementType MovementType(this AdjustmentReason reason) => reason switch
    {
        AdjustmentReason.Waste or AdjustmentReason.Expired or AdjustmentReason.Damaged => Inventory.MovementType.Waste,
        _ => Inventory.MovementType.Adjustment,
    };
}

public sealed record AdjustmentLineInput(Guid ItemId, Guid? LotId, decimal Quantity, decimal? UnitCost, string? Notes);

/// <summary>Inventory adjustment (dominio §4.3). Created and posted in one step; corrections are new adjustments.</summary>
[Audited]
public class InventoryAdjustment : AuditableEntity, IVersioned
{
    public const string DocType = "Adjustment";

    private readonly List<InventoryAdjustmentLine> _lines = [];

    private InventoryAdjustment() { }

    /// <param name="id">Known in advance so lots created for this adjustment can reference it.</param>
    public InventoryAdjustment(Guid id, string folio, Guid locationId, AdjustmentReason reason, string? notes, IReadOnlyList<AdjustmentLineInput> lines)
    {
        Id = id;
        if (lines.Count == 0)
            throw new BusinessRuleException("adjustment_without_lines", "El ajuste debe tener al menos una línea.");
        if (!reason.AllowsEntries() && lines.Any(l => l.Quantity > 0))
            throw new BusinessRuleException("adjustment_sign",
                "Solo los ajustes por corrección admiten cantidades positivas; merma, caducado, dañado y uso interno son salidas.");
        if (lines.Any(l => l.Quantity == 0))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades del ajuste no pueden ser cero.");
        if (lines.Any(l => l.UnitCost is not null && l.Quantity < 0))
            throw new BusinessRuleException("adjustment_exit_cost", "Las salidas se valúan al costo promedio vigente; no captures costo.");

        Folio = folio;
        LocationId = locationId;
        Reason = reason;
        Status = AdjustmentStatus.Posted;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.AddRange(lines.Select(l => new InventoryAdjustmentLine(Id, l)));
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }
    public AdjustmentReason Reason { get; private set; }
    public AdjustmentStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<InventoryAdjustmentLine> Lines => _lines;

    public IEnumerable<MovementRequest> ToMovementRequests() =>
        _lines.Select(l => new MovementRequest(LocationId, l.ItemId, l.LotId, Reason.MovementType(), l.Quantity, l.UnitCost,
            DocType, Id, Folio, l.Notes ?? Notes));
}

public class InventoryAdjustmentLine : Entity
{
    private InventoryAdjustmentLine() { }

    internal InventoryAdjustmentLine(Guid adjustmentId, AdjustmentLineInput input)
    {
        AdjustmentId = adjustmentId;
        ItemId = input.ItemId;
        LotId = input.LotId;
        Quantity = input.Quantity;
        UnitCost = input.UnitCost;
        Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim();
    }

    public Guid AdjustmentId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }

    /// <summary>Signed, base unit.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Only for entries; null = current average cost.</summary>
    public decimal? UnitCost { get; private set; }

    public string? Notes { get; private set; }
}
