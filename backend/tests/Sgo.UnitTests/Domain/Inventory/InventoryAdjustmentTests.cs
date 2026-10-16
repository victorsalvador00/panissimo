using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.UnitTests.Domain.Inventory;

public class InventoryAdjustmentTests
{
    private static InventoryAdjustment Create(AdjustmentReason reason, params AdjustmentLineInput[] lines) =>
        new(Guid.NewGuid(), "AJ-000001", Guid.NewGuid(), reason, null, lines);

    private static AdjustmentLineInput Line(decimal qty, decimal? cost = null) => new(Guid.NewGuid(), null, qty, cost, null);

    [Theory]
    [InlineData(AdjustmentReason.Correction, MovementType.Adjustment)]
    [InlineData(AdjustmentReason.InternalUse, MovementType.Adjustment)]
    [InlineData(AdjustmentReason.Waste, MovementType.Waste)]
    [InlineData(AdjustmentReason.Expired, MovementType.Waste)]
    [InlineData(AdjustmentReason.Damaged, MovementType.Waste)]
    public void Reason_maps_to_movement_type(AdjustmentReason reason, MovementType expected)
    {
        var adjustment = Create(reason, Line(-1));
        var request = Assert.Single(adjustment.ToMovementRequests());
        Assert.Equal(expected, request.Type);
        Assert.Equal((InventoryAdjustment.DocType, adjustment.Id, "AJ-000001"), (request.SourceDocType, request.SourceDocId, request.SourceDocFolio));
    }

    [Theory]
    [InlineData(AdjustmentReason.Waste)]
    [InlineData(AdjustmentReason.Expired)]
    [InlineData(AdjustmentReason.Damaged)]
    [InlineData(AdjustmentReason.InternalUse)]
    public void Only_corrections_accept_entries(AdjustmentReason reason)
    {
        var ex = Assert.Throws<BusinessRuleException>(() => Create(reason, Line(5)));
        Assert.Equal("adjustment_sign", ex.Code);
    }

    [Fact]
    public void Correction_accepts_entries_and_exits() =>
        Assert.Equal(2, Create(AdjustmentReason.Correction, Line(5, 10), Line(-2)).Lines.Count);

    [Fact]
    public void Exits_cannot_carry_a_cost() =>
        Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction, Line(-2, 10)));

    [Fact]
    public void Needs_lines() =>
        Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction));
}
