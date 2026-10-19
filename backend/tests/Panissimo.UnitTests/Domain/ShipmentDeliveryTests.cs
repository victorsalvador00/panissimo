using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Sales;

namespace Panissimo.UnitTests.Domain;

/// <summary>RN-114: delivery of a shipment and what the customer rejects.</summary>
public class ShipmentDeliveryTests
{
    private static readonly DateOnly Today = new(2026, 10, 19);
    private static readonly DateTimeOffset Dispatched = new(2026, 10, 19, 8, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Now = Dispatched.AddHours(4);
    private static readonly Guid Plant = Guid.NewGuid();
    private static readonly Guid Bread = Guid.NewGuid();

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    /// <summary>An order of 100 pieces, fully shipped (no lots) at 2.5 each.</summary>
    private static (CustomerOrder Order, CustomerShipment Shipment) DispatchedShipment()
    {
        var order = new CustomerOrder("PC-000001", Guid.NewGuid(), Plant,
            new CustomerOrderPlan(null, Today, null, null, [new CustomerOrderLineInput(Bread, 100, null)]), Today);
        order.Confirm(Today, Dispatched, null);
        var shipment = new CustomerShipment("RM-000001", order, [new CustomerShipmentLineInput(order.Lines[0].Id, Bread, 100)]);
        var state = new PostingState
        {
            Items = new Dictionary<Guid, PostingItem> { [Bread] = new(Bread, "PAN", "Pan", TracksLots: false, WholeQuantities: true) },
            Lots = new Dictionary<Guid, PostingLot>(),
            Balances = [],
            Costs = [],
            OccurredAt = Dispatched,
            BusinessDate = Today,
        };
        InventoryPostingCalculator.Calculate([new MovementRequest(Plant, Bread, null, MovementType.ProductionOutput, 100, 2.5m, "Test", Guid.NewGuid(), "T-1", null)], state);
        var result = InventoryPostingCalculator.Calculate(shipment.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>()), state);
        order.RegisterShipment(shipment.QuantitiesByOrderLine(), 0);
        shipment.Dispatch("Camioneta · ABC-1", "Juan", "Marta", Dispatched, null, result.Movements);
        return (order, shipment);
    }

    private static ShipmentRejectionInput Rejection(CustomerShipment s, decimal qty, RejectionDisposition disposition,
        ShipmentRejectionReason reason = ShipmentRejectionReason.Damaged, string? notes = null) =>
        new(s.Lines[0].Id, null, qty, reason, notes, disposition, disposition == RejectionDisposition.Return ? Plant : null);

    [Fact]
    public void Without_rejections_it_is_delivered()
    {
        var (_, shipment) = DispatchedShipment();
        shipment.Deliver(Now, " Marta López ", [], Now, null);
        Assert.Equal((CustomerShipmentStatus.Delivered, "Marta López", Now), (shipment.Status, shipment.ReceivedByName, shipment.DeliveredAt!.Value));
        Assert.True(shipment.IsDispatched);
        Assert.Equal("customer_shipment_not_dispatched", Code(() => shipment.Deliver(Now, "Otra", [], Now, null)));
    }

    [Fact]
    public void Rejections_keep_the_dispatch_cost_and_give_the_order_back_its_pending()
    {
        var (order, shipment) = DispatchedShipment();
        Assert.Equal(CustomerOrderStatus.Shipped, order.Status);

        shipment.Deliver(Now, "Marta", [Rejection(shipment, 10, RejectionDisposition.Return), Rejection(shipment, 5, RejectionDisposition.Loss)], Now, null);
        order.RegisterRejection(shipment.RejectedByOrderLine());

        Assert.Equal(CustomerShipmentStatus.DeliveredWithDiscrepancies, shipment.Status);
        Assert.Equal([(10m, 25m), (5m, 12.5m)], shipment.Rejections.Select(r => (r.Quantity, r.Value)));
        Assert.Equal((CustomerOrderStatus.PartiallyShipped, 85m, 15m), (order.Status, order.Lines[0].ShippedQty, order.Lines[0].PendingQty));
    }

    [Fact]
    public void A_closed_order_is_not_reopened()
    {
        var (order, shipment) = DispatchedShipment();
        shipment.Deliver(Now, "Marta", [Rejection(shipment, 10, RejectionDisposition.Loss)], Now, null);
        order.RegisterRejection(shipment.RejectedByOrderLine());
        order.Close("Cliente ya no lo quiere", Now, null);
        order.RegisterRejection(new Dictionary<Guid, decimal> { [order.Lines[0].Id] = 5 });
        Assert.Equal((CustomerOrderStatus.Closed, 90m), (order.Status, order.Lines[0].ShippedQty));
    }

    [Fact]
    public void Invalid_deliveries_are_refused()
    {
        var (_, shipment) = DispatchedShipment();
        Assert.Equal("delivery_date_invalid", Code(() => shipment.Deliver(Dispatched.AddMinutes(-1), "Marta", [], Now, null)));
        Assert.Equal("delivery_date_invalid", Code(() => shipment.Deliver(Now.AddMinutes(1), "Marta", [], Now, null)));
        Assert.Equal("delivery_received_by_required", Code(() => shipment.Deliver(Now, " ", [], Now, null)));
        Assert.Equal("rejection_over_shipped", Code(() => shipment.Deliver(Now, "Marta",
            [Rejection(shipment, 60, RejectionDisposition.Loss), Rejection(shipment, 41, RejectionDisposition.Return)], Now, null)));
        Assert.Equal("rejection_notes_required", Code(() => shipment.Deliver(Now, "Marta",
            [Rejection(shipment, 1, RejectionDisposition.Loss, ShipmentRejectionReason.Other)], Now, null)));
        Assert.Equal("rejection_return_location", Code(() => shipment.Deliver(Now, "Marta",
            [Rejection(shipment, 1, RejectionDisposition.Loss) with { ReturnLocationId = Plant }], Now, null)));
        Assert.Equal("rejection_lot_invalid", Code(() => shipment.Deliver(Now, "Marta",
            [Rejection(shipment, 1, RejectionDisposition.Loss) with { LotId = Guid.NewGuid() }], Now, null)));
        Assert.Equal(CustomerShipmentStatus.Dispatched, shipment.Status);
        Assert.Empty(shipment.Rejections);
    }
}
