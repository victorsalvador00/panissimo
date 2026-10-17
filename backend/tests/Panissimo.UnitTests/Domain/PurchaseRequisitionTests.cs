using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.UnitTests.Domain;

public class PurchaseRequisitionTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);
    private static readonly Guid Plant = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);

    private static PurchaseRequisition Requisition(string folio = "REQ-000001", DateOnly? neededBy = null, params RequisitionLineInput[] lines) =>
        new(folio, Plant, neededBy ?? Today.AddDays(7), null,
            lines.Length > 0 ? lines : [new RequisitionLineInput(Guid.NewGuid(), 40, Guid.NewGuid())], Today);

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    [Fact]
    public void Needed_by_cannot_be_in_the_past()
    {
        Assert.Equal("needed_by_past", Code(() => Requisition(neededBy: Today.AddDays(-1))));
        Assert.Equal(Today, Requisition(neededBy: Today).NeededBy);
    }

    [Fact]
    public void Lines_need_positive_quantities_and_no_repeated_items()
    {
        var item = Guid.NewGuid();
        Assert.Equal("invalid_quantity", Code(() => Requisition(lines: new RequisitionLineInput(item, 0, null))));
        Assert.Equal("invalid_quantity", Code(() => Requisition(lines: new RequisitionLineInput(item, 1.00001m, null))));
        Assert.Equal("requisition_line_duplicated",
            Code(() => Requisition(lines: [new RequisitionLineInput(item, 1, null), new RequisitionLineInput(item, 2, null)])));
    }

    [Fact]
    public void Submitting_requires_a_supplier_on_every_line()
    {
        var requisition = Requisition(lines: [new RequisitionLineInput(Guid.NewGuid(), 1, Guid.NewGuid()), new RequisitionLineInput(Guid.NewGuid(), 2, null)]);
        Assert.Equal("requisition_supplier_missing", Code(() => requisition.Submit(Today, Now, null)));
        Assert.Equal(RequisitionStatus.Draft, requisition.Status);
    }

    [Fact]
    public void Submitting_after_the_needed_date_fails()
    {
        var requisition = Requisition(neededBy: Today);
        Assert.Equal("needed_by_past", Code(() => requisition.Submit(Today.AddDays(1), Now, null)));
    }

    [Fact]
    public void Happy_path_draft_submitted_approved_converted()
    {
        var user = Guid.NewGuid();
        var requisition = Requisition();
        requisition.Submit(Today, Now, user);
        Assert.Equal((RequisitionStatus.Submitted, user), (requisition.Status, requisition.SubmittedBy));

        Assert.Equal("invalid_requisition_status", Code(() => requisition.UpdateDraft(Today, null, [new RequisitionLineInput(Guid.NewGuid(), 1, null)], Today)));
        Assert.Equal("invalid_requisition_status", Code(() => requisition.MarkConverted(Now)));

        requisition.Approve(Now, user);
        requisition.MarkConverted(Now);
        Assert.Equal(RequisitionStatus.Converted, requisition.Status);
        Assert.Equal("invalid_requisition_status", Code(requisition.Cancel));
    }

    [Fact]
    public void Rejecting_needs_a_reason_and_only_from_submitted()
    {
        var requisition = Requisition();
        Assert.Equal("invalid_requisition_status", Code(() => requisition.Reject("No", Now, null)));
        requisition.Submit(Today, Now, null);
        Assert.Equal("rejection_reason_required", Code(() => requisition.Reject(" ", Now, null)));
        requisition.Reject(" Hay existencia ", Now, null);
        Assert.Equal((RequisitionStatus.Rejected, "Hay existencia"), (requisition.Status, requisition.RejectionReason));
        Assert.Equal("invalid_requisition_status", Code(requisition.Cancel));
    }

    [Theory]
    [InlineData(0)] // Draft
    [InlineData(1)] // Submitted
    [InlineData(2)] // Approved
    public void Cancel_from_draft_submitted_or_approved(int steps)
    {
        var requisition = Requisition();
        if (steps >= 1) requisition.Submit(Today, Now, null);
        if (steps >= 2) requisition.Approve(Now, null);
        requisition.Cancel();
        Assert.Equal(RequisitionStatus.Cancelled, requisition.Status);
    }
}

