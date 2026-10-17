using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.UnitTests.Domain;

public class InventoryAdjustmentTests
{
    private static InventoryAdjustment Create(AdjustmentReason reason, params AdjustmentLineInput[] lines) =>
        new(Guid.NewGuid(), "AJ-000001", Guid.NewGuid(), reason, null, lines);

    private static AdjustmentLineInput Line(decimal qty, decimal? cost = null) => new(Guid.NewGuid(), null, qty, cost, null);

    [Theory]
    [InlineData(AdjustmentReason.Waste)]
    [InlineData(AdjustmentReason.Expired)]
    [InlineData(AdjustmentReason.Damaged)]
    [InlineData(AdjustmentReason.InternalUse)]
    public void Only_corrections_accept_entries(AdjustmentReason reason) =>
        Assert.Equal("adjustment_sign", Assert.Throws<BusinessRuleException>(() => Create(reason, Line(5))).Code);

    [Theory]
    [InlineData(AdjustmentReason.Correction, MovementType.Adjustment)]
    [InlineData(AdjustmentReason.InternalUse, MovementType.Adjustment)]
    [InlineData(AdjustmentReason.Waste, MovementType.Waste)]
    [InlineData(AdjustmentReason.Expired, MovementType.Waste)]
    [InlineData(AdjustmentReason.Damaged, MovementType.Waste)]
    public void Reason_decides_the_movement_type(AdjustmentReason reason, MovementType expected) =>
        Assert.Equal(expected, Create(reason, Line(-1)).ToMovementRequests().Single().Type);

    [Fact]
    public void Exits_cannot_carry_a_cost_and_lines_cannot_be_zero_or_missing()
    {
        Assert.Equal("adjustment_exit_cost", Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction, Line(-1, 5))).Code);
        Assert.Equal("invalid_quantity", Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction, Line(0))).Code);
        Assert.Equal("adjustment_without_lines", Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction)).Code);
    }

    [Fact]
    public void Movements_reference_the_adjustment_and_its_folio()
    {
        var adjustment = Create(AdjustmentReason.Correction, Line(3, 10), Line(-2));

        var requests = adjustment.ToMovementRequests().ToList();

        Assert.All(requests, r => Assert.Equal((InventoryAdjustment.DocType, adjustment.Id, "AJ-000001"), (r.SourceDocType, r.SourceDocId, r.SourceDocFolio)));
        Assert.Equal([3m, -2m], requests.Select(r => r.Quantity));
        Assert.Equal(AdjustmentStatus.Posted, adjustment.Status);
    }
}
