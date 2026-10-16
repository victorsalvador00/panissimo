using Sgo.Domain.Common;
using Sgo.Domain.Purchasing;

namespace Sgo.UnitTests.Domain.Purchasing;

public class RequisitionTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 24, 18, 0, 0, TimeSpan.Zero);
    private static readonly Guid User = Guid.NewGuid();
    private static readonly Guid Factory = Guid.NewGuid();
    private static readonly Guid Commissary = Guid.NewGuid();

    private static PurchaseRequisition New(Guid? location = null, DateOnly? neededBy = null, params RequisitionLineInput[] lines) =>
        new($"REQ-{Random.Shared.Next(1, 999999):D6}", location ?? Factory, neededBy ?? new DateOnly(2026, 10, 1), null,
            lines.Length > 0 ? lines : [new RequisitionLineInput(Guid.NewGuid(), 5, Guid.NewGuid())]);

    private static PurchaseRequisition Approved(Guid? location = null, DateOnly? neededBy = null, params RequisitionLineInput[] lines)
    {
        var requisition = New(location, neededBy, lines);
        requisition.Submit(Now, User);
        requisition.Approve(Now, User);
        return requisition;
    }

    [Fact]
    public void Happy_path_Draft_Submitted_Approved_Converted()
    {
        var requisition = New();
        Assert.Equal(RequisitionStatus.Draft, requisition.Status);

        requisition.Submit(Now, User);
        Assert.Equal((RequisitionStatus.Submitted, Now, User), (requisition.Status, requisition.SubmittedAt!.Value, requisition.SubmittedBy!.Value));

        requisition.Approve(Now, User);
        Assert.Equal((RequisitionStatus.Approved, User), (requisition.Status, requisition.ApprovedBy!.Value));

        requisition.MarkConverted(Now, User);
        Assert.Equal((RequisitionStatus.Converted, User), (requisition.Status, requisition.ConvertedBy!.Value));
    }

    [Fact]
    public void Cannot_submit_with_lines_without_supplier()
    {
        var requisition = New(lines: new RequisitionLineInput(Guid.NewGuid(), 1, null));
        Assert.Equal("requisition_line_without_supplier", Assert.Throws<BusinessRuleException>(() => requisition.Submit(Now, User)).Code);
    }

    [Fact]
    public void Only_drafts_are_edited_or_submitted()
    {
        var requisition = New();
        requisition.Submit(Now, User);

        Assert.Throws<BusinessRuleException>(() => requisition.UpdateDraft(new DateOnly(2026, 10, 2), null,
            [new RequisitionLineInput(Guid.NewGuid(), 1, Guid.NewGuid())]));
        Assert.Throws<BusinessRuleException>(() => requisition.Submit(Now, User));
    }

    [Fact]
    public void Only_submitted_requisitions_are_approved_or_rejected()
    {
        var draft = New();
        Assert.Throws<BusinessRuleException>(() => draft.Approve(Now, User));
        Assert.Throws<BusinessRuleException>(() => draft.Reject("No", Now, User));
    }

    [Fact]
    public void Rejection_needs_a_reason()
    {
        var requisition = New();
        requisition.Submit(Now, User);
        Assert.Equal("requisition_rejection_reason_required",
            Assert.Throws<BusinessRuleException>(() => requisition.Reject("  ", Now, User)).Code);

        requisition.Reject(" Hay existencia ", Now, User);
        Assert.Equal((RequisitionStatus.Rejected, "Hay existencia"), (requisition.Status, requisition.RejectionReason));
    }

    [Fact]
    public void Cancel_is_allowed_until_converted()
    {
        var draft = New();
        draft.Cancel();
        Assert.Equal(RequisitionStatus.Cancelled, draft.Status);

        var approved = Approved();
        approved.Cancel();
        Assert.Equal(RequisitionStatus.Cancelled, approved.Status);

        var converted = Approved();
        converted.MarkConverted(Now, User);
        Assert.Equal("requisition_not_cancellable", Assert.Throws<BusinessRuleException>(converted.Cancel).Code);

        var rejected = New();
        rejected.Submit(Now, User);
        rejected.Reject("No", Now, User);
        Assert.Throws<BusinessRuleException>(rejected.Cancel);
    }

    [Fact]
    public void Lines_need_positive_quantities_and_distinct_items()
    {
        var item = Guid.NewGuid();
        Assert.Equal("invalid_quantity", Assert.Throws<BusinessRuleException>(() => New(lines: new RequisitionLineInput(item, 0, null))).Code);
        Assert.Equal("requisition_line_duplicated", Assert.Throws<BusinessRuleException>(() =>
            New(lines: [new RequisitionLineInput(item, 1, null), new RequisitionLineInput(item, 2, null)])).Code);
    }

    [Fact]
    public void Purchase_order_totals_round_each_line_to_cents()
    {
        var order = new PurchaseOrder("OC-000001", Guid.NewGuid(), Factory, null, null,
        [
            new PurchaseOrderLineInput(Guid.NewGuid(), 3, 10.3333m, 0.16m, null), // 30.9999 → 31.00; IVA 4.96
            new PurchaseOrderLineInput(Guid.NewGuid(), 2.5m, 412.5m, 0m, null),  // 1031.25; IVA 0
        ]);

        Assert.Equal(PurchaseOrderStatus.Draft, order.Status);
        Assert.Equal(1062.25m, order.Subtotal);
        Assert.Equal(4.96m, order.TaxTotal);
        Assert.Equal(1067.21m, order.Total);
    }

    [Fact]
    public void Conversion_groups_by_supplier_and_delivery_location()
    {
        var (supplierA, supplierB) = (Guid.NewGuid(), Guid.NewGuid());
        var (flour, sugar, milk) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var r1 = Approved(Factory, new DateOnly(2026, 10, 5),
            new RequisitionLineInput(flour, 8, supplierA), new RequisitionLineInput(milk, 4, supplierB));
        var r2 = Approved(Factory, new DateOnly(2026, 10, 2), new RequisitionLineInput(flour, 2, supplierA), new RequisitionLineInput(sugar, 1, supplierA));
        var r3 = Approved(Commissary, new DateOnly(2026, 10, 3), new RequisitionLineInput(flour, 5, supplierA));
        var prices = new Dictionary<(Guid, Guid), decimal> { [(supplierA, flour)] = 400, [(supplierA, sugar)] = 30, [(supplierB, milk)] = 25 };

        var plans = RequisitionConversion.Plan([r1, r2, r3], (s, i) => prices[(s, i)], i => i == milk ? 0m : 0.16m);

        Assert.Equal(3, plans.Count);
        var aFactory = plans.Single(p => p.SupplierId == supplierA && p.DeliveryLocationId == Factory);
        Assert.Equal(new DateOnly(2026, 10, 2), aFactory.ExpectedDate); // earliest NeededBy
        Assert.Equal(new[] { r1.Folio, r2.Folio }.Order(), aFactory.RequisitionFolios);
        // One PO line per requisition line: flour is not merged, so each line keeps its requisition link.
        Assert.Equal(3, aFactory.Lines.Count);
        Assert.Equal([8m, 2m], aFactory.Lines.Where(l => l.ItemId == flour).Select(l => l.Quantity).Order().Reverse());
        Assert.All(aFactory.Lines, l => Assert.NotNull(l.RequisitionLineId));
        Assert.Equal(400m, aFactory.Lines.First(l => l.ItemId == flour).UnitPrice);

        Assert.Equal(5m, plans.Single(p => p.SupplierId == supplierA && p.DeliveryLocationId == Commissary).Lines.Single().Quantity);
        var bFactory = plans.Single(p => p.SupplierId == supplierB);
        Assert.Equal((milk, 25m, 0m), (bFactory.Lines.Single().ItemId, bFactory.Lines.Single().UnitPrice, bFactory.Lines.Single().TaxRate));
    }

    [Fact]
    public void Only_approved_requisitions_are_converted()
    {
        var submitted = New();
        submitted.Submit(Now, User);

        var error = Assert.Throws<BusinessRuleException>(() => RequisitionConversion.Plan([Approved(), submitted], (_, _) => 1, _ => 0));
        Assert.Equal("requisition_not_approved", error.Code);
        Assert.Contains(submitted.Folio, error.Message);
    }
}
