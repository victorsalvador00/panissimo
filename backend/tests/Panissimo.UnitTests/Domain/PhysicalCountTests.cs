using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.UnitTests.Domain;

public class PhysicalCountTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 16, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid Flour = Guid.NewGuid();
    private static readonly Guid Sugar = Guid.NewGuid();

    private static PhysicalCount Started()
    {
        var count = new PhysicalCount("CF-000001", Guid.NewGuid(), null, null);
        count.Start(Now, 10, [new SnapshotLine(Flour, null, 12), new SnapshotLine(Sugar, null, 5)]);
        return count;
    }

    [Fact]
    public void Close_posts_counted_minus_snapshot_only_where_they_differ()
    {
        var count = Started();
        count.RecordCount(count.Lines[0].Id, 10);
        count.RecordCount(count.Lines[1].Id, 5);

        var movements = count.Close(Now);

        var movement = Assert.Single(movements);
        Assert.Equal((Flour, -2m, MovementType.PhysicalCountAdjustment), (movement.ItemId, movement.Quantity, movement.Type));
        Assert.Equal(PhysicalCountStatus.Closed, count.Status);
    }

    [Fact]
    public void Close_requires_every_line_counted()
    {
        var count = Started();
        count.RecordCount(count.Lines[0].Id, 12);

        var error = Assert.Throws<BusinessRuleException>(() => count.Close(Now));

        Assert.Equal("count_incomplete", error.Code);
        Assert.Contains("Faltan 1", error.Message);
    }

    [Fact]
    public void Lines_are_added_once_and_only_while_in_progress()
    {
        var draft = new PhysicalCount("CF-000002", Guid.NewGuid(), null, null);
        Assert.Equal("count_not_in_progress", Assert.Throws<BusinessRuleException>(() => draft.AddLine(Flour, null, 0)).Code);

        var count = Started();
        Assert.Equal("count_line_duplicated", Assert.Throws<BusinessRuleException>(() => count.AddLine(Flour, null, 0)).Code);
        Assert.Equal(0m, count.AddLine(Guid.NewGuid(), null, 0).SnapshotQty);
    }

    [Fact]
    public void State_machine_rejects_invalid_transitions()
    {
        var count = Started();
        Assert.Equal("count_not_draft", Assert.Throws<BusinessRuleException>(() => count.Start(Now, 1, [])).Code);
        Assert.Equal("count_not_draft", Assert.Throws<BusinessRuleException>(() => count.UpdateDraft(null, null)).Code);

        count.Cancel(Now);
        Assert.Equal(PhysicalCountStatus.Cancelled, count.Status);
        Assert.Equal("count_finished", Assert.Throws<BusinessRuleException>(() => count.Cancel(Now)).Code);
        Assert.Equal("count_not_in_progress", Assert.Throws<BusinessRuleException>(() => count.Close(Now)).Code);
    }

    [Fact]
    public void Counted_quantity_cannot_be_negative() =>
        Assert.Equal("invalid_quantity", Assert.Throws<BusinessRuleException>(() =>
        {
            var count = Started();
            count.RecordCount(count.Lines[0].Id, -1);
        }).Code);

    [Fact]
    public void Consumption_rejects_future_dates_and_posts_exits()
    {
        var today = new DateOnly(2026, 10, 16);
        Assert.Equal("consumption_future_date", Assert.Throws<BusinessRuleException>(() =>
            new ConsumptionEntry("CON-1", Guid.NewGuid(), today.AddDays(1), today, null, [new ConsumptionLineInput(Flour, null, 1)])).Code);

        var entry = new ConsumptionEntry("CON-1", Guid.NewGuid(), today.AddDays(-1), today, null, [new ConsumptionLineInput(Flour, null, 3)]);
        var movement = entry.ToMovementRequests().Single();
        Assert.Equal((MovementType.Consumption, -3m), (movement.Type, movement.Quantity));
    }
}
