using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Domain.Production;

public enum ProductionOrderStatus
{
    Draft,
    Released,
    Completed,
    Cancelled,
}

public sealed record ComponentLotInput(Guid LotId, decimal Quantity);

/// <param name="ActualQty">Real consumption; null = theoretical for the produced quantity.</param>
/// <param name="Lots">Lots chosen by the user; null or empty = FEFO (RN-05).</param>
public sealed record ComponentConsumptionInput(Guid ComponentItemId, decimal? ActualQty, IReadOnlyList<ComponentLotInput>? Lots);

/// <summary>
/// Production order (dominio §4.4): Draft → Released → Completed | Cancelled.
/// Keeps the exact recipe version it was created with (RN-10). Completing it is one transaction (RN-12).
/// </summary>
[Audited]
public class ProductionOrder : AuditableEntity, IVersioned
{
    public const string DocType = "ProductionOrder";

    private readonly List<ProductionOrderLine> _lines = [];

    private ProductionOrder() { }

    public ProductionOrder(string folio, Guid locationId, Recipe recipe, decimal plannedQty, DateOnly scheduledDate, string? notes)
    {
        Folio = folio;
        LocationId = locationId;
        RecipeId = recipe.Id;
        OutputItemId = recipe.OutputItemId;
        Status = ProductionOrderStatus.Draft;
        Plan(recipe, plannedQty, scheduledDate, notes);
    }

    public string Folio { get; private set; } = null!;
    public Guid LocationId { get; private set; }
    public Guid RecipeId { get; private set; }
    public Guid OutputItemId { get; private set; }
    public decimal PlannedQty { get; private set; }
    public decimal? ProducedQty { get; private set; }
    public DateOnly ScheduledDate { get; private set; }
    public ProductionOrderStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset? ReleasedAt { get; private set; }
    public Guid? OutputLotId { get; private set; }

    /// <summary>RN-12: total consumed cost / produced quantity.</summary>
    public decimal? UnitCost { get; private set; }

    public DateTimeOffset? CompletedAt { get; private set; }
    public Guid? CompletedBy { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<ProductionOrderLine> Lines => _lines;

    public void UpdateDraft(Recipe recipe, decimal plannedQty, DateOnly scheduledDate, string? notes)
    {
        EnsureStatus(ProductionOrderStatus.Draft, "Solo una orden en borrador puede editarse.");
        Plan(recipe, plannedQty, scheduledDate, notes);
    }

    public void Release(DateTimeOffset now)
    {
        EnsureStatus(ProductionOrderStatus.Draft, "Solo una orden en borrador puede liberarse.");
        Status = ProductionOrderStatus.Released;
        ReleasedAt = now;
    }

    public void Cancel()
    {
        if (Status is not (ProductionOrderStatus.Draft or ProductionOrderStatus.Released))
            throw new BusinessRuleException("production_order_finished", "La orden ya está completada o cancelada.");
        Status = ProductionOrderStatus.Cancelled;
    }

    /// <summary>
    /// RN-12 step 1: ProductionConsumption exits for the real consumption of each component
    /// (default: theoretical for the produced quantity), with chosen lots or FEFO.
    /// </summary>
    public IReadOnlyList<MovementRequest> ConsumptionRequests(Recipe recipe, decimal producedQty, IReadOnlyList<ComponentConsumptionInput> inputs)
    {
        EnsureCanComplete(recipe, producedQty);
        var components = _lines.Select(l => l.ComponentItemId).ToHashSet();
        if (inputs.Any(i => !components.Contains(i.ComponentItemId)))
            throw new BusinessRuleException("production_unknown_component", "Solo pueden consumirse los componentes de la receta de la orden.");
        if (inputs.Select(i => i.ComponentItemId).Distinct().Count() != inputs.Count)
            throw new BusinessRuleException("production_duplicated_component", "Hay componentes repetidos en el consumo.");

        var theoretical = recipe.Explode(producedQty).ToDictionary(c => c.ComponentItemId, c => c.Quantity);
        var requests = new List<MovementRequest>();
        foreach (var line in _lines)
        {
            var input = inputs.SingleOrDefault(i => i.ComponentItemId == line.ComponentItemId);
            var actual = input?.ActualQty ?? theoretical[line.ComponentItemId];
            if (actual < 0 || InventoryMath.Round(actual) != actual)
                throw new BusinessRuleException("invalid_quantity", "El consumo real no puede ser negativo y admite máximo 4 decimales.");
            if (actual == 0)
                continue;

            if (input?.Lots is { Count: > 0 } lots)
            {
                if (lots.Sum(l => l.Quantity) != actual || lots.Any(l => l.Quantity <= 0))
                    throw new BusinessRuleException("production_lots_mismatch", "La suma de los lotes elegidos debe ser igual al consumo real del componente.");
                requests.AddRange(lots.Select(l => Consume(line.ComponentItemId, l.LotId, l.Quantity)));
            }
            else
            {
                requests.Add(Consume(line.ComponentItemId, null, actual));
            }
        }
        return requests;

        MovementRequest Consume(Guid itemId, Guid? lotId, decimal qty) =>
            new(LocationId, itemId, lotId, MovementType.ProductionConsumption, -qty, null, DocType, Id, Folio, $"Consumo de {Folio}");
    }

    /// <summary>
    /// RN-12 steps 2–3: records consumption and cost, closes the order and returns the ProductionOutput entry
    /// valued at total consumed cost / produced quantity. RN-13: waste is reported per line, without movements.
    /// </summary>
    public MovementRequest Complete(Recipe recipe, decimal producedQty, IReadOnlyList<InventoryMovement> consumption,
        Guid? outputLotId, DateTimeOffset now, Guid? userId)
    {
        EnsureCanComplete(recipe, producedQty);
        if (consumption.Any(m => m.Type != MovementType.ProductionConsumption || m.SourceDocId != Id))
            throw new ArgumentException("Complete needs the ProductionConsumption movements of this order.", nameof(consumption));

        var theoretical = recipe.Explode(producedQty).ToDictionary(c => c.ComponentItemId, c => c.Quantity);
        foreach (var line in _lines)
            line.RecordConsumption(theoretical[line.ComponentItemId], consumption.Where(m => m.ItemId == line.ComponentItemId).ToList());

        var totalCost = -consumption.Sum(m => m.TotalCost);
        ProducedQty = producedQty;
        UnitCost = InventoryMath.Round(totalCost / producedQty);
        OutputLotId = outputLotId;
        CompletedAt = now;
        CompletedBy = userId;
        Status = ProductionOrderStatus.Completed;

        return new MovementRequest(LocationId, OutputItemId, outputLotId, MovementType.ProductionOutput, producedQty, UnitCost,
            DocType, Id, Folio, $"Producción {Folio}");
    }

    private void EnsureCanComplete(Recipe recipe, decimal producedQty)
    {
        EnsureStatus(ProductionOrderStatus.Released, "Solo una orden liberada puede completarse.");
        if (recipe.Id != RecipeId)
            throw new ArgumentException("The order must be completed with its own recipe version.", nameof(recipe));
        if (producedQty <= 0 || InventoryMath.Round(producedQty) != producedQty)
            throw new BusinessRuleException("production_invalid_quantity", "La cantidad producida debe ser mayor que cero, con máximo 4 decimales (RN-14).");
    }

    private void Plan(Recipe recipe, decimal plannedQty, DateOnly scheduledDate, string? notes)
    {
        if (recipe.Id != RecipeId)
            throw new ArgumentException("The order keeps the recipe version it was created with (RN-10).", nameof(recipe));
        if (plannedQty <= 0 || InventoryMath.Round(plannedQty) != plannedQty)
            throw new BusinessRuleException("production_invalid_quantity", "La cantidad planeada debe ser mayor que cero, con máximo 4 decimales.");

        PlannedQty = plannedQty;
        ScheduledDate = scheduledDate;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        _lines.Clear();
        _lines.AddRange(recipe.Explode(plannedQty).Select(c => new ProductionOrderLine(Id, c.ComponentItemId, c.Quantity)));
    }

    private void EnsureStatus(ProductionOrderStatus expected, string message)
    {
        if (Status != expected)
            throw new BusinessRuleException("production_order_invalid_status", message);
    }
}

public class ProductionOrderLine : Entity
{
    private readonly List<ProductionOrderLineLot> _lots = [];

