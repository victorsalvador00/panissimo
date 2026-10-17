using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;

namespace Panissimo.Domain.Sales;

public enum CustomerShipmentStatus
{
    Draft,
    Dispatched,
    Cancelled,
}

/// <param name="Quantity">In base unit; 0 leaves the line out of the dispatch.</param>
public sealed record CustomerShipmentLineInput(Guid CustomerOrderLineId, Guid ItemId, decimal Quantity);

/// <summary>
/// Delivery note of a customer order (dominio §4.6, RN-81): Draft → Dispatched; Cancelled only in Draft. Not an invoice
/// and creates no receivable (RN-83).
/// </summary>
[Audited]
public class CustomerShipment : AuditableEntity, IVersioned
{
    public const string DocType = "CustomerShipment";
    public const int NotesMaxLength = 500;

    private readonly List<CustomerShipmentLine> _lines = [];

    private CustomerShipment() { }

    /// <summary>RN-81: created from the order, in draft, prefilled by the caller with the balance of each line.</summary>
    public CustomerShipment(string folio, CustomerOrder order, IReadOnlyList<CustomerShipmentLineInput> lines)
    {
        if (order.Status is not (CustomerOrderStatus.Confirmed or CustomerOrderStatus.PartiallyShipped))
            throw new BusinessRuleException("customer_order_not_shippable",
                "Solo se remisiona un pedido confirmado o parcialmente remisionado (RN-81).");
        Folio = folio;
        CustomerOrderId = order.Id;
        CustomerId = order.CustomerId;
        DeliveryPointId = order.DeliveryPointId;
        FromLocationId = order.SupplyingLocationId;
        Status = CustomerShipmentStatus.Draft;
        SetLines(lines);
    }

    public string Folio { get; private set; } = null!;
    public Guid CustomerOrderId { get; private set; }
    public Guid CustomerId { get; private set; }
    public Guid? DeliveryPointId { get; private set; }

    /// <summary>The plant.</summary>
    public Guid FromLocationId { get; private set; }

    public CustomerShipmentStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public string? VehicleDescription { get; private set; }
    public string? DriverName { get; private set; }

    /// <summary>Who signs as received at the customer, optional.</summary>
    public string? ReceivedByName { get; private set; }

