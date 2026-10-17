using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Sales;

namespace Panissimo.UnitTests.Domain;

public class CustomerTests
{
    private static readonly DateOnly Today = new(2026, 10, 17);
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 15, 0, 0, TimeSpan.Zero);

    private static CustomerDefinition Definition(string? taxId = null) => new(" Cafeterías del Bajío ", taxId, null, " ", null, null);

    private static string Code(Action action) => Assert.Throws<BusinessRuleException>(action).Code;

    private static CustomerOrder Order(params CustomerOrderLineInput[] lines) =>
        new("PC-000001", Guid.NewGuid(), Guid.NewGuid(),
            new CustomerOrderPlan(null, Today.AddDays(1), " OC-1 ", null, lines.Length > 0 ? lines : [new CustomerOrderLineInput(Guid.NewGuid(), 12, null)]),
            Today);

    [Fact]
    public void Customer_code_is_upper_case_and_the_rfc_is_optional()
    {
        var customer = new Customer(" cli-001 ", Definition());
        Assert.Equal(("CLI-001", "Cafeterías del Bajío", null, null), (customer.Code, customer.Name, customer.TaxId, customer.Phone));

        Assert.Equal("CBA010522AT1", new Customer("CLI-002", Definition("cba010522at1")).TaxId);
        Assert.Equal("invalid_tax_id", Code(() => new Customer("CLI-003", Definition("CBA011322AT1"))));
        Assert.Equal("invalid_customer_code", Code(() => new Customer("CLI 004", Definition())));
    }

    [Theory]
    [InlineData(ItemType.FinishedGood, ItemPresentation.Packaged, true)]
    [InlineData(ItemType.FinishedGood, ItemPresentation.Bulk, false)]
    [InlineData(ItemType.SemiFinished, null, false)]
    [InlineData(ItemType.Supply, null, false)]
    public void Customers_buy_packaged_finished_goods_only(ItemType type, ItemPresentation? presentation, bool expected) =>
        Assert.Equal(expected, CustomerRules.IsSellable(type, presentation));

    [Fact]
    public void Customer_item_price_is_optional_but_not_negative()
    {
        Assert.Null(new CustomerItem(Guid.NewGuid(), Guid.NewGuid(), null, null).Price);
        Assert.Equal("invalid_price", Code(() => new CustomerItem(Guid.NewGuid(), Guid.NewGuid(), null, -1)));
    }

    [Fact]
    public void Order_lines_do_not_repeat_and_the_date_is_not_past()
    {
        var item = Guid.NewGuid();
        Assert.Equal("customer_order_line_duplicated", Code(() => Order(new(item, 1, null), new(item, 2, null))));
        Assert.Equal("required_date_past", Code(() => new CustomerOrder("PC-1", Guid.NewGuid(), Guid.NewGuid(),
            new CustomerOrderPlan(null, Today.AddDays(-1), null, null, [new(item, 1, null)]), Today)));
        Assert.Equal("OC-1", Order().CustomerReference);
    }

    [Fact]
    public void A_confirmed_order_is_not_edited_and_cancels_without_shipments()
    {
        var order = Order();
        order.Confirm(Today, Now, null);
        Assert.Equal(CustomerOrderStatus.Confirmed, order.Status);
        Assert.Equal("invalid_customer_order_status",
            Code(() => order.UpdateDraft(new CustomerOrderPlan(null, Today, null, null, [new(Guid.NewGuid(), 1, null)]), Today)));
        Assert.Equal("invalid_customer_order_status", Code(() => order.Confirm(Today, Now, null)));

        order.Cancel(Now);
        Assert.Equal(CustomerOrderStatus.Cancelled, order.Status);
        Assert.Equal("invalid_customer_order_status", Code(() => order.Cancel(Now)));
    }

    [Fact]
    public void Confirming_after_the_required_date_fails()
    {
        var order = Order();
        Assert.Equal("required_date_past", Code(() => order.Confirm(Today.AddDays(2), Now, null)));
    }

    [Fact]
    public void Closing_with_balance_needs_a_partial_shipment()
    {
        var order = Order();
        order.Confirm(Today, Now, null);
        Assert.Equal("invalid_customer_order_status", Code(() => order.Close("Ya no", Now, null)));
    }
}
