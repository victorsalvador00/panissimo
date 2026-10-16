using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.UnitTests.Domain.Inventory;

public class PhysicalCountTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;
    private static readonly Guid ItemA = Guid.NewGuid();
    private static readonly Guid ItemB = Guid.NewGuid();
    private static readonly Guid Lot1 = Guid.NewGuid();

    private static PhysicalCount Draft() => new("CF-000001", Guid.NewGuid(), null, "Semanal");

    private static PhysicalCount InProgress()
    {
        var count = Draft();
        count.Start(Now, 42, [new SnapshotLine(ItemA, null, 10), new SnapshotLine(ItemB, Lot1, 4)]);
        return count;
    }

    private static PhysicalCount Closed()
    {
        var count = InProgress();
        foreach (var line in count.Lines)
            count.RecordCount(line.Id, line.SnapshotQty);
        count.Close(Now);
        return count;
    }

    private static PhysicalCount Cancelled()
    {
        var count = Draft();
        count.Cancel(Now);
        return count;
    }

    [Fact]
    public void Start_saves_the_snapshot_of_every_line()
    {
        var count = InProgress();

        Assert.Equal(PhysicalCountStatus.InProgress, count.Status);
        Assert.Equal(42, count.SnapshotSequence);
        Assert.Equal([(ItemA, (Guid?)null, 10m), (ItemB, Lot1, 4m)], count.Lines.Select(l => (l.ItemId, l.LotId, l.SnapshotQty)));
        Assert.All(count.Lines, l => Assert.Null(l.CountedQty));
    }

    [Fact]
    public void Close_posts_counted_minus_snapshot_only_for_lines_with_difference()
    {
        var count = InProgress();
        count.RecordCount(count.Lines[0].Id, 7);  // −3
        count.RecordCount(count.Lines[1].Id, 4);  //  0
        var extra = count.AddLine(Guid.NewGuid(), null, 0);
        count.RecordCount(extra.Id, 2);           // +2

        var movements = count.Close(Now);

        Assert.Equal(PhysicalCountStatus.Closed, count.Status);
        Assert.Equal([-3m, 2m], movements.Select(m => m.Quantity));
        Assert.All(movements, m =>
        {
            Assert.Equal(MovementType.PhysicalCountAdjustment, m.Type);
            Assert.Null(m.UnitCost);
            Assert.Equal((PhysicalCount.DocType, count.Id, "CF-000001"), (m.SourceDocType, m.SourceDocId, m.SourceDocFolio));
        });
    }

    [Fact]
    public void Closing_with_uncounted_lines_is_rejected()
    {
        var count = InProgress();
        count.RecordCount(count.Lines[0].Id, 10);

        var ex = Assert.Throws<BusinessRuleException>(() => count.Close(Now));
        Assert.Equal("count_incomplete", ex.Code);
        Assert.Contains("1 línea", ex.Message);
        Assert.Equal(PhysicalCountStatus.InProgress, count.Status);
    }

    [Fact]
    public void Recount_replaces_the_previous_quantity()
    {
        var count = InProgress();
        count.RecordCount(count.Lines[0].Id, 3);
        count.RecordCount(count.Lines[0].Id, 12);

        Assert.Equal((12m, 2m), (count.Lines[0].CountedQty!.Value, count.Lines[0].Difference!.Value));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0.00001)]
    public void Counted_quantity_must_be_non_negative_with_four_decimals(decimal qty)
    {
        var count = InProgress();
        Assert.Throws<BusinessRuleException>(() => count.RecordCount(count.Lines[0].Id, qty));
    }

    [Fact]
    public void A_line_cannot_be_added_twice() =>
        Assert.Throws<BusinessRuleException>(() => InProgress().AddLine(ItemA, null, 0));

    [Fact]
    public void Draft_and_in_progress_can_be_cancelled()
    {
        Assert.Equal(PhysicalCountStatus.Cancelled, Cancelled().Status);
        var count = InProgress();
        count.Cancel(Now);
        Assert.Equal(PhysicalCountStatus.Cancelled, count.Status);
    }

    // Every invalid transition throws BusinessRuleException (backend spec §10).

    public static TheoryData<string, Func<PhysicalCount>, Action<PhysicalCount>> InvalidTransitions => new()
    {
        { "start in progress", InProgress, c => c.Start(Now, 1, []) },
        { "start closed", Closed, c => c.Start(Now, 1, []) },
        { "start cancelled", Cancelled, c => c.Start(Now, 1, []) },
        { "close draft", Draft, c => c.Close(Now) },
        { "close closed", Closed, c => c.Close(Now) },
        { "close cancelled", Cancelled, c => c.Close(Now) },
        { "cancel closed", Closed, c => c.Cancel(Now) },
        { "cancel cancelled", Cancelled, c => c.Cancel(Now) },
        { "count in draft", Draft, c => c.RecordCount(Guid.NewGuid(), 1) },
        { "count closed", Closed, c => c.RecordCount(c.Lines[0].Id, 1) },
        { "add line in draft", Draft, c => c.AddLine(Guid.NewGuid(), null, 0) },
        { "add line closed", Closed, c => c.AddLine(Guid.NewGuid(), null, 0) },
        { "change category in progress", InProgress, c => c.UpdateDraft(Guid.NewGuid(), null) },
        { "notes on closed", Closed, c => c.UpdateNotes("x") },
    };

    [Theory]
    [MemberData(nameof(InvalidTransitions))]
    public void Invalid_transitions_throw(string name, Func<PhysicalCount> create, Action<PhysicalCount> act)
    {
        var count = create();
        var ex = Assert.Throws<BusinessRuleException>(() => act(count));
        Assert.False(string.IsNullOrEmpty(ex.Code), name);
    }
}

public class ConsumptionEntryTests
{
    private static readonly DateOnly Today = new(2026, 9, 23);

    private static ConsumptionEntry Create(DateOnly date, params ConsumptionLineInput[] lines) =>
        new("CON-000001", Guid.NewGuid(), date, Today, null, lines);

    [Fact]
    public void Lines_become_consumption_exits()
    {
        var entry = Create(Today.AddDays(-1), new ConsumptionLineInput(Guid.NewGuid(), null, 1.5m));

        var request = Assert.Single(entry.ToMovementRequests());
        Assert.Equal((MovementType.Consumption, -1.5m), (request.Type, request.Quantity));
    }

    [Fact]
    public void Future_date_is_rejected() =>
        Assert.Equal("consumption_future_date",
            Assert.Throws<BusinessRuleException>(() => Create(Today.AddDays(1), new ConsumptionLineInput(Guid.NewGuid(), null, 1))).Code);

    [Fact]
    public void Needs_positive_lines()
    {
        Assert.Throws<BusinessRuleException>(() => Create(Today));
        Assert.Throws<BusinessRuleException>(() => Create(Today, new ConsumptionLineInput(Guid.NewGuid(), null, 0)));
    }
}