    public DateTimeOffset? DispatchedAt { get; private set; }
    public Guid? DispatchedBy { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<CustomerShipmentLine> Lines => _lines;

    public void UpdateDraft(string? notes, IReadOnlyDictionary<Guid, decimal> quantitiesByLine)
    {
        EnsureDraft("Solo una remisión en borrador puede editarse; una despachada ya no (RN-81).");
        if (quantitiesByLine.Keys.Any(id => _lines.All(l => l.Id != id)))
            throw new BusinessRuleException("customer_shipment_line_not_found", "Una línea indicada no pertenece a la remisión.");
        var inputs = _lines.Select(l => new CustomerShipmentLineInput(l.CustomerOrderLineId, l.ItemId,
            quantitiesByLine.TryGetValue(l.Id, out var qty) ? qty : l.Quantity)).ToList();
        EnsureSomething(inputs);
        foreach (var (line, input) in _lines.Zip(inputs))
            line.SetQuantity(input.Quantity);
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
    }

    public void Cancel(DateTimeOffset now)
    {
        EnsureDraft("Solo una remisión en borrador puede cancelarse; una despachada ya no (RN-81).");
        Status = CustomerShipmentStatus.Cancelled;
        CancelledAt = now;
    }

    /// <summary>Quantity to ship per order line (lines in 0 are left out).</summary>
    public IReadOnlyDictionary<Guid, decimal> QuantitiesByOrderLine() =>
        _lines.Where(l => l.Quantity > 0).ToDictionary(l => l.CustomerOrderLineId, l => l.Quantity);

    /// <summary>
    /// CustomerShipment exits at the plant (RN-81): the lots chosen per line, which must add up to its quantity, or FEFO.
    /// </summary>
    /// <param name="sourceOf">RN-45: stock location each line leaves (the plant or one of its sub-warehouses); null = the plant.</param>
    public IReadOnlyList<MovementRequest> DispatchRequests(IReadOnlyDictionary<Guid, IReadOnlyList<LotQuantity>> chosenLots,
        Func<Guid, Guid>? sourceOf = null)
    {
        EnsureDraft("Solo una remisión en borrador puede despacharse.");
        if (chosenLots.Keys.Any(id => _lines.All(l => l.Id != id || l.Quantity == 0)))
            throw new BusinessRuleException("customer_shipment_line_not_found", "Una línea indicada no pertenece a la remisión o va en cero.");

        var requests = new List<MovementRequest>();
        foreach (var line in _lines.Where(l => l.Quantity > 0))
        {
            if (chosenLots.TryGetValue(line.Id, out var lots) && lots.Count > 0)
            {
                if (lots.Sum(l => l.Qty) != line.Quantity || lots.Any(l => l.Qty <= 0))
                    throw new BusinessRuleException("lots_mismatch", "La suma de los lotes elegidos debe ser igual a la cantidad de la línea.");
                requests.AddRange(lots.Select(l => Out(line.Id, line.ItemId, l.LotId, l.Qty)));
            }
            else
            {
                requests.Add(Out(line.Id, line.ItemId, null, line.Quantity));
            }
        }
        return requests;

        MovementRequest Out(Guid lineId, Guid itemId, Guid? lotId, decimal qty) =>
            new(sourceOf?.Invoke(lineId) ?? FromLocationId, itemId, lotId, MovementType.CustomerShipment, -qty, null, DocType, Id, Folio, $"Remisión {Folio}");
    }

    /// <summary>Records the shipment: lots actually taken and the average cost per line, from the posted movements.</summary>
    public void Dispatch(string vehicleDescription, string driverName, string? receivedByName, DateTimeOffset now, Guid? userId,
        IReadOnlyList<InventoryMovement> movements)
    {
        EnsureDraft("Solo una remisión en borrador puede despacharse.");
        if (string.IsNullOrWhiteSpace(vehicleDescription) || string.IsNullOrWhiteSpace(driverName))
            throw new BusinessRuleException("shipment_shipping_required", "Indica el vehículo y el chofer del despacho.");
        if (movements.Count == 0 || movements.Any(m => m.Type != MovementType.CustomerShipment || m.SourceDocId != Id))
            throw new ArgumentException("Dispatch needs the CustomerShipment movements of this shipment.", nameof(movements));

        foreach (var line in _lines.Where(l => l.Quantity > 0))
            line.RecordDispatch(movements.Where(m => m.ItemId == line.ItemId).ToList());

        VehicleDescription = vehicleDescription.Trim();
        DriverName = driverName.Trim();
        ReceivedByName = string.IsNullOrWhiteSpace(receivedByName) ? null : receivedByName.Trim();
        DispatchedAt = now;
        DispatchedBy = userId;
        Status = CustomerShipmentStatus.Dispatched;
    }

    private void SetLines(IReadOnlyList<CustomerShipmentLineInput> lines)
    {
        if (lines.GroupBy(l => l.CustomerOrderLineId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("customer_shipment_line_duplicated", "Hay líneas repetidas en la remisión.");
        _lines.Clear();
        _lines.AddRange(lines.Select(l => new CustomerShipmentLine(Id, l)));
        EnsureSomething(lines);
    }

    private static void EnsureSomething(IReadOnlyList<CustomerShipmentLineInput> lines)
    {
        if (lines.Any(l => l.Quantity < 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades no pueden ser negativas y admiten máximo 4 decimales.");
        if (lines.All(l => l.Quantity == 0))
            throw new BusinessRuleException("customer_shipment_empty", "La remisión debe llevar al menos una cantidad mayor que cero.");
    }

    private void EnsureDraft(string message)
    {
        if (Status != CustomerShipmentStatus.Draft)
            throw new BusinessRuleException("customer_shipment_not_draft", message);
    }
}

public class CustomerShipmentLine : Entity
{
    private readonly List<CustomerShipmentLineLot> _lots = [];

    private CustomerShipmentLine() { }

    internal CustomerShipmentLine(Guid shipmentId, CustomerShipmentLineInput input)
    {
        ShipmentId = shipmentId;
        CustomerOrderLineId = input.CustomerOrderLineId;
        ItemId = input.ItemId;
        Quantity = input.Quantity;
    }

    public Guid ShipmentId { get; private set; }
    public Guid CustomerOrderLineId { get; private set; }

    /// <summary>Where it left: the plant or one of its sub-warehouses (RN-45); set on dispatch.</summary>
    public Guid? LocationId { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In base unit.</summary>
    public decimal Quantity { get; private set; }

    /// <summary>Weighted average cost of what was taken (RN-81); null until dispatched.</summary>
    public decimal? UnitCost { get; private set; }

    public IReadOnlyList<CustomerShipmentLineLot> Lots => _lots;

    internal void SetQuantity(decimal quantity) => Quantity = quantity;

    internal void RecordDispatch(IReadOnlyList<InventoryMovement> movements)
    {
        LocationId = movements.Select(m => m.LocationId).FirstOrDefault();
        var total = -movements.Sum(m => m.Quantity);
        UnitCost = total == 0 ? 0 : InventoryMath.Round(movements.Sum(m => -m.Quantity * m.UnitCost) / total);
        _lots.Clear();
        _lots.AddRange(movements.Where(m => m.LotId is not null)
            .GroupBy(m => m.LotId!.Value)
            .Select(g => new CustomerShipmentLineLot(Id, g.Key, -g.Sum(m => m.Quantity))));
    }
}

/// <summary>Quantity of a lot taken by a shipment line.</summary>
public class CustomerShipmentLineLot : Entity
{
    private CustomerShipmentLineLot() { }

    internal CustomerShipmentLineLot(Guid lineId, Guid lotId, decimal quantity)
    {
        LineId = lineId;
        LotId = lotId;
        Quantity = quantity;
    }

    public Guid LineId { get; private set; }
    public Guid LotId { get; private set; }
    public decimal Quantity { get; private set; }
}
