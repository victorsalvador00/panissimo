using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;

namespace Panissimo.Domain.Production;

public enum ProductionOrderStatus
{
    Draft,
    Released,
    InProgress,
    Completed,
    Cancelled,
}

public enum ProductionOrderSource
{
    Manual,
    Plan,
    Import,
}

public enum ShortfallReason
{
    MissingMaterial,
    MissingStaff,
    EquipmentFailure,
    DemandChange,
    Other,
}

/// <summary>Editable data of a production order (RN-60: only while in draft).</summary>
public sealed record ProductionOrderPlan(Recipe Recipe, decimal PlannedQty, DateOnly ScheduledDate, Guid? ProductionAreaId, Shift? Shift, string? Notes);

/// <summary>
/// Production order (dominio §4.4, RN-60): Draft → Released → InProgress → Completed; Cancelled from Draft, or from
/// Released while it has no closes. Partial and final closes (RN-61..RN-66) update the accumulated quantities and cost.
/// </summary>
[Audited]
public class ProductionOrder : AuditableEntity, IVersioned
{
    public const string DocType = "ProductionOrder";

    private readonly List<ProductionOrderLine> _lines = [];

    private ProductionOrder() { }

    public ProductionOrder(string folio, Guid locationId, ProductionOrderPlan plan, ProductionOrderSource source, Guid? importId, DateOnly today)
    {
        Folio = folio;
        LocationId = locationId;
        Source = source;
        ImportId = importId;
        Status = ProductionOrderStatus.Draft;
        Apply(plan, today);
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }
    public Guid RecipeId { get; private set; }
    public Guid OutputItemId { get; private set; }
    public decimal PlannedQty { get; private set; }
    public DateOnly ScheduledDate { get; private set; }
    public Guid? ProductionAreaId { get; private set; }
    public Shift? Shift { get; private set; }
    public ProductionOrderSource Source { get; private set; }
    public Guid? ImportId { get; private set; }
    public string? Notes { get; private set; }
    public ProductionOrderStatus Status { get; private set; }

    public DateTimeOffset? ReleasedAt { get; private set; }
    public Guid? ReleasedBy { get; private set; }

    /// <summary>Accumulated over the closes (RN-64).</summary>
    public decimal ProducedQty { get; private set; }

    public decimal TotalCost { get; private set; }

    /// <summary>TotalCost / ProducedQty; 0 while nothing was produced.</summary>
    public decimal UnitCost { get; private set; }

    public int CloseCount { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }
    public Guid? CompletedBy { get; private set; }
    public ShortfallReason? ShortfallReason { get; private set; }
    public string? ShortfallNotes { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }

    public uint Version { get; private set; }
    public IReadOnlyList<ProductionOrderLine> Lines => _lines;

    public decimal PendingQty => Math.Max(0, PlannedQty - ProducedQty);

    /// <summary>Still to be produced (Draft, Released, InProgress): counts as supply in the plan and RN-50.</summary>
    public bool IsOpen => Status is ProductionOrderStatus.Draft or ProductionOrderStatus.Released or ProductionOrderStatus.InProgress;

    public void UpdateDraft(ProductionOrderPlan plan, DateOnly today)
    {
        if (Status != ProductionOrderStatus.Draft)
            throw new BusinessRuleException("production_order_not_draft", "Solo una orden en borrador puede editarse (RN-60).");
        Apply(plan, today);
    }

    public void Release(DateTimeOffset now, Guid? userId)
    {
        if (Status != ProductionOrderStatus.Draft)
            throw new BusinessRuleException("production_order_not_draft", "Solo una orden en borrador puede liberarse.");
        Status = ProductionOrderStatus.Released;
        ReleasedAt = now;
        ReleasedBy = userId;
    }

    public void Cancel(DateTimeOffset now)
    {
        switch (Status)
        {
            case ProductionOrderStatus.Draft:
            case ProductionOrderStatus.Released when CloseCount == 0:
                Status = ProductionOrderStatus.Cancelled;
                CancelledAt = now;
                break;
            case ProductionOrderStatus.InProgress:
                throw new BusinessRuleException("production_order_in_progress",
                    "La orden ya tiene cierres: no puede cancelarse; termínala con el cierre final (RN-60).");
            default:
                throw new BusinessRuleException("production_order_finished", "La orden ya está completada o cancelada.");
        }
    }

    /// <summary>RN-62: lot of the close <paramref name="sequence"/>, e.g. <c>OP-000123-01</c>.</summary>
    public string LotNumberFor(int sequence) => $"{Folio}-{sequence:D2}";

    /// <summary>RN-63: total produced may not exceed PlannedQty × (1 + tolerance).</summary>
    public decimal MaxAllowedQty(decimal overrunTolerancePct) => InventoryMath.Round(PlannedQty * (1 + overrunTolerancePct / 100m));

