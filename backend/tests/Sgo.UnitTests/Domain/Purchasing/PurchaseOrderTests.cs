using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Domain.Purchasing;

namespace Sgo.UnitTests.Domain.Purchasing;

public class PurchaseOrderTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 24, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid User = Guid.NewGuid();

    /// <summary>Subtotal 1,000: 10 × 100.</summary>
    private static PurchaseOrder New(decimal quantity = 10, decimal price = 100) =>
        new("OC-000001", Guid.NewGuid(), Guid.NewGuid(), null, null, [new PurchaseOrderLineInput(Guid.NewGuid(), quantity, price, 0.16m, null)]);

    private static PurchaseOrder InStatus(PurchaseOrderStatus status)
    {
        var order = New();
        if (status == PurchaseOrderStatus.Draft) return order;
        order.Submit(0, Now, User); // threshold 0 → always pending
        switch (status)
        {
            case PurchaseOrderStatus.PendingApproval:
                return order;
            case PurchaseOrderStatus.Rejected:
                order.Reject("No", Now, User);
                return order;
        }
        order.Approve(Now, User);
        switch (status)
        {
            case PurchaseOrderStatus.Approved:
                return order;
            case PurchaseOrderStatus.Cancelled:
                order.Cancel();
                return order;
        }
        var line = order.Lines.Single().Id;
        if (status == PurchaseOrderStatus.Received)
        {
            order.Receive([new LineReceipt(line, 10)], 0);
            return order;
        }
        order.Receive([new LineReceipt(line, 4)], 0);
        if (status == PurchaseOrderStatus.Closed)
            order.Close(Now, User);
        return order;
    }

    public static TheoryData<PurchaseOrderStatus> AllStatuses() => [.. Enum.GetValues<PurchaseOrderStatus>()];

    [Theory]
    [InlineData(999.99, true)]  // subtotal 1,000 ≥ threshold → pending
    [InlineData(1000, true)]    // equal also needs approval (RN-31: ≥)
    [InlineData(1000.01, false)] // below the threshold → approved directly
    public void Submit_compares_the_subtotal_without_VAT_with_the_threshold(decimal threshold, bool needsApproval)
    {
        var order = New(); // subtotal 1,000, total 1,160 with VAT

        order.Submit(threshold, Now, User);

        Assert.Equal(needsApproval, order.ApprovalRequired);
        Assert.Equal(needsApproval ? PurchaseOrderStatus.PendingApproval : PurchaseOrderStatus.Approved, order.Status);
        Assert.Equal((Now, User), (order.SubmittedAt!.Value, order.SubmittedBy!.Value));
        if (!needsApproval)
            Assert.Equal(User, order.ApprovedBy);
    }

    [Fact]
    public void Approve_and_reject_from_pending()
    {
        var approved = InStatus(PurchaseOrderStatus.PendingApproval);
        approved.Approve(Now, User);
        Assert.Equal((PurchaseOrderStatus.Approved, User), (approved.Status, approved.ApprovedBy!.Value));

        var rejected = InStatus(PurchaseOrderStatus.PendingApproval);
        Assert.Equal("purchase_order_rejection_reason_required",
            Assert.Throws<BusinessRuleException>(() => rejected.Reject(" ", Now, User)).Code);
        rejected.Reject(" Precio alto ", Now, User);
        Assert.Equal((PurchaseOrderStatus.Rejected, "Precio alto"), (rejected.Status, rejected.RejectionReason));
    }

    [Theory]
    [MemberData(nameof(AllStatuses))]
    public void Only_drafts_are_edited_or_submitted(PurchaseOrderStatus status)
    {
        var order = InStatus(status);
        var lines = new[] { new PurchaseOrderLineInput(Guid.NewGuid(), 1, 1, 0, null) };
        if (status == PurchaseOrderStatus.Draft)
        {
            order.UpdateDraft(Guid.NewGuid(), null, null, lines);
            order.Submit(0, Now, User);
            return;
        }
        Assert.Throws<BusinessRuleException>(() => order.UpdateDraft(Guid.NewGuid(), null, null, lines));
        Assert.Throws<BusinessRuleException>(() => order.Submit(0, Now, User));
    }

    [Theory]
    [MemberData(nameof(AllStatuses))]
    public void Only_pending_orders_are_approved_or_rejected(PurchaseOrderStatus status)
    {
        if (status == PurchaseOrderStatus.PendingApproval) return;
        var order = InStatus(status);
        Assert.Throws<BusinessRuleException>(() => order.Approve(Now, User));
        Assert.Throws<BusinessRuleException>(() => order.Reject("No", Now, User));
    }

    [Theory]
    [InlineData(PurchaseOrderStatus.Draft, true)]
    [InlineData(PurchaseOrderStatus.PendingApproval, true)]
    [InlineData(PurchaseOrderStatus.Approved, true)]
    [InlineData(PurchaseOrderStatus.PartiallyReceived, false)]
    [InlineData(PurchaseOrderStatus.Received, false)]
    [InlineData(PurchaseOrderStatus.Rejected, false)]
    [InlineData(PurchaseOrderStatus.Cancelled, false)]
    [InlineData(PurchaseOrderStatus.Closed, false)]
    public void Cancel_only_before_anything_is_received(PurchaseOrderStatus status, bool allowed)
    {
        var order = InStatus(status);
        if (allowed)
        {
            order.Cancel();
            Assert.Equal(PurchaseOrderStatus.Cancelled, order.Status);
        }
        else
        {
            Assert.Equal("purchase_order_not_cancellable", Assert.Throws<BusinessRuleException>(order.Cancel).Code);
        }
    }

    [Theory]
    [MemberData(nameof(AllStatuses))]
    public void Close_only_partially_received_orders(PurchaseOrderStatus status)
    {
        var order = InStatus(status);
        if (status == PurchaseOrderStatus.PartiallyReceived)
        {
            order.Close(Now, User);
            Assert.Equal((PurchaseOrderStatus.Closed, User), (order.Status, order.ClosedBy!.Value));
            return;
        }
        Assert.Throws<BusinessRuleException>(() => order.Close(Now, User));
    }

    [Theory]
    [MemberData(nameof(AllStatuses))]
    public void Only_approved_or_partially_received_orders_are_received(PurchaseOrderStatus status)
    {
        var order = InStatus(status);
        var receipt = new[] { new LineReceipt(order.Lines.Single().Id, 1) };
        if (status is PurchaseOrderStatus.Approved or PurchaseOrderStatus.PartiallyReceived)
            order.Receive(receipt, 0);
        else
            Assert.Equal("purchase_order_invalid_status", Assert.Throws<BusinessRuleException>(() => order.Receive(receipt, 0)).Code);
    }

    [Fact]
    public void Partial_then_final_receipt()
    {
        var order = InStatus(PurchaseOrderStatus.Approved);
        var line = order.Lines.Single();

        order.Receive([new LineReceipt(line.Id, 4)], 0);
        Assert.Equal((PurchaseOrderStatus.PartiallyReceived, 4m, 6m), (order.Status, line.ReceivedQty, line.PendingQty));

        // The same line twice in one receipt (two lots) adds up.
        order.Receive([new LineReceipt(line.Id, 2.5m), new LineReceipt(line.Id, 3.5m)], 0);
        Assert.Equal((PurchaseOrderStatus.Received, 10m, 0m), (order.Status, line.ReceivedQty, line.PendingQty));
    }

    [Theory]
    [InlineData(0, 10, true)]
    [InlineData(0, 10.0001, false)]
    [InlineData(5, 10.5, true)]   // 5% of 10 = 0.5 extra
    [InlineData(5, 10.51, false)]
    public void Over_receipt_is_limited_by_the_tolerance(decimal tolerancePct, decimal quantity, bool allowed)
    {
        var order = InStatus(PurchaseOrderStatus.Approved);
        var receipt = new[] { new LineReceipt(order.Lines.Single().Id, quantity) };

        if (allowed)
        {
            order.Receive(receipt, tolerancePct);
            Assert.Equal(PurchaseOrderStatus.Received, order.Status);
        }
        else
        {
            Assert.Equal("goods_receipt_over_tolerance", Assert.Throws<BusinessRuleException>(() => order.Receive(receipt, tolerancePct)).Code);
            Assert.Equal(0m, order.Lines.Single().ReceivedQty);
        }
    }

    [Fact]
    public void Receipt_rejects_unknown_lines_and_invalid_quantities()
    {
        var order = InStatus(PurchaseOrderStatus.Approved);
        Assert.Equal("purchase_order_line_not_found",
            Assert.Throws<BusinessRuleException>(() => order.Receive([new LineReceipt(Guid.NewGuid(), 1)], 0)).Code);
        Assert.Equal("invalid_quantity",
            Assert.Throws<BusinessRuleException>(() => order.Receive([new LineReceipt(order.Lines.Single().Id, 0)], 0)).Code);
        Assert.Equal("goods_receipt_without_lines", Assert.Throws<BusinessRuleException>(() => order.Receive([], 0)).Code);
    }

    [Fact]
    public void Manual_lines_cannot_repeat_items_but_requisition_lines_can()
    {
        var item = Guid.NewGuid();
        Assert.Equal("purchase_order_line_duplicated", Assert.Throws<BusinessRuleException>(() => new PurchaseOrder("OC-1", Guid.NewGuid(),
            Guid.NewGuid(), null, null, [new PurchaseOrderLineInput(item, 1, 1, 0, null), new PurchaseOrderLineInput(item, 2, 1, 0, null)])).Code);

        var fromRequisitions = new PurchaseOrder("OC-2", Guid.NewGuid(), Guid.NewGuid(), null, null,
            [new PurchaseOrderLineInput(item, 1, 1, 0, Guid.NewGuid()), new PurchaseOrderLineInput(item, 2, 1, 0, Guid.NewGuid())]);
        Assert.Equal(2, fromRequisitions.Lines.Count);
    }

    [Fact]
    public void Goods_receipt_posts_base_units_at_price_over_factor()
    {
        var receiptId = Guid.NewGuid();
        var location = Guid.NewGuid();
        var lot = Guid.NewGuid();
        var receipt = new GoodsReceipt(receiptId, "REC-000001", Guid.NewGuid(), location, Now, User, " F-1 ",
        [
            new GoodsReceiptLineInput(Guid.NewGuid(), Guid.NewGuid(), 3, 412.5m, 25, lot, "L-1", new DateOnly(2027, 1, 1)), // caja de 25 kg
            new GoodsReceiptLineInput(Guid.NewGuid(), Guid.NewGuid(), 2, 10, 3, null, null, null),
        ]);

        Assert.Equal("F-1", receipt.SupplierInvoiceNumber);
        var flour = receipt.Lines[0];
        Assert.Equal((75m, 16.5m, 1237.5m), (flour.BaseQuantity, flour.UnitCostBase, flour.Amount));
        Assert.Equal(3.3333m, receipt.Lines[1].UnitCostBase); // 10 / 3 rounded to 4 decimals
        Assert.Equal(1257.5m, receipt.TotalCost);

        var movements = receipt.ToMovementRequests();
        Assert.All(movements, m => Assert.Equal((MovementType.PurchaseReceipt, location, GoodsReceipt.DocType, receiptId),
            (m.Type, m.LocationId, m.SourceDocType, m.SourceDocId)));
        Assert.Equal((75m, 16.5m, (Guid?)lot), (movements[0].Quantity, movements[0].UnitCost, movements[0].LotId));
    }
}
