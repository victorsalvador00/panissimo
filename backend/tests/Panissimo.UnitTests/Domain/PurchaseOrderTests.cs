using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.UnitTests.Domain;

public class PurchaseOrderTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);
    private static readonly Guid User = Guid.NewGuid();

    private static PurchaseOrder Order(params PurchaseOrderLineInput[] lines) =>
        new("OC-000001", Guid.NewGuid(), Guid.NewGuid(), new DateOnly(2026, 10, 24), null,
            lines.Length > 0 ? lines : [new PurchaseOrderLineInput(Guid.NewGuid(), 10, 100m, 0m, null)]);

    private static PurchaseOrder Approved(params PurchaseOrderLineInput[] lines)
    {
        var order = Order(lines);
        order.Submit(0, Now, User);
        order.Approve(Now, User);
        return order;
    }

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Theory]
    [InlineData(999.99, PurchaseOrderStatus.PendingApproval)] // subtotal 1000 ≥ threshold
    [InlineData(1000, PurchaseOrderStatus.PendingApproval)]
    [InlineData(1000.01, PurchaseOrderStatus.Approved)]
    public void Submit_uses_the_approval_threshold_on_the_subtotal(decimal threshold, PurchaseOrderStatus expected)
    {
        var order = Order();
        order.Submit(threshold, Now, User);
        Assert.Equal(expected, order.Status);
        Assert.Equal(expected == PurchaseOrderStatus.Approved, order.ApprovedAt is not null);
        Assert.Null(order.ApprovedBy);
    }

    [Fact]
    public void Only_drafts_are_edited_and_submitted()
    {
        var order = Approved();
        Assert.Equal("invalid_purchase_order_status", Code(() => order.Submit(0, Now, User)));
        Assert.Equal("invalid_purchase_order_status",
            Code(() => order.UpdateDraft(Guid.NewGuid(), new DateOnly(2026, 10, 25), null, [new PurchaseOrderLineInput(Guid.NewGuid(), 1, 1, 0, null)])));
    }

    [Fact]
    public void Rejection_needs_a_reason_and_is_final()
    {
        var order = Order();
        order.Submit(0, Now, User);
        Assert.Equal("rejection_reason_required", Code(() => order.Reject(" ", Now, User)));
        order.Reject("Caro", Now, User);
        Assert.Equal(PurchaseOrderStatus.Rejected, order.Status);
        Assert.Equal("invalid_purchase_order_status", Code(() => order.Approve(Now, User)));
        Assert.Equal("invalid_purchase_order_status", Code(order.Cancel));
    }

    [Fact]
    public void A_line_received_in_several_lots_adds_up_and_completes_the_order()
    {
        var order = Approved();
        var line = order.Lines.Single();
        order.RegisterReceipt([new PurchaseReceiptQuantity(line.Id, 4)], 0);
        Assert.Equal((PurchaseOrderStatus.PartiallyReceived, 6m), (order.Status, line.PendingQty));

        order.RegisterReceipt([new PurchaseReceiptQuantity(line.Id, 3), new PurchaseReceiptQuantity(line.Id, 3)], 0);
        Assert.Equal((PurchaseOrderStatus.Received, 10m, 0m), (order.Status, line.ReceivedQty, line.PendingQty));
    }

    [Fact]
    public void Over_receipt_beyond_tolerance_is_rejected_and_changes_nothing()
    {
        var order = Approved();
        var line = order.Lines.Single();
        Assert.Equal("receipt_over_tolerance", Code(() => order.RegisterReceipt([new PurchaseReceiptQuantity(line.Id, 10.1m)], 0)));
        Assert.Equal(0m, line.ReceivedQty);

        order.RegisterReceipt([new PurchaseReceiptQuantity(line.Id, 10.5m)], 5);
        Assert.Equal((PurchaseOrderStatus.Received, 0m), (order.Status, line.PendingQty));
    }

    [Fact]
    public void Only_approved_or_partially_received_orders_are_received()
    {
        var draft = Order();
        Assert.Equal("purchase_order_not_receivable", Code(() => draft.RegisterReceipt([new PurchaseReceiptQuantity(draft.Lines[0].Id, 1)], 0)));
        var approved = Approved();
        Assert.Equal("purchase_order_line_not_found", Code(() => approved.RegisterReceipt([new PurchaseReceiptQuantity(Guid.NewGuid(), 1)], 0)));
    }

    [Fact]
    public void Cancel_only_without_receipts_and_close_only_with_a_balance()
    {
        Assert.Equal("invalid_purchase_order_status", Code(() => Approved().Close("Sin saldo", Now, User)));

        var order = Approved(new PurchaseOrderLineInput(Guid.NewGuid(), 10, 1, 0, null), new PurchaseOrderLineInput(Guid.NewGuid(), 5, 1, 0, null));
        order.RegisterReceipt([new PurchaseReceiptQuantity(order.Lines[0].Id, 10)], 0);
        Assert.Equal(PurchaseOrderStatus.PartiallyReceived, order.Status);
        Assert.Equal("invalid_purchase_order_status", Code(order.Cancel));

        Assert.Equal("close_reason_required", Code(() => order.Close(" ", Now, User)));
        order.Close("El proveedor no surte el saldo", Now, User);
        Assert.Equal((PurchaseOrderStatus.Closed, User, "El proveedor no surte el saldo"), (order.Status, order.ClosedBy, order.CloseReason));

        var fresh = Approved();
        fresh.Cancel();
        Assert.Equal(PurchaseOrderStatus.Cancelled, fresh.Status);
    }

    [Theory]
    [InlineData(6, 44, 264)]
    [InlineData(1.5, 0.3333, 0.5)]
    public void Base_quantity_is_purchase_quantity_times_factor(decimal qty, decimal factor, decimal expected) =>
        Assert.Equal(expected, PurchaseReceiptMath.BaseQuantity(qty, factor));

    [Fact]
    public void Base_cost_is_price_over_factor_without_vat() =>
        Assert.Equal(20.5m, PurchaseReceiptMath.UnitCostBase(902m, 44m));
}
