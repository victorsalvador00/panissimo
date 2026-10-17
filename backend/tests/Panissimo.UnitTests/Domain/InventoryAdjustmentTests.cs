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

    [Fact]
    public void A_customer_return_only_enters_and_its_waste_part_leaves_afterwards()
    {
        var item = Guid.NewGuid();
        var lot = Guid.NewGuid();
        var adjustment = Create(AdjustmentReason.CustomerReturn,
            new AdjustmentLineInput(item, lot, 12, null, "RM-000010", 5, AdjustmentReason.Damaged), Line(3));

        var entries = adjustment.ToMovementRequests().ToList();
        Assert.Equal([12m, 3m], entries.Select(m => m.Quantity));
        Assert.All(entries, m => Assert.Equal(MovementType.Adjustment, m.Type));

        var waste = adjustment.WasteMovementRequests().Single();
        Assert.Equal((MovementType.Waste, -5m, lot, item), (waste.Type, waste.Quantity, waste.LotId, waste.ItemId));
        Assert.Contains("dañado", waste.Notes);

        Assert.Equal("adjustment_sign", Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.CustomerReturn, Line(-1))).Code);
    }

    [Theory]
    [InlineData(0, AdjustmentReason.Waste, "invalid_waste_quantity")]
    [InlineData(13, AdjustmentReason.Waste, "invalid_waste_quantity")]   // more than returned
    [InlineData(2, AdjustmentReason.Correction, "waste_reason_required")]
    public void The_waste_part_is_within_the_return_and_has_a_waste_reason(decimal waste, AdjustmentReason reason, string code) =>
        Assert.Equal(code, Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.CustomerReturn,
            new AdjustmentLineInput(Guid.NewGuid(), null, 12, null, null, waste, reason))).Code);

    [Fact]
    public void Only_a_customer_return_has_a_waste_part() =>
        Assert.Equal("adjustment_waste_not_allowed", Assert.Throws<BusinessRuleException>(() => Create(AdjustmentReason.Correction,
            new AdjustmentLineInput(Guid.NewGuid(), null, 12, null, null, 2, AdjustmentReason.Waste))).Code);
}
