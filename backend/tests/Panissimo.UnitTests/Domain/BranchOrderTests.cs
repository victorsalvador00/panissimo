using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;

namespace Panissimo.UnitTests.Domain;

public class BranchOrderTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);

    private static BranchOrder Order(params BranchOrderLineInput[] lines) =>
        new("PED-000001", Guid.NewGuid(), Guid.NewGuid(), Today.AddDays(1), null,
            lines.Length > 0 ? lines : [new BranchOrderLineInput(Guid.NewGuid(), 100)], Today);

    private static BranchOrder Submitted(params BranchOrderLineInput[] lines)
    {
        var order = Order(lines);
        order.Submit(Today, Now, null);
        return order;
    }

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Theory]
    [InlineData(ItemType.FinishedGood, ItemPresentation.Bulk, true)]
    [InlineData(ItemType.Supply, null, true)]
    [InlineData(ItemType.FinishedGood, ItemPresentation.Packaged, false)]
    [InlineData(ItemType.SemiFinished, null, false)]
    [InlineData(ItemType.RawMaterial, null, false)]
    public void Branches_order_bulk_goods_and_supplies(ItemType type, ItemPresentation? presentation, bool expected) =>
        Assert.Equal(expected, BranchOrderRules.IsOrderable(type, presentation));

    [Theory]
    [InlineData(10, 50, 7, false, 43)]
    [InlineData(10, 50, 10, false, 40)]      // at the minimum
    [InlineData(10, 50, 9.5, true, 41)]      // pieces round up
    [InlineData(10, 50, 11, false, null)]    // above the minimum
    [InlineData(0, 0, 0, false, null)]       // nothing to reach
    public void Suggestion_reaches_the_maximum_when_at_or_below_the_minimum(
        decimal min, decimal max, decimal projected, bool pieces, int? expected) =>
        Assert.Equal(expected is null ? null : (decimal)expected, BranchOrderRules.Suggest(min, max, projected, pieces));

    [Fact]
    public void Required_date_cannot_be_in_the_past_and_items_do_not_repeat()
    {
        var item = Guid.NewGuid();
        Assert.Equal("required_date_past", Code(() =>
            new BranchOrder("PED-1", Guid.NewGuid(), Guid.NewGuid(), Today.AddDays(-1), null, [new BranchOrderLineInput(item, 1)], Today)));
        Assert.Equal("branch_order_line_duplicated", Code(() => Order(new BranchOrderLineInput(item, 1), new BranchOrderLineInput(item, 2))));
    }

    [Fact]
    public void Approval_covers_every_line_from_zero_to_requested_and_not_all_zero()
    {
        var order = Submitted(new BranchOrderLineInput(Guid.NewGuid(), 100), new BranchOrderLineInput(Guid.NewGuid(), 5));
        var (a, b) = (order.Lines[0].Id, order.Lines[1].Id);

        Assert.Equal("branch_order_approval_incomplete", Code(() => order.Approve([new BranchOrderApproval(a, 10)], Now, null)));
        Assert.Equal("branch_order_nothing_approved", Code(() => order.Approve([new(a, 0), new(b, 0)], Now, null)));
        Assert.Equal("invalid_approved_quantity", Code(() => order.Approve([new(a, 101), new(b, 0)], Now, null)));

        order.Approve([new(a, 80), new(b, 0)], Now, null);
        Assert.Equal((BranchOrderStatus.Approved, 80m, 0m), (order.Status, order.Lines[0].ApprovedQty!.Value, order.Lines[1].ApprovedQty!.Value));
    }

    [Fact]
    public void Dispatch_of_everything_approved_fulfills_and_less_partially_fulfills()
    {
        var item = Guid.NewGuid();
        var full = Submitted(new BranchOrderLineInput(item, 100), new BranchOrderLineInput(Guid.NewGuid(), 5));
        full.Approve([new(full.Lines[0].Id, 80), new(full.Lines[1].Id, 0)], Now, null);
        full.RegisterShipment(new Dictionary<Guid, decimal> { [item] = 80 });
        Assert.Equal(BranchOrderStatus.Fulfilled, full.Status); // the line approved in 0 needs nothing

        var partial = Submitted(new BranchOrderLineInput(item, 100));
        partial.Approve([new(partial.Lines[0].Id, 80)], Now, null);
        partial.RegisterShipment(new Dictionary<Guid, decimal> { [item] = 60 });
        Assert.Equal((BranchOrderStatus.PartiallyFulfilled, 60m), (partial.Status, partial.Lines[0].ShippedQty));
        Assert.Equal("invalid_branch_order_status", Code(() => partial.RegisterShipment(new Dictionary<Guid, decimal>())));
    }

    [Fact]
    public void Shipment_of_an_item_outside_the_order_fails()
    {
        var order = Submitted();
        order.Approve([new(order.Lines[0].Id, 1)], Now, null);
        Assert.Equal("transfer_item_not_in_order", Code(() => order.RegisterShipment(new Dictionary<Guid, decimal> { [Guid.NewGuid()] = 1 })));
    }

    [Fact]
    public void The_branch_cancels_only_draft_or_submitted_and_the_transfer_cancels_an_approved_order()
    {
        Order().Cancel(Now);
        Submitted().Cancel(Now);

        var approved = Submitted();
        approved.Approve([new(approved.Lines[0].Id, 1)], Now, null);
        Assert.Equal("invalid_branch_order_status", Code(() => approved.Cancel(Now)));
        approved.CancelWithTransfer(Now);
        Assert.Equal(BranchOrderStatus.Cancelled, approved.Status);
    }

    [Fact]
    public void Rejecting_needs_a_reason()
    {
        var order = Submitted();
        Assert.Equal("rejection_reason_required", Code(() => order.Reject("", Now, null)));
        order.Reject("Sin producción", Now, null);
        Assert.Equal(BranchOrderStatus.Rejected, order.Status);
    }
}