    private ProductionOrderLine() { }

    internal ProductionOrderLine(Guid orderId, Guid componentItemId, decimal theoreticalQty)
    {
        OrderId = orderId;
        ComponentItemId = componentItemId;
        TheoreticalQty = theoreticalQty;
    }

    public Guid OrderId { get; private set; }
    public Guid ComponentItemId { get; private set; }

    /// <summary>RN-11: theoretical consumption for the planned quantity.</summary>
    public decimal TheoreticalQty { get; private set; }

    /// <summary>Theoretical consumption for the quantity actually produced; the base of RN-13 waste.</summary>
    public decimal? TheoreticalProducedQty { get; private set; }

    public decimal? ActualQty { get; private set; }
    public decimal? UnitCost { get; private set; }
    public decimal? TotalCost { get; private set; }
    public IReadOnlyList<ProductionOrderLineLot> Lots => _lots;

    /// <summary>RN-13: real − theoretical for the produced quantity (positive = used more than expected).</summary>
    public decimal? WasteQty => ActualQty - TheoreticalProducedQty;

    internal void RecordConsumption(decimal theoreticalProduced, IReadOnlyList<InventoryMovement> movements)
    {
        TheoreticalProducedQty = theoreticalProduced;
        ActualQty = -movements.Sum(m => m.Quantity);
        TotalCost = -movements.Sum(m => m.TotalCost);
        UnitCost = ActualQty > 0 ? InventoryMath.Round(TotalCost.Value / ActualQty.Value) : null;
        _lots.Clear();
        _lots.AddRange(movements.Where(m => m.LotId is not null)
            .GroupBy(m => m.LotId!.Value)
            .Select(g => new ProductionOrderLineLot(Id, g.Key, -g.Sum(m => m.Quantity))));
    }
}

public class ProductionOrderLineLot : Entity
{
    private ProductionOrderLineLot() { }

    internal ProductionOrderLineLot(Guid lineId, Guid lotId, decimal quantity)
    {
        LineId = lineId;
        LotId = lotId;
        Quantity = quantity;
    }

    public Guid LineId { get; private set; }
    public Guid LotId { get; private set; }
    public decimal Quantity { get; private set; }
}
