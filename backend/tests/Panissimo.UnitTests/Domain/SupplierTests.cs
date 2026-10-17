using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.UnitTests.Domain;

public class TaxIdRulesTests
{
    [Theory]
    [InlineData("HAM980312AB5")]   // moral: 3 letters
    [InlineData("ROGA850228XY1")]  // física: 4 letters
    [InlineData("GOMA000229AB1")]  // Feb 29 of 2000
    [InlineData("&ÑA010101A1A")]
    [InlineData(TaxIdRules.GenericNational)]
    [InlineData(TaxIdRules.GenericForeign)]
    public void Valid_rfcs(string taxId) => Assert.True(TaxIdRules.IsValid(taxId));

    [Theory]
    [InlineData("HAM98031AB5")]     // 11 characters
    [InlineData("ROGAX850228XY1")]  // 14 characters
    [InlineData("HAM981312AB5")]    // month 13
    [InlineData("HAM980231AB5")]    // Feb 31
    [InlineData("ROGA850229XY1")]   // Feb 29 of a non-leap year
    [InlineData("H4M980312AB5")]    // digit in the name part
    [InlineData("HAM980312AB-")]
    [InlineData("ham980312ab5")]    // must be normalized first
    public void Invalid_rfcs(string taxId) => Assert.False(TaxIdRules.IsValid(taxId));

    [Fact]
    public void Normalize_trims_and_upper_cases() => Assert.Equal("HAM980312AB5", TaxIdRules.Normalize("  ham980312ab5 "));

    [Fact]
    public void Only_the_two_generic_rfcs_are_generic()
    {
        Assert.True(TaxIdRules.IsGeneric("XAXX010101000"));
        Assert.True(TaxIdRules.IsGeneric("XEXX010101000"));
        Assert.False(TaxIdRules.IsGeneric("HAM980312AB5"));
    }
}

public class SupplierTests
{
    private static SupplierDefinition Definition(string taxId = "ham980312ab5", int terms = 30) =>
        new(taxId, "  Harinera del Bajío ", " ", null, "ventas@harinera.mx", terms);

    [Fact]
    public void Supplier_normalizes_its_rfc_and_blank_fields()
    {
        var supplier = new Supplier(Definition());
        Assert.Equal("HAM980312AB5", supplier.TaxId);
        Assert.Equal("Harinera del Bajío", supplier.Name);
        Assert.Null(supplier.ContactName);
        Assert.True(supplier.IsActive);
    }

    [Fact]
    public void Invalid_rfc_or_payment_terms_are_rejected()
    {
        Assert.Equal("invalid_tax_id", Assert.Throws<BusinessRuleException>(() => new Supplier(Definition("HAM981312AB5"))).Code);
        Assert.Equal("invalid_payment_terms", Assert.Throws<BusinessRuleException>(() => new Supplier(Definition(terms: 366))).Code);
        Assert.Equal("invalid_payment_terms", Assert.Throws<BusinessRuleException>(() => new Supplier(Definition(terms: -1))).Code);
    }

    [Fact]
    public void Inactive_supplier_items_are_not_editable()
    {
        var supplier = new Supplier(Definition());
        supplier.EnsureEditable();
        supplier.Deactivate();
        Assert.Equal("supplier_inactive", Assert.Throws<BusinessRuleException>(supplier.EnsureEditable).Code);
    }

    [Fact]
    public void An_inactive_row_is_never_preferred()
    {
        var row = new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), " HAR-44 ", 612.5m, 3);
        Assert.Equal("HAR-44", row.SupplierSku);

        row.MarkPreferred();
        Assert.True(row.IsPreferred);

        row.Deactivate();
        Assert.False(row.IsPreferred);
        Assert.Equal("supplier_item_inactive", Assert.Throws<BusinessRuleException>(row.MarkPreferred).Code);
    }

    [Fact]
    public void Price_and_lead_time_cannot_be_negative()
    {
        Assert.Equal("invalid_price", Assert.Throws<BusinessRuleException>(() => new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), null, -1, 3)).Code);
        Assert.Equal("invalid_lead_time", Assert.Throws<BusinessRuleException>(() => new SupplierItem(Guid.NewGuid(), Guid.NewGuid(), null, 1, -1)).Code);
    }

    [Theory]
    [InlineData(ItemType.RawMaterial, true)]
    [InlineData(ItemType.Supply, true)]
    [InlineData(ItemType.SemiFinished, false)]
    [InlineData(ItemType.FinishedGood, false)]
    public void Only_raw_materials_and_supplies_are_purchasable(ItemType type, bool expected) =>
        Assert.Equal(expected, SupplierRules.IsPurchasable(type));
}
