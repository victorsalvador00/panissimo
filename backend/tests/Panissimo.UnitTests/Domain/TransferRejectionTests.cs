using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Sales;

namespace Panissimo.UnitTests.Domain;

/// <summary>RN-22 and RN-116: receipt of a transfer with what the branch rejects and what did not arrive.</summary>
public class TransferRejectionTests
{
    private static readonly DateOnly Today = new(2026, 10, 19);
    private static readonly DateTimeOffset Dispatched = new(2026, 10, 19, 8, 0, 0, TimeSpan.Zero);
    private static readonly Guid FinishedGoods = Guid.NewGuid();
    private static readonly Guid Plant = Guid.NewGuid();
    private static readonly Guid Branch = Guid.NewGuid();
    private static readonly Guid Bread = Guid.NewGuid();

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    /// <summary>100 pieces (no lots) at 2.5 each, dispatched from the finished goods sub-warehouse.</summary>
    private static Transfer DispatchedTransfer(TransferKind kind = TransferKind.Standard)
    {
        var transfer = new Transfer("TR-000001", Plant, Branch, null, null, [new TransferLineInput(Bread, null, 100)], kind);
        var state = new PostingState
        {
            Items = new Dictionary<Guid, PostingItem> { [Bread] = new(Bread, "PAN", "Pan", TracksLots: false, WholeQuantities: true) },
            Lots = new Dictionary<Guid, PostingLot>(),
            Balances = [],
            Costs = [],
            OccurredAt = Dispatched,
            BusinessDate = Today,
        };
        InventoryPostingCalculator.Calculate(
            [new MovementRequest(FinishedGoods, Bread, null, MovementType.ProductionOutput, 100, 2.5m, "Test", Guid.NewGuid(), "T-1", null)], state);
        var result = InventoryPostingCalculator.Calculate(
            transfer.DispatchRequests(new Dictionary<Guid, IReadOnlyList<LotQuantity>>(), _ => FinishedGoods), state);
        transfer.Dispatch(kind == TransferKind.Standard ? "Camioneta · ABC-1" : "", kind == TransferKind.Standard ? "Juan" : "",
            Dispatched, null, result.Movements);
        return transfer;
    }

    private static ReceiptInput Receipt(Transfer t, decimal received, TransferRejectionInput? rejection = null,
        DiscrepancyReason? reason = null) => new(t.Lines[0].Id, received, reason, null, rejection);

    private static TransferRejectionInput Rejected(decimal qty, RejectionDisposition disposition,
        ShipmentRejectionReason reason = ShipmentRejectionReason.Damaged, string? notes = null) => new(qty, reason, notes, disposition);

    [Fact]
    public void What_returns_reenters_the_sub_warehouse_it_left_at_the_dispatch_cost()
    {
        var transfer = DispatchedTransfer();

        var requests = transfer.Receive([Receipt(transfer, 80, Rejected(20, RejectionDisposition.Return))], Dispatched.AddHours(2), null,
            _ => Branch);

        Assert.Equal(TransferStatus.ReceivedWithDiscrepancies, transfer.Status);
        Assert.Equal(
            [(Branch, MovementType.TransferIn, 80m, 2.5m), (FinishedGoods, MovementType.TransferIn, 20m, 2.5m)],
            requests.Select(r => (r.LocationId, r.Type, r.Quantity, r.UnitCost!.Value)));
        var line = transfer.Lines[0];
        Assert.Equal((20m, 20m, 0m, 0m), (line.RejectedQty, line.ReturnedQty, line.RejectedLossQty, line.ShortQty));
        Assert.Null(line.DiscrepancyReason);
    }

    [Fact]
    public void What_is_lost_does_not_move_and_what_did_not_arrive_still_needs_its_reason()
    {
        var transfer = DispatchedTransfer();

        Assert.Equal("transfer_discrepancy_reason_required",
            Code(() => transfer.Receive([Receipt(transfer, 80, Rejected(15, RejectionDisposition.Loss))], Dispatched.AddHours(2), null)));

        var requests = transfer.Receive([Receipt(transfer, 80, Rejected(15, RejectionDisposition.Loss), DiscrepancyReason.Missing)],
            Dispatched.AddHours(2), null, _ => Branch);

        Assert.Equal([(Branch, 80m)], requests.Select(r => (r.LocationId, r.Quantity)));
        var line = transfer.Lines[0];
        Assert.Equal((15m, 0m, 15m, 5m), (line.RejectedQty, line.ReturnedQty, line.RejectedLossQty, line.ShortQty));
        Assert.Equal(DiscrepancyReason.Missing, line.DiscrepancyReason);
    }

    [Fact]
    public void Received_plus_rejected_cannot_exceed_what_was_shipped_and_other_needs_a_note()
    {
        var transfer = DispatchedTransfer();
        var later = Dispatched.AddHours(2);

        Assert.Equal("transfer_over_receipt",
            Code(() => transfer.Receive([Receipt(transfer, 90, Rejected(11, RejectionDisposition.Return))], later, null)));
        Assert.Equal("rejection_notes_required", Code(() => transfer.Receive(
            [Receipt(transfer, 90, Rejected(10, RejectionDisposition.Loss, ShipmentRejectionReason.Other))], later, null)));
        Assert.Equal("invalid_quantity",
            Code(() => transfer.Receive([Receipt(transfer, 100, Rejected(0, RejectionDisposition.Loss))], later, null)));
        Assert.Equal(TransferStatus.Dispatched, transfer.Status);
    }

    [Fact]
    public void An_internal_voucher_has_no_rejections()
    {
        var voucher = DispatchedTransfer(TransferKind.Internal);

        Assert.Equal("transfer_rejection_not_allowed", Code(() =>
            voucher.Receive([Receipt(voucher, 90, Rejected(10, RejectionDisposition.Return))], Dispatched.AddHours(2), null)));
    }
}
