using Sgo.Domain.Common;
using Sgo.Domain.Logistics;

namespace Sgo.UnitTests.Domain.Logistics;

public class BranchOrderTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 24, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid User = Guid.NewGuid();
    private static readonly Guid Branch = Guid.NewGuid();
    private static readonly Guid Commissary = Guid.NewGuid();
    private static readonly Guid Bread = Guid.NewGuid();
    private static readonly Guid Milk = Guid.NewGuid();

    /// <summary>Bread 24, milk 10.</summary>
    private static BranchOrder New() =>
        new("PED-000001", Branch, Commissary, new DateOnly(2026, 9, 26), null,
            [new BranchOrderLineInput(Bread, 24), new BranchOrderLineInput(Milk, 10)]);

    private static BranchOrder Submitted()
    {
        var order = New();
        order.Submit(Now, User);
        return order;
    }

    private static LineApproval[] Approvals(BranchOrder order, decimal bread, decimal milk) =>
    [
        new(order.Lines.Single(l => l.ItemId == Bread).Id, bread),
        new(order.Lines.Single(l => l.ItemId == Milk).Id, milk),
    ];

    private static BranchOrder InStatus(BranchOrderStatus status)
    {
        var order = New();
        if (status == BranchOrderStatus.Draft) return order;
        if (status == BranchOrderStatus.Cancelled) { order.Cancel(); return order; }
        order.Submit(Now, User);
        if (status == BranchOrderStatus.Submitted) return order;
        if (status == BranchOrderStatus.Rejected) { order.Reject("No", Now, User); return order; }
        order.Approve(Approvals(order, 24, 10), Now, User);
        if (status == BranchOrderStatus.Approved) return order;
        order.RegisterShipment(new Dictionary<Guid, decimal> { [Bread] = 24, [Milk] = status == BranchOrderStatus.Fulfilled ? 10 : 5 }, Now);
        return order;
    }

    public static TheoryData<BranchOrderStatus> AllStatuses() => [.. Enum.GetValues<BranchOrderStatus>()];

    [Fact]
    public void Approval_returns_the_transfer_lines_with_what_was_approved()
    {
        var order = Submitted();

        var lines = order.Approve(Approvals(order, 20, 0), Now, User);

        Assert.Equal((BranchOrderStatus.Approved, User), (order.Status, order.ApprovedBy!.Value));
        var line = Assert.Single(lines); // milk approved at 0 is not shipped
        Assert.Equal((Bread, 20m, (Guid?)null), (line.ItemId, line.Quantity, line.LotId));
        Assert.Equal(new Dictionary<Guid, decimal> { [Bread] = 20 }, order.ApprovedByItem());
    }

    [Theory]
    [InlineData(25, 10)]   // more than requested
    [InlineData(-1, 10)]
    [InlineData(1.00001, 10)]
    public void Approved_quantity_goes_from_zero_to_the_requested(decimal bread, decimal milk)
    {
        var order = Submitted();
        Assert.Equal("branch_order_invalid_approved_qty", Assert.Throws<BusinessRuleException>(() => order.Approve(Approvals(order, bread, milk), Now, User)).Code);
    }

    [Fact]
    public void Approval_needs_every_line_and_something_approved()
    {
        var order = Submitted();
        Assert.Equal("branch_order_approval_incomplete",
            Assert.Throws<BusinessRuleException>(() => order.Approve([Approvals(order, 1, 1)[0]], Now, User)).Code);
        Assert.Equal("branch_order_nothing_approved",
            Assert.Throws<BusinessRuleException>(() => order.Approve(Approvals(order, 0, 0), Now, User)).Code);
        Assert.Equal(BranchOrderStatus.Submitted, order.Status);
    }

    [Theory]
    [InlineData(20, 5, 20, 5, BranchOrderStatus.Fulfilled)]
    [InlineData(20, 5, 20, 4, BranchOrderStatus.PartiallyFulfilled)]
    [InlineData(20, 0, 20, 0, BranchOrderStatus.Fulfilled)] // a line approved at 0 does not count
    public void Receiving_the_transfer_updates_shipped_and_status(decimal approvedBread, decimal approvedMilk,
        decimal shippedBread, decimal shippedMilk, BranchOrderStatus expected)
    {
        var order = Submitted();
        order.Approve(Approvals(order, approvedBread, approvedMilk), Now, User);

        order.RegisterShipment(new Dictionary<Guid, decimal> { [Bread] = shippedBread, [Milk] = shippedMilk }, Now);

        Assert.Equal(expected, order.Status);
        Assert.Equal(shippedBread, order.Lines.Single(l => l.ItemId == Bread).ShippedQty);
        Assert.Equal(Now, order.FulfilledAt);
    }

    [Theory]
    [MemberData(nameof(AllStatuses))]
    public void Transitions_by_status(BranchOrderStatus status)
    {
        var order = InStatus(status);
        var lines = new[] { new BranchOrderLineInput(Bread, 1) };

        Assert.Equal(status == BranchOrderStatus.Draft, Succeeds(() => InStatus(status).UpdateDraft(Commissary, new DateOnly(2026, 9, 27), null, lines)));
        Assert.Equal(status == BranchOrderStatus.Draft, Succeeds(() => InStatus(status).Submit(Now, User)));
        Assert.Equal(status == BranchOrderStatus.Submitted, Succeeds(() => { var o = InStatus(status); o.Approve(Approvals(o, 1, 1), Now, User); }));
        Assert.Equal(status == BranchOrderStatus.Submitted, Succeeds(() => InStatus(status).Reject("No", Now, User)));
        Assert.Equal(status is BranchOrderStatus.Draft or BranchOrderStatus.Submitted, Succeeds(() => InStatus(status).Cancel()));
        Assert.Equal(status == BranchOrderStatus.Approved, Succeeds(() => InStatus(status).CancelWithTransfer()));
        Assert.Equal(status == BranchOrderStatus.Approved,
            Succeeds(() => InStatus(status).RegisterShipment(new Dictionary<Guid, decimal>(), Now)));
        Assert.Equal(status, order.Status);
    }

    [Fact]
    public void Rejection_needs_a_reason_and_lines_are_validated()
    {
        Assert.Equal("branch_order_rejection_reason_required", Assert.Throws<BusinessRuleException>(() => Submitted().Reject(" ", Now, User)).Code);
        Assert.Equal("branch_order_line_duplicated", Assert.Throws<BusinessRuleException>(() => new BranchOrder("PED-1", Branch, Commissary,
            new DateOnly(2026, 9, 26), null, [new BranchOrderLineInput(Bread, 1), new BranchOrderLineInput(Bread, 2)])).Code);
        Assert.Equal("branch_order_same_location", Assert.Throws<BusinessRuleException>(() => new BranchOrder("PED-1", Branch, Branch,
            new DateOnly(2026, 9, 26), null, [new BranchOrderLineInput(Bread, 1)])).Code);
    }

    [Theory]
    [InlineData(10, 40, 5, 0, 0, 35)]    // below min: max − on hand
    [InlineData(10, 40, 10, 0, 0, 30)]   // at min
    [InlineData(10, 40, 11, 0, 0, null)] // above min
    [InlineData(10, 40, 4, 6, 0, 30)]    // in transit counts
    [InlineData(10, 40, 4, 2, 5, null)]  // pending orders count (11 > 10)
    [InlineData(0, 0, 0, 0, 0, null)]    // nothing to order
    public void Suggestion_is_max_minus_projected_when_at_or_below_min(
        decimal min, decimal max, decimal onHand, decimal inTransit, decimal pending, int? expected) =>
        Assert.Equal((decimal?)expected, BranchOrderSuggestion.Calculate(min, max, onHand, inTransit, pending));

    private static bool Succeeds(Action action)
    {
        try { action(); return true; }
        catch (BusinessRuleException) { return false; }
    }
}
