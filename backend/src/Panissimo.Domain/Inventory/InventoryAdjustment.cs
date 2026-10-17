using Panissimo.Domain.Common;

namespace Panissimo.Domain.Inventory;

public enum AdjustmentReason
{
    Correction,
    Waste,
    Expired,
    Damaged,
    InternalUse,

    /// <summary>D-08: goods returned or rejected by a customer; part of each line may go straight to waste.</summary>
    CustomerReturn,
}

public enum AdjustmentStatus
{
    Posted,
}

/// <summary>Reason → allowed sign and kardex movement type (dominio §4.3).</summary>
public static class AdjustmentReasonRules
{
    public static bool AllowsEntries(this AdjustmentReason reason) => reason is AdjustmentReason.Correction or AdjustmentReason.CustomerReturn;

    /// <summary>D-08: a customer return only brings goods in.</summary>
    public static bool OnlyEntries(this AdjustmentReason reason) => reason == AdjustmentReason.CustomerReturn;

    /// <summary>Reasons that write stock off as waste (also the waste part of a customer return).</summary>
    public static bool IsWaste(this AdjustmentReason reason) => reason is AdjustmentReason.Waste or AdjustmentReason.Expired or AdjustmentReason.Damaged;

    public static MovementType MovementType(this AdjustmentReason reason) => reason switch
    {
        AdjustmentReason.Waste or AdjustmentReason.Expired or AdjustmentReason.Damaged => Inventory.MovementType.Waste,
        _ => Inventory.MovementType.Adjustment,
    };
}

/// <param name="WasteQty">D-08, customer returns only: part of the returned quantity that goes straight to waste.</param>
/// <param name="WasteReason">Waste, Expired or Damaged; required with <paramref name="WasteQty"/>.</param>
public sealed record AdjustmentLineInput(
    Guid ItemId, Guid? LotId, decimal Quantity, decimal? UnitCost, string? Notes, decimal? WasteQty = null, AdjustmentReason? WasteReason = null);

/// <summary>Inventory adjustment (dominio §4.3). Created and posted in one step; it is never cancelled: corrections are new adjustments.</summary>
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
        if (reason.OnlyEntries() && lines.Any(l => l.Quantity < 0))
            throw new BusinessRuleException("adjustment_sign", "Una devolución de cliente solo registra entradas.");
        if (reason != AdjustmentReason.CustomerReturn && lines.Any(l => l.WasteQty is not null))
            throw new BusinessRuleException("adjustment_waste_not_allowed", "Solo una devolución de cliente separa una parte como merma.");
        foreach (var line in lines.Where(l => l.WasteQty is not null))
        {
            if (line.WasteQty <= 0 || line.WasteQty > line.Quantity || InventoryMath.Round(line.WasteQty!.Value) != line.WasteQty)
                throw new BusinessRuleException("invalid_waste_quantity",
                    "La merma de una devolución debe ser mayor que cero y no pasar de lo devuelto, con máximo 4 decimales.");
            if (line.WasteReason is not { } wasteReason || !wasteReason.IsWaste())
                throw new BusinessRuleException("waste_reason_required", "Indica el motivo de la merma: merma, caducado o dañado.");
        }

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

    /// <summary>D-08: the waste part of a customer return, posted after the return entered (same lot, average cost).</summary>
    public IReadOnlyList<MovementRequest> WasteMovementRequests() =>
        _lines.Where(l => l.WasteQty is not null)
            .Select(l => new MovementRequest(LocationId, l.ItemId, l.LotId, MovementType.Waste, -l.WasteQty!.Value, null, DocType, Id, Folio,
                $"Merma de devolución ({WasteReasonName(l.WasteReason!.Value)}){(l.Notes is null ? "" : ": " + l.Notes)}"))
            .ToList();

    private static string WasteReasonName(AdjustmentReason reason) => reason switch
    {
        AdjustmentReason.Expired => "caducado",
        AdjustmentReason.Damaged => "dañado",
        _ => "merma",
    };
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
        WasteQty = input.WasteQty;
        WasteReason = input.WasteReason;
    }

    public Guid AdjustmentId { get; private set; }
    public Guid ItemId { get; private set; }
    public Guid? LotId { get; private set; }

    /// <summary>Signed, base unit.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Only for correction entries; null = current average cost.</summary>
    public decimal? UnitCost { get; private set; }

    public string? Notes { get; private set; }

    /// <summary>D-08: part of a customer return written off as waste.</summary>
    public decimal? WasteQty { get; private set; }

    public AdjustmentReason? WasteReason { get; private set; }
}
