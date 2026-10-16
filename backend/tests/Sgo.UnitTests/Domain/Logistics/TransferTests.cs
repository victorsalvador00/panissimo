using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Logistics;
using Sgo.Domain.Organization;

namespace Sgo.UnitTests.Domain.Logistics;

public class TransferTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;
    private static readonly Guid From = Guid.NewGuid();
    private static readonly Guid To = Guid.NewGuid();
    private static readonly Guid Item = Guid.NewGuid();
    private static readonly Guid LotA = Guid.NewGuid();
    private static readonly Guid LotB = Guid.NewGuid();

    private static Transfer Draft(decimal qty = 10) => new("TR-000001", From, To, null, null, [new TransferLineInput(Item, null, qty)]);

    /// <summary>Simulates the engine: posts the requests and returns the resulting TransferOut movements.</summary>
    private static IReadOnlyList<InventoryMovement> Post(Transfer transfer, IReadOnlyList<MovementRequest> requests, decimal cost = 12)
    {
        var state = new PostingState
        {
            Items = new Dictionary<Guid, PostingItem> { [Item] = new(Item, "LEC-001", "Leche", true) },
            Lots = new Dictionary<Guid, PostingLot>
            {
                [LotA] = new(LotA, Item, "A", DateOnly.FromDateTime(Now.UtcDateTime).AddDays(3)),
                [LotB] = new(LotB, Item, "B", DateOnly.FromDateTime(Now.UtcDateTime).AddDays(9)),
            },
            Balances = [],
            Costs = [],
            OccurredAt = Now,
            BusinessDate = DateOnly.FromDateTime(Now.UtcDateTime),
        };
        InventoryPostingCalculator.Calculate(
            [new(From, Item, LotA, MovementType.Adjustment, 6, cost, "T", Guid.NewGuid(), "T", null),
             new(From, Item, LotB, MovementType.Adjustment, 6, cost, "T", Guid.NewGuid(), "T", null)], state);
        return InventoryPostingCalculator.Calculate(requests, state).Movements;
    }

    private static Transfer Dispatched()
    {
        var transfer = Draft();
        transfer.Dispatch("Camioneta", "Juan", Now, null, Post(transfer, transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>())));
        return transfer;
    }

    private static readonly IReadOnlyDictionary<Guid, IReadOnlyList<LotQuantity>> NoLots = new Dictionary<Guid, IReadOnlyList<LotQuantity>>();

    [Theory]
    [InlineData(LocationType.Commissary, LocationType.Branch, true)]
    [InlineData(LocationType.Factory, LocationType.Branch, true)]
    [InlineData(LocationType.Branch, LocationType.Branch, false)]
    [InlineData(LocationType.Factory, LocationType.Commissary, false)]
    [InlineData(LocationType.Branch, LocationType.Commissary, false)]
    public void Only_factory_or_commissary_to_branch_is_a_standard_route(LocationType from, LocationType to, bool standard) =>
        Assert.Equal(standard, TransferRoutes.IsStandard(from, to));

    [Fact]
    public void Dispatch_splits_lines_per_lot_with_the_origin_cost()
    {
        var transfer = Dispatched();

        Assert.Equal(TransferStatus.Dispatched, transfer.Status);
        Assert.True(transfer.IsInTransit);
        Assert.Equal([(LotA, 6m, 12m), (LotB, 4m, 12m)], transfer.Lines.Select(l => (l.LotId!.Value, l.ShippedQty, l.UnitCost!.Value)));
        Assert.Equal(("Camioneta", "Juan"), (transfer.VehicleDescription, transfer.DriverName));
    }

    [Fact]
    public void Chosen_lots_must_add_up_to_the_line()
    {
        var transfer = Draft();
        var lineId = transfer.Lines[0].Id;

        var requests = transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>> { [lineId] = [new(LotB, 7), new(LotA, 3)] });
        Assert.Equal([(LotB, -7m), (LotA, -3m)], requests.Select(r => (r.LotId!.Value, r.Quantity)));

        var ex = Assert.Throws<BusinessRuleException>(() =>
            transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>> { [lineId] = [new(LotB, 7)] }));
        Assert.Equal("transfer_lots_mismatch", ex.Code);
    }

    [Fact]
    public void Full_receipt_leaves_the_transfer_received_with_transfer_in_at_origin_cost()
    {
        var transfer = Dispatched();

        var requests = transfer.Receive(transfer.Lines.Select(l => new ReceiptInput(l.Id, l.ShippedQty, null, null)).ToList(), Now, null);

        Assert.Equal(TransferStatus.Received, transfer.Status);
        Assert.All(requests, r => Assert.Equal((To, MovementType.TransferIn, (decimal?)12m), (r.LocationId, r.Type, r.UnitCost)));
        Assert.Equal(10m, requests.Sum(r => r.Quantity));
    }

    [Fact]
    public void Shortfall_requires_a_reason_and_leaves_discrepancies()
    {
        var transfer = Dispatched();
        var (a, b) = (transfer.Lines[0], transfer.Lines[1]);

        var missingReason = Assert.Throws<BusinessRuleException>(() =>
            transfer.Receive([new(a.Id, 6, null, null), new(b.Id, 3, null, null)], Now, null));
        Assert.Equal("transfer_discrepancy_reason_required", missingReason.Code);

        var requests = transfer.Receive([new(a.Id, 6, null, null), new(b.Id, 3, DiscrepancyReason.Damaged, "Caja rota")], Now, null);

        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, transfer.Status);
        Assert.Equal((1m, DiscrepancyReason.Damaged, "Caja rota"), (b.ShortQty, b.DiscrepancyReason!.Value, b.DiscrepancyNotes));
        Assert.Equal(9m, requests.Sum(r => r.Quantity));
    }

    [Fact]
    public void Nothing_received_on_a_line_posts_nothing_for_it()
    {
        var transfer = Dispatched();
        var requests = transfer.Receive(
            [new(transfer.Lines[0].Id, 0, DiscrepancyReason.Missing, null), new(transfer.Lines[1].Id, 4, null, null)], Now, null);
        Assert.Single(requests);
    }

    [Fact]
    public void Receiving_more_than_shipped_or_skipping_lines_is_rejected()
    {
        var transfer = Dispatched();
        var (a, b) = (transfer.Lines[0], transfer.Lines[1]);

        Assert.Equal("transfer_over_receipt",
            Assert.Throws<BusinessRuleException>(() => transfer.Receive([new(a.Id, 7, null, null), new(b.Id, 4, null, null)], Now, null)).Code);
        Assert.Equal("transfer_receipt_incomplete",
            Assert.Throws<BusinessRuleException>(() => transfer.Receive([new(a.Id, 6, null, null)], Now, null)).Code);
    }

    [Fact]
    public void Plan_rules()
    {
        Assert.Throws<BusinessRuleException>(() => new Transfer("TR-1", From, From, null, null, [new(Item, null, 1)]));
        Assert.Throws<BusinessRuleException>(() => new Transfer("TR-1", From, To, null, null, []));
        Assert.Throws<BusinessRuleException>(() => new Transfer("TR-1", From, To, null, null, [new(Item, null, 0)]));
        Assert.Throws<BusinessRuleException>(() => new Transfer("TR-1", From, To, null, null, [new(Item, null, 1), new(Item, null, 2)]));
    }

    public static TheoryData<string, Func<Transfer>, Action<Transfer>> InvalidTransitions => new()
    {
        { "edit dispatched", Dispatched, t => t.UpdateDraft(To, null, [new(Item, null, 1)]) },
        { "cancel dispatched (RN-23)", Dispatched, t => t.Cancel() },
        { "dispatch twice", Dispatched, t => t.DispatchRequests(NoLots) },
        { "receive draft", () => Draft(), t => t.Receive([], Now, null) },
        { "receive received", ReceivedTransfer, t => t.Receive([], Now, null) },
        { "cancel received", ReceivedTransfer, t => t.Cancel() },
        { "edit cancelled", CancelledTransfer, t => t.UpdateDraft(To, null, [new(Item, null, 1)]) },
        { "dispatch cancelled", CancelledTransfer, t => t.DispatchRequests(NoLots) },
        { "cancel cancelled", CancelledTransfer, t => t.Cancel() },
    };

    private static Transfer ReceivedTransfer()
    {
        var transfer = Dispatched();
        transfer.Receive(transfer.Lines.Select(l => new ReceiptInput(l.Id, l.ShippedQty, null, null)).ToList(), Now, null);
        return transfer;
    }

    private static Transfer CancelledTransfer()
    {
        var transfer = Draft();
        transfer.Cancel();
        return transfer;
    }

    [Theory]
    [MemberData(nameof(InvalidTransitions))]
    public void Invalid_transitions_throw(string name, Func<Transfer> create, Action<Transfer> act)
    {
        var transfer = create();
        Assert.False(string.IsNullOrEmpty(Assert.Throws<BusinessRuleException>(() => act(transfer)).Code), name);
    }
}
