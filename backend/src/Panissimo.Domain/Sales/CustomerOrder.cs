using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Domain.Sales;

public enum CustomerOrderStatus
{
    Draft,
    Confirmed,
    PartiallyShipped,
    Shipped,
    Closed,
    Cancelled,
}

/// <param name="Quantity">In base unit.</param>
/// <param name="UnitPrice">Without VAT, informative (D-06).</param>
public sealed record CustomerOrderLineInput(Guid ItemId, decimal Quantity, decimal? UnitPrice);

/// <summary>Editable header of a customer order.</summary>
public sealed record CustomerOrderPlan(
    Guid? DeliveryPointId,
    DateOnly RequiredDate,
    string? CustomerReference,
    string? Notes,
    IReadOnlyList<CustomerOrderLineInput> Lines);

/// <summary>
/// Order of a third-party customer (dominio §4.6, RN-80, RN-82): Draft → Confirmed → PartiallyShipped → Shipped;
/// Closed (with balance, from PartiallyShipped) and Cancelled (Draft or Confirmed with nothing shipped).
/// </summary>
[Audited]
public class CustomerOrder : AuditableEntity, IVersioned
{
    public const string DocType = "CustomerOrder";
    public const int NotesMaxLength = 500;
    public const int ReferenceMaxLength = 50;

    private readonly List<CustomerOrderLine> _lines = [];

    private CustomerOrder() { }

    public CustomerOrder(string folio, Guid customerId, Guid supplyingLocationId, CustomerOrderPlan plan, DateOnly today)
    {
        Folio = folio;
        CustomerId = customerId;
        SupplyingLocationId = supplyingLocationId;
        Status = CustomerOrderStatus.Draft;
        SetPlan(plan, today);
    }

    public string Folio { get; private set; } = null!;
    public Guid CustomerId { get; private set; }
    public Guid? DeliveryPointId { get; private set; }

    /// <summary>The plant.</summary>
    public Guid SupplyingLocationId { get; private set; }

    public DateOnly RequiredDate { get; private set; }

    /// <summary>The customer's own purchase order number.</summary>
    public string? CustomerReference { get; private set; }

    public CustomerOrderStatus Status { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset? ConfirmedAt { get; private set; }
    public Guid? ConfirmedBy { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }
    public Guid? ClosedBy { get; private set; }
    public string? CloseReason { get; private set; }
    public uint Version { get; private set; }
    public IReadOnlyList<CustomerOrderLine> Lines => _lines;

    /// <summary>RN-80: a confirmed order is not edited; if it changes, it is cancelled and captured again.</summary>
    public void UpdateDraft(CustomerOrderPlan plan, DateOnly today)
    {
        EnsureStatus("Solo un pedido en borrador puede editarse; uno confirmado se cancela y se captura de nuevo (RN-80).",
            CustomerOrderStatus.Draft);
        SetPlan(plan, today);
    }

    /// <summary>RN-80: the confirmed order becomes demand of the production plan.</summary>
    public void Confirm(DateOnly today, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo un pedido en borrador puede confirmarse.", CustomerOrderStatus.Draft);
        EnsureNotPast(RequiredDate, today);
        Status = CustomerOrderStatus.Confirmed;
        ConfirmedAt = now;
        ConfirmedBy = userId;
    }

    /// <summary>RN-80: in Draft, or Confirmed with nothing shipped.</summary>
    public void Cancel(DateTimeOffset now)
    {
        EnsureStatus("Solo se cancela un pedido en borrador o confirmado sin remisiones.", CustomerOrderStatus.Draft, CustomerOrderStatus.Confirmed);
        if (_lines.Any(l => l.ShippedQty > 0))
            throw new BusinessRuleException("invalid_customer_order_status", "El pedido ya tiene remisiones: ciérralo con saldo.");
        Status = CustomerOrderStatus.Cancelled;
        CancelledAt = now;
    }

    /// <summary>RN-82: a partially shipped order may be closed with its balance, with a reason.</summary>
    public void Close(string reason, DateTimeOffset now, Guid? userId)
    {
        EnsureStatus("Solo se cierra con saldo un pedido parcialmente remisionado.", CustomerOrderStatus.PartiallyShipped);
        if (string.IsNullOrWhiteSpace(reason))
            throw new BusinessRuleException("close_reason_required", "Indica el motivo del cierre con saldo.");
        Status = CustomerOrderStatus.Closed;
        CloseReason = reason.Trim();
        ClosedAt = now;
        ClosedBy = userId;
    }

    private void SetPlan(CustomerOrderPlan plan, DateOnly today)
    {
        EnsureNotPast(plan.RequiredDate, today);
        if (plan.Lines.Count == 0)
            throw new BusinessRuleException("customer_order_without_lines", "El pedido debe tener al menos una línea.");
        if (plan.Lines.Any(l => l.Quantity <= 0 || InventoryMath.Round(l.Quantity) != l.Quantity))
            throw new BusinessRuleException("invalid_quantity", "Las cantidades deben ser mayores que cero, con máximo 4 decimales.");
        if (plan.Lines.Any(l => l.UnitPrice < 0))
            throw new BusinessRuleException("invalid_price", "El precio no puede ser negativo.");
        if (plan.Lines.GroupBy(l => l.ItemId).Any(g => g.Count() > 1))
            throw new BusinessRuleException("customer_order_line_duplicated", "Hay artículos repetidos en el pedido (RN-80).");

        DeliveryPointId = plan.DeliveryPointId;
        RequiredDate = plan.RequiredDate;
        CustomerReference = string.IsNullOrWhiteSpace(plan.CustomerReference) ? null : plan.CustomerReference.Trim();
        Notes = string.IsNullOrWhiteSpace(plan.Notes) ? null : plan.Notes.Trim();
        _lines.Clear();
        _lines.AddRange(plan.Lines.Select((l, i) => new CustomerOrderLine(Id, i + 1, l.ItemId, l.Quantity, l.UnitPrice)));
    }

    private static void EnsureNotPast(DateOnly requiredDate, DateOnly today)
    {
        if (requiredDate < today)
            throw new BusinessRuleException("required_date_past", "La fecha requerida no puede ser anterior a hoy (RN-80).");
    }

    private void EnsureStatus(string message, params CustomerOrderStatus[] allowed)
    {
        if (!allowed.Contains(Status))
            throw new BusinessRuleException("invalid_customer_order_status", message);
    }
}

public class CustomerOrderLine : Entity
{
    private CustomerOrderLine() { }

    internal CustomerOrderLine(Guid customerOrderId, int lineNumber, Guid itemId, decimal quantity, decimal? unitPrice)
    {
        CustomerOrderId = customerOrderId;
        LineNumber = lineNumber;
        ItemId = itemId;
        Quantity = quantity;
        UnitPrice = unitPrice;
    }

    public Guid CustomerOrderId { get; private set; }
    public int LineNumber { get; private set; }
    public Guid ItemId { get; private set; }

    /// <summary>In base unit.</summary>
    public decimal Quantity { get; private set; }

    public decimal ShippedQty { get; private set; }

    /// <summary>Without VAT, informative (D-06).</summary>
    public decimal? UnitPrice { get; private set; }

    public decimal PendingQty => Math.Max(0, Quantity - ShippedQty);
}
