using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Sales;

namespace Panissimo.UnitTests.Domain;

public class CustomerShipmentTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);

    private static CustomerOrder Confirmed(params CustomerOrderLineInput[] lines)
    {
        var order = new CustomerOrder("PC-000001", Guid.NewGuid(), Guid.NewGuid(),
            new CustomerOrderPlan(null, Today.AddDays(1), null, null, lines.Length > 0 ? lines : [new CustomerOrderLineInput(Guid.NewGuid(), 10, null)]),
            Today);
        order.Confirm(Today, Now, null);
        return order;
    }

    private static CustomerShipment Shipment(CustomerOrder order) =>
        new("RM-000001", order, order.Lines.Select(l => new CustomerShipmentLineInput(l.Id, l.ItemId, l.PendingQty)).ToList());

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Fact]
    public void Only_confirmed_or_partially_shipped_orders_get_shipments()
    {
        var draft = new CustomerOrder("PC-1", Guid.NewGuid(), Guid.NewGuid(),
            new CustomerOrderPlan(null, Today, null, null, [new CustomerOrderLineInput(Guid.NewGuid(), 1, null)]), Today);
        Assert.Equal("customer_order_not_shippable", Code(() => Shipment(draft)));
        Assert.Equal(CustomerShipmentStatus.Draft, Shipment(Confirmed()).Status);
    }

    [Fact]
    public void Order_advances_to_partially_shipped_and_shipped()
    {
        var order = Confirmed();
        var line = order.Lines[0].Id;
        order.RegisterShipment(new Dictionary<Guid, decimal> { [line] = 4 }, 0);
        Assert.Equal((CustomerOrderStatus.PartiallyShipped, 4m, 6m), (order.Status, order.Lines[0].ShippedQty, order.Lines[0].PendingQty));
        order.RegisterShipment(new Dictionary<Guid, decimal> { [line] = 6 }, 0);
        Assert.Equal(CustomerOrderStatus.Shipped, order.Status);
        Assert.Equal("customer_order_not_shippable", Code(() => order.RegisterShipment(new Dictionary<Guid, decimal> { [line] = 1 }, 100)));
    }

    [Fact]
    public void Shipping_beyond_the_tolerance_fails_and_changes_nothing()
    {
        var order = Confirmed();
        var line = order.Lines[0];
        Assert.Equal("shipment_over_tolerance", Code(() => order.RegisterShipment(new Dictionary<Guid, decimal> { [line.Id] = 10.5m }, 0)));
        Assert.Equal(0m, line.ShippedQty);
        Assert.Equal(11m, line.RemainingWithTolerance(10));
        order.RegisterShipment(new Dictionary<Guid, decimal> { [line.Id] = 11 }, 10);
        Assert.Equal((CustomerOrderStatus.Shipped, 0m), (order.Status, line.RemainingWithTolerance(10)));
    }

    [Fact]
    public void A_draft_needs_something_to_ship_and_lines_in_zero_are_left_out()
    {
        var order = Confirmed(new CustomerOrderLineInput(Guid.NewGuid(), 10, null), new CustomerOrderLineInput(Guid.NewGuid(), 5, null));
        var shipment = Shipment(order);
        var (a, b) = (shipment.Lines[0].Id, shipment.Lines[1].Id);

        Assert.Equal("customer_shipment_empty", Code(() => shipment.UpdateDraft(null, new Dictionary<Guid, decimal> { [a] = 0, [b] = 0 })));
        Assert.Equal(10m, shipment.Lines[0].Quantity); // unchanged after the failed edit
        shipment.UpdateDraft("Andén 2", new Dictionary<Guid, decimal> { [b] = 0 });

        Assert.Equal([order.Lines[0].Id], shipment.QuantitiesByOrderLine().Keys);
        var requests = shipment.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>());
        Assert.Equal(-10m, requests.Single().Quantity);
        Assert.Null(requests.Single().LotId); // FEFO
    }

    [Fact]
    public void Chosen_lots_must_add_up_to_the_line()
    {
        var shipment = Shipment(Confirmed());
        var line = shipment.Lines[0].Id;
        Assert.Equal("lots_mismatch", Code(() => shipment.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>
            { [line] = [new LotQuantity(Guid.NewGuid(), 6)] })));
        var requests = shipment.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>
            { [line] = [new LotQuantity(Guid.NewGuid(), 6), new LotQuantity(Guid.NewGuid(), 4)] });
        Assert.Equal(2, requests.Count);
    }

    [Fact]
    public void Only_drafts_are_cancelled()
    {
        var shipment = Shipment(Confirmed());
        shipment.Cancel(Now);
        Assert.Equal(CustomerShipmentStatus.Cancelled, shipment.Status);
        Assert.Equal("customer_shipment_not_draft", Code(() => shipment.Cancel(Now)));
        Assert.Equal("customer_shipment_not_draft", Code(() => shipment.UpdateDraft(null, new Dictionary<Guid, decimal>())));
    }
}
