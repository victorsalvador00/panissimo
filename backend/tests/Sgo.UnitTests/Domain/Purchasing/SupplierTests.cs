using Sgo.Domain.Common;
using Sgo.Domain.Purchasing;

namespace Sgo.UnitTests.Domain.Purchasing;

public class SupplierTests
{
    [Theory]
    [InlineData("HPA010203AB1", true)]  // legal entity: 3 letters
    [InlineData("MERL850715K29", true)] // individual: 4 letters
    [InlineData("hpa010203ab1", true)]  // normalized to upper case
    [InlineData("ÑAB010203AB1", true)]
    [InlineData("A&B010203AB1", true)]
    [InlineData("XAXX010101000", true)] // generic RFC
    [InlineData("HPA010230AB1", false)] // February 30th
    [InlineData("HPA011303AB1", false)] // month 13
    [InlineData("HP010203AB1", false)]  // too short
    [InlineData("HPAXX010203AB1", false)]
    [InlineData("HPA010203AB", false)]
    [InlineData("HPA-010203-AB1", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Tax_id_follows_the_SAT_format(string? taxId, bool expected) => Assert.Equal(expected, TaxIdRules.IsValid(taxId));

    [Fact]
    public void New_supplier_is_active_and_normalized()
    {
        var supplier = new Supplier(" hpa010203ab1 ", " Harinas del Pacífico ", "  ", null, " Ventas@Harinas.MX ", 30);

        Assert.Equal("HPA010203AB1", supplier.TaxId);
        Assert.Equal("Harinas del Pacífico", supplier.Name);
        Assert.Null(supplier.ContactName);
        Assert.Equal("ventas@harinas.mx", supplier.Email);
        Assert.Equal(30, supplier.PaymentTermsDays);
        Assert.True(supplier.IsActive);
    }

    [Fact]
    public void Supplier_rejects_invalid_tax_id_and_negative_payment_terms()
    {
        Assert.Equal("supplier_invalid_tax_id",
            Assert.Throws<BusinessRuleException>(() => new Supplier("NOVALIDO", "X", null, null, null, 0)).Code);
        Assert.Equal("supplier_invalid_payment_terms",
            Assert.Throws<BusinessRuleException>(() => new Supplier("HPA010203AB1", "X", null, null, null, -1)).Code);
    }

    [Fact]
    public void Supplier_item_starts_active_and_not_preferred()
    {
        var row = new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), " HP-25 ", 412.5m, 3);

        Assert.Equal("HP-25", row.SupplierSku);
        Assert.Equal(412.5m, row.Price);
        Assert.True(row.IsActive);
        Assert.False(row.IsPreferred);
    }

    [Theory]
    [InlineData(-0.01, 0)]
    [InlineData(1.12345, 0)]
    [InlineData(10, -1)]
    public void Supplier_item_rejects_invalid_price_or_lead_time(decimal price, int leadTime) =>
        Assert.Throws<BusinessRuleException>(() => new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), null, price, leadTime));

    [Fact]
    public void Deactivating_a_preferred_row_unmarks_it_and_an_inactive_row_cannot_be_preferred()
    {
        var row = new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), null, 10, 0);
        row.MarkPreferred();

        row.Deactivate();

        Assert.False(row.IsPreferred);
        Assert.Equal("supplier_item_inactive", Assert.Throws<BusinessRuleException>(row.MarkPreferred).Code);
    }
}
