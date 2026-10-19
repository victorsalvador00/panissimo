using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Organization;

namespace Panissimo.UnitTests.Domain;

public class TransferTests
{
    private static readonly Guid Plant = Guid.NewGuid();
    private static readonly Guid Branch = Guid.NewGuid();
    private static readonly Guid Bread = Guid.NewGuid();

    private static Transfer Draft(decimal qty = 10) => new("TR-000001", Plant, Branch, null, null, [new TransferLineInput(Bread, null, qty)]);

    [Theory]
    [InlineData(LocationType.Plant, LocationType.Branch, true)]
    [InlineData(LocationType.Branch, LocationType.Branch, false)]
    [InlineData(LocationType.Branch, LocationType.Plant, false)]
    public void Only_plant_to_branch_is_a_standard_route(LocationType from, LocationType to, bool standard) =>
        Assert.Equal(standard, TransferRoutes.IsStandard(from, to));

    [Theory]
    [InlineData(ItemType.FinishedGood, true)]   // bulk or packaged
    [InlineData(ItemType.Supply, true)]
    [InlineData(ItemType.SemiFinished, false)]
    [InlineData(ItemType.RawMaterial, false)]
    public void Transfers_carry_finished_goods_and_supplies(ItemType type, bool expected) =>
        Assert.Equal(expected, TransferRoutes.IsShippable(type));

    [Fact]
    public void Plan_rejects_same_location_empty_and_duplicated_lines()
    {
        Assert.Equal("transfer_same_location", Assert.Throws<BusinessRuleException>(() =>
            new Transfer("TR-1", Plant, Plant, null, null, [new TransferLineInput(Bread, null, 1)])).Code);
        Assert.Equal("transfer_without_lines", Assert.Throws<BusinessRuleException>(() =>
            new Transfer("TR-1", Plant, Branch, null, null, [])).Code);
        Assert.Equal("transfer_line_duplicated", Assert.Throws<BusinessRuleException>(() =>
            new Transfer("TR-1", Plant, Branch, null, null, [new TransferLineInput(Bread, null, 1), new TransferLineInput(Bread, null, 2)])).Code);
    }

    [Fact]
    public void Chosen_lots_must_add_up_to_the_line()
    {
        var transfer = Draft(10);
        var line = transfer.Lines.Single();

        var error = Assert.Throws<BusinessRuleException>(() => transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>
        {
            [line.Id] = [new LotQuantity(Guid.NewGuid(), 4), new LotQuantity(Guid.NewGuid(), 5)],
        }));
        Assert.Equal("lots_mismatch", error.Code);

        var requests = transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>
        {
            [line.Id] = [new LotQuantity(Guid.NewGuid(), 4), new LotQuantity(Guid.NewGuid(), 6)],
        });
        Assert.Equal([-4m, -6m], requests.Select(r => r.Quantity));
    }

    [Fact]
    public void Only_drafts_are_edited_or_cancelled_and_only_dispatched_ones_are_received()
    {
        var transfer = Draft();
        Assert.Equal("transfer_not_in_transit", Assert.Throws<BusinessRuleException>(() =>
            transfer.Receive([], DateTimeOffset.UtcNow, null)).Code);

        transfer.Cancel();
        Assert.Equal(TransferStatus.Cancelled, transfer.Status);
        Assert.Equal("transfer_not_draft", Assert.Throws<BusinessRuleException>(() => transfer.Cancel()).Code);
        Assert.Equal("transfer_not_draft", Assert.Throws<BusinessRuleException>(() =>
            transfer.UpdateDraft(Branch, null, [new TransferLineInput(Bread, null, 1)])).Code);
    }

    [Fact]
    public void A_voucher_posts_as_internal_transfer_and_needs_no_vehicle()
    {
        var voucher = new Transfer("VI-000001", Plant, Branch, null, null, [new TransferLineInput(Bread, null, 4)], TransferKind.Internal);
        var exit = voucher.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>()).Single();
        Assert.Equal((Transfer.InternalDocType, MovementType.TransferOut, "Vale VI-000001"), (exit.SourceDocType, exit.Type, exit.Notes));

        Assert.Equal("transfer_shipping_required",
            Assert.Throws<BusinessRuleException>(() => Draft().Dispatch(" ", "Luis", DateTimeOffset.UtcNow, null, [])).Code);
        Assert.Throws<ArgumentException>(() =>
            new Transfer("VI-2", Plant, Branch, Guid.NewGuid(), null, [new TransferLineInput(Bread, null, 1)], TransferKind.Internal));
    }
}