    /// <summary>
    /// RN-61 and RN-63 checks before anything is posted: status, quantity per kind, overrun tolerance (also on partial
    /// closes) and, on a final close below plan, the shortfall reason (with notes for Other).
    /// </summary>
    public void EnsureCanClose(ProductionCloseKind kind, decimal producedQty, decimal overrunTolerancePct,
        ShortfallReason? shortfallReason, string? shortfallNotes)
    {
        if (Status is not (ProductionOrderStatus.Released or ProductionOrderStatus.InProgress))
            throw new BusinessRuleException("production_order_not_open",
                "Solo una orden liberada o en proceso admite cierres (RN-61).");
        if (producedQty < 0 || InventoryMath.Round(producedQty) != producedQty)
            throw new BusinessRuleException("invalid_quantity", "La cantidad producida no puede ser negativa y admite máximo 4 decimales.");
        if (kind == ProductionCloseKind.Partial && producedQty == 0)
            throw new BusinessRuleException("production_close_without_output", "Un cierre parcial requiere una cantidad producida mayor que cero.");
        if (kind == ProductionCloseKind.Final && producedQty == 0 && CloseCount == 0)
            throw new BusinessRuleException("production_close_without_output",
                "La orden no tiene cierres: un cierre final debe registrar producción. Si no se produjo nada, cancélala.");

        var total = ProducedQty + producedQty;
        var max = MaxAllowedQty(overrunTolerancePct);
        if (total > max)
            throw new BusinessRuleException("production_overrun",
                $"El total producido ({total:0.####}) supera lo planeado más la tolerancia. Máximo permitido: {max:0.####}.");

        if (kind == ProductionCloseKind.Final && total < PlannedQty)
        {
            if (shortfallReason is null)
                throw new BusinessRuleException("production_shortfall_reason_required",
                    "Se produjo menos de lo planeado: indica el motivo del faltante (RN-63).");
            if (shortfallReason == Production.ShortfallReason.Other && string.IsNullOrWhiteSpace(shortfallNotes))
                throw new BusinessRuleException("production_shortfall_notes_required", "Describe el motivo del faltante en las notas.");
        }
    }

    /// <summary>RN-61/RN-63/RN-64: adds the close to the accumulated quantities and cost and moves the status.</summary>
    public void RegisterClose(ProductionClose close, ShortfallReason? shortfallReason, string? shortfallNotes)
    {
        if (close.ProductionOrderId != Id || close.Sequence != CloseCount + 1)
            throw new ArgumentException("The close does not follow this order's last close.", nameof(close));

        CloseCount++;
        ProducedQty += close.ProducedQty;
        TotalCost = InventoryMath.Round(TotalCost + close.TotalCost);
        UnitCost = ProducedQty > 0 ? InventoryMath.Round(TotalCost / ProducedQty) : 0;
        foreach (var line in close.Lines)
            _lines.Single(l => l.ComponentItemId == line.ComponentItemId).AddActual(line.ActualQty);

        if (close.Kind == ProductionCloseKind.Partial)
        {
            Status = ProductionOrderStatus.InProgress;
            return;
        }

        Status = ProductionOrderStatus.Completed;
        CompletedAt = close.ClosedAt;
        CompletedBy = close.ClosedBy;
        if (ProducedQty < PlannedQty)
        {
            ShortfallReason = shortfallReason;
            ShortfallNotes = string.IsNullOrWhiteSpace(shortfallNotes) ? null : shortfallNotes.Trim();
        }
    }

    private void Apply(ProductionOrderPlan plan, DateOnly today)
    {
        if (!plan.Recipe.IsActive)
            throw new BusinessRuleException("recipe_not_active", "La orden debe usar la receta activa del producto (RN-10).");
        if (plan.PlannedQty <= 0 || InventoryMath.Round(plan.PlannedQty) != plan.PlannedQty)
            throw new BusinessRuleException("invalid_quantity", "La cantidad planeada debe ser mayor que cero, con máximo 4 decimales.");
        if (plan.ScheduledDate < today)
            throw new BusinessRuleException("production_order_past_date", "La fecha programada no puede ser anterior a hoy.");

        RecipeId = plan.Recipe.Id;
        OutputItemId = plan.Recipe.OutputItemId;
        PlannedQty = plan.PlannedQty;
        ScheduledDate = plan.ScheduledDate;
        ProductionAreaId = plan.ProductionAreaId;
        Shift = plan.Shift;
        Notes = string.IsNullOrWhiteSpace(plan.Notes) ? null : plan.Notes.Trim();

        // RN-11 for the planned quantity.
        _lines.Clear();
        _lines.AddRange(plan.Recipe.Explode(plan.PlannedQty).Select(c => new ProductionOrderLine(Id, c.ComponentItemId, c.Quantity)));
    }
}

public class ProductionOrderLine : Entity
{
    private ProductionOrderLine() { }

    internal ProductionOrderLine(Guid orderId, Guid componentItemId, decimal theoreticalQty)
    {
        ProductionOrderId = orderId;
        ComponentItemId = componentItemId;
        TheoreticalQty = theoreticalQty;
    }

    public Guid ProductionOrderId { get; private set; }
    public Guid ComponentItemId { get; private set; }

    /// <summary>RN-11 for the planned quantity.</summary>
    public decimal TheoreticalQty { get; private set; }

    /// <summary>Real consumption accumulated over the closes.</summary>
    public decimal ActualQty { get; private set; }

    internal void AddActual(decimal quantity) => ActualQty += quantity;
}
