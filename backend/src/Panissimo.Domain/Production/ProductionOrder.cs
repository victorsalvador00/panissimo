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
}