public class RequisitionConversionTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);

    private static PurchaseRequisition Approved(string folio, Guid location, DateOnly neededBy, params RequisitionLineInput[] lines)
    {
        var requisition = new PurchaseRequisition(folio, location, neededBy, null, lines, Today);
        requisition.Submit(Today, Now, null);
        requisition.Approve(Now, null);
        return requisition;
    }

    [Fact]
    public void Groups_by_supplier_and_delivery_with_one_line_per_requisition_line()
    {
        var plant = Guid.NewGuid();
        var (millA, millB) = (Guid.NewGuid(), Guid.NewGuid());
        var (flour, sugar, yeast) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var r1 = Approved("REQ-000002", plant, Today.AddDays(5),
            new RequisitionLineInput(flour, 10, millA), new RequisitionLineInput(yeast, 3, millB));
        var r2 = Approved("REQ-000001", plant, Today.AddDays(9),
            new RequisitionLineInput(flour, 4, millA), new RequisitionLineInput(sugar, 2.5m, millA));
        var prices = new Dictionary<(Guid, Guid), decimal> { [(millA, flour)] = 612.5m, [(millA, sugar)] = 33.333m, [(millB, yeast)] = 90 };
        var taxes = new Dictionary<Guid, decimal> { [flour] = 0m, [sugar] = 0.16m, [yeast] = 0m };

        var drafts = RequisitionConversion.Group([r1, r2], prices, taxes);

        Assert.Equal(2, drafts.Count);
        var a = drafts.Single(d => d.SupplierId == millA);
        Assert.Equal(["REQ-000001", "REQ-000002"], a.RequisitionFolios);
        Assert.Equal(Today.AddDays(5), a.ExpectedDate); // closest NeededBy
        Assert.Equal(plant, a.DeliveryLocationId);
        Assert.Equal([4m, 2.5m, 10m], a.Lines.Select(l => l.Quantity)); // folio order, then line order
        Assert.Equal(r2.Lines[0].Id, a.Lines[0].RequisitionLineId);
        Assert.Equal(0.16m, a.Lines[1].TaxRate);

        var b = drafts.Single(d => d.SupplierId == millB);
        Assert.Equal(["REQ-000002"], b.RequisitionFolios);
        Assert.Equal(Today.AddDays(5), b.ExpectedDate);
    }

    [Fact]
    public void Same_supplier_at_different_locations_makes_separate_orders()
    {
        var mill = Guid.NewGuid();
        var flour = Guid.NewGuid();
        var drafts = RequisitionConversion.Group(
            [Approved("REQ-1", Guid.NewGuid(), Today, new RequisitionLineInput(flour, 1, mill)),
             Approved("REQ-2", Guid.NewGuid(), Today, new RequisitionLineInput(flour, 1, mill))],
            new Dictionary<(Guid, Guid), decimal> { [(mill, flour)] = 1 }, new Dictionary<Guid, decimal> { [flour] = 0 });
        Assert.Equal(2, drafts.Count);
    }

    [Fact]
    public void Purchase_order_rounds_each_line_to_cents_and_adds_them()
    {
        var order = new PurchaseOrder("OC-000001", Guid.NewGuid(), Guid.NewGuid(), Today, null,
        [
            new PurchaseOrderLineInput(Guid.NewGuid(), 2.5m, 33.333m, 0.16m, null), // 83.3325 → 83.33; IVA 13.3328 → 13.33
            new PurchaseOrderLineInput(Guid.NewGuid(), 3, 0.335m, 0.16m, null),     // 1.005 → 1.01; IVA 0.1616 → 0.16
        ]);
        Assert.Equal([83.33m, 1.01m], order.Lines.Select(l => l.Subtotal));
        Assert.Equal(84.34m, order.Subtotal);
        Assert.Equal(13.49m, order.TaxTotal);
        Assert.Equal(97.83m, order.Total);
        Assert.Equal(PurchaseOrderStatus.Draft, order.Status);
    }
}
