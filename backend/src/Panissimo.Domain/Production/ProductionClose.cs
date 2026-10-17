using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;

namespace Panissimo.Domain.Production;

public enum ProductionCloseKind
{
    Partial,
    Final,
}

/// <summary>What one close consumed of a component: real quantity, its lots and the cost it left at.</summary>
public sealed record CloseConsumption(Guid ComponentItemId, decimal TheoreticalQty, decimal ActualQty, decimal UnitCost,
    IReadOnlyList<LotQuantity> Lots);

/// <summary>
/// A partial or final close of a production order (dominio §4.4, RN-61..RN-65). Immutable once registered:
/// it is corrected with an inventory adjustment.
/// </summary>
[Audited]
public class ProductionClose : AuditableEntity
{
    public const string DocType = "ProductionClose";

    private readonly List<ProductionCloseLine> _lines = [];

    private ProductionClose() { }

    public ProductionClose(Guid id, string folio, ProductionOrder order, ProductionCloseKind kind, DateOnly businessDate, Shift? shift,
        decimal producedQty, Guid? outputLotId, IReadOnlyList<CloseConsumption> consumption, DateTimeOffset closedAt, Guid? closedBy,
        string? notes, bool exceedsTolerance = false)
    {
        Id = id;
        Folio = folio;
        ProductionOrderId = order.Id;
        Sequence = order.CloseCount + 1;
        Kind = kind;
        BusinessDate = businessDate;
        Shift = shift;
        ProducedQty = producedQty;
        OutputLotId = outputLotId;
        ClosedAt = closedAt;
        ClosedBy = closedBy;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        ExceedsTolerance = exceedsTolerance;
        _lines.AddRange(consumption.Select(c => new ProductionCloseLine(Id, c)));

        // RN-64: the close costs what its real consumption cost at the plant's average.
        TotalCost = InventoryMath.Round(_lines.Sum(l => l.ActualQty * l.UnitCost));
        UnitCost = producedQty > 0 ? InventoryMath.Round(TotalCost / producedQty) : 0;
    }

    public string Folio { get; private set; } = null!;
    public Guid ProductionOrderId { get; private set; }

    /// <summary>1, 2, 3… within the order.</summary>
    public int Sequence { get; private set; }

    public ProductionCloseKind Kind { get; private set; }

    /// <summary>D-03: this close took the order's total above the planned quantity plus the tolerance (informative).</summary>
    public bool ExceedsTolerance { get; private set; }
    public DateOnly BusinessDate { get; private set; }
    public Shift? Shift { get; private set; }
    public decimal ProducedQty { get; private set; }

    /// <summary>RN-62: one lot per close with production; null when nothing was produced or the item has no lots.</summary>
    public Guid? OutputLotId { get; private set; }

    public decimal TotalCost { get; private set; }
    public decimal UnitCost { get; private set; }
    public DateTimeOffset ClosedAt { get; private set; }
    public Guid? ClosedBy { get; private set; }
    public string? Notes { get; private set; }
    public IReadOnlyList<ProductionCloseLine> Lines => _lines;

    /// <summary>RN-13: production waste of this close = real − theoretical for what it produced.</summary>
    public decimal WasteQty => _lines.Sum(l => l.WasteQty);

    /// <summary>Waste valued at each line's cost.</summary>
    public decimal WasteCost => InventoryMath.Round(_lines.Sum(l => l.WasteQty * l.UnitCost));
}

public class ProductionCloseLine : Entity
{
    private readonly List<ProductionCloseLineLot> _lots = [];

    private ProductionCloseLine() { }

    internal ProductionCloseLine(Guid closeId, CloseConsumption consumption)
    {
        ProductionCloseId = closeId;
        ComponentItemId = consumption.ComponentItemId;
        TheoreticalQty = consumption.TheoreticalQty;
        ActualQty = consumption.ActualQty;
        UnitCost = consumption.UnitCost;
        WasteQty = consumption.ActualQty - consumption.TheoreticalQty;
        _lots.AddRange(consumption.Lots.Select(l => new ProductionCloseLineLot(Id, l.LotId, l.Qty)));
    }

    public Guid ProductionCloseId { get; private set; }
    public Guid ComponentItemId { get; private set; }

    /// <summary>RN-11 for the quantity produced in this close.</summary>
    public decimal TheoreticalQty { get; private set; }

    public decimal ActualQty { get; private set; }

    /// <summary>Average cost the component left at (RN-04).</summary>
    public decimal UnitCost { get; private set; }

    /// <summary>RN-13: ActualQty − TheoreticalQty (negative when less was used).</summary>
    public decimal WasteQty { get; private set; }

    public IReadOnlyList<ProductionCloseLineLot> Lots => _lots;
}

public class ProductionCloseLineLot : Entity
{
    private ProductionCloseLineLot() { }

    internal ProductionCloseLineLot(Guid lineId, Guid lotId, decimal quantity)
    {
        LineId = lineId;
        LotId = lotId;
        Quantity = quantity;
    }

    public Guid LineId { get; private set; }
    public Guid LotId { get; private set; }
    public decimal Quantity { get; private set; }
}
