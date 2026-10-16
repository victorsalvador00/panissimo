using Sgo.Application.Purchasing;

namespace Sgo.UnitTests.Application;

public class PurchasingValidatorsTests
{
    private static CreateSupplierRequest ValidSupplier() =>
        new("HPA010203AB1", "Harinas del Pacífico", "Marta Ríos", "33 1234 5678", "ventas@harinas.mx", 30);

    private static IEnumerable<string> ErrorsOf(FluentValidation.Results.ValidationResult result, string property) =>
        result.Errors.Where(e => e.PropertyName == property).Select(e => e.ErrorMessage);

    [Fact]
    public void Valid_supplier_passes() => Assert.True(new CreateSupplierRequestValidator().Validate(ValidSupplier()).IsValid);

    [Fact]
    public void Supplier_without_contact_data_passes() =>
        Assert.True(new CreateSupplierRequestValidator().Validate(ValidSupplier() with { ContactName = null, Phone = null, Email = "" }).IsValid);

    [Fact]
    public void Supplier_tax_id_must_follow_the_SAT_format()
    {
        var result = new CreateSupplierRequestValidator().Validate(ValidSupplier() with { TaxId = "ABC123" });
        Assert.Contains("El RFC no tiene un formato válido (12 caracteres persona moral, 13 persona física).", ErrorsOf(result, "TaxId"));
    }

    [Theory]
    [InlineData("no-es-correo", 30)]
    [InlineData("ventas@harinas.mx", -1)]
    [InlineData("ventas@harinas.mx", 366)]
    public void Supplier_rejects_bad_email_or_payment_terms(string email, int days) =>
        Assert.False(new CreateSupplierRequestValidator().Validate(ValidSupplier() with { Email = email, PaymentTermsDays = days }).IsValid);

    [Theory]
    [InlineData(-1, 0, false)]
    [InlineData(1.00001, 0, false)]
    [InlineData(10, -1, false)]
    [InlineData(0, 0, true)]
    [InlineData(412.5, 3, true)]
    public void Supplier_item_price_and_lead_time(decimal price, int leadTime, bool valid) =>
        Assert.Equal(valid, new CreateSupplierItemRequestValidator()
            .Validate(new CreateSupplierItemRequest(Guid.NewGuid(), null, price, leadTime, false)).IsValid);

    [Fact]
    public void Inactive_supplier_item_cannot_be_preferred()
    {
        var result = new UpdateSupplierItemRequestValidator().Validate(new UpdateSupplierItemRequest(1, null, 10, 0, true, false));
        Assert.Contains("Un artículo inactivo no puede ser el preferido.", ErrorsOf(result, "IsPreferred"));
    }

    [Fact]
    public void Requisition_rejects_repeated_items_and_non_positive_quantities()
    {
        var item = Guid.NewGuid();
        var repeated = new CreateRequisitionRequestValidator().Validate(new CreateRequisitionRequest(Guid.NewGuid(), new DateOnly(2026, 10, 1), null,
            [new RequisitionLineRequest(item, 1, null), new RequisitionLineRequest(item, 2, null)]));
        Assert.Contains("Hay artículos repetidos en la requisición.", ErrorsOf(repeated, "Lines"));

        var zero = new CreateRequisitionRequestValidator().Validate(new CreateRequisitionRequest(Guid.NewGuid(), new DateOnly(2026, 10, 1), null,
            [new RequisitionLineRequest(item, 0, null)]));
        Assert.False(zero.IsValid);
    }

    [Fact]
    public void Rejection_needs_a_reason() =>
        Assert.False(new RejectRequisitionRequestValidator().Validate(new RejectRequisitionRequest(1, " ")).IsValid);

    [Fact]
    public void Conversion_needs_distinct_requisitions()
    {
        var id = Guid.NewGuid();
        Assert.Contains("Selecciona al menos una requisición.",
            ErrorsOf(new ConvertRequisitionsRequestValidator().Validate(new ConvertRequisitionsRequest([])), "RequisitionIds"));
        Assert.Contains("Hay requisiciones repetidas.",
            ErrorsOf(new ConvertRequisitionsRequestValidator().Validate(new ConvertRequisitionsRequest([id, id])), "RequisitionIds"));
        Assert.True(new ConvertRequisitionsRequestValidator().Validate(new ConvertRequisitionsRequest([id, Guid.NewGuid()])).IsValid);
    }
}
