using FluentValidation;
using Panissimo.Application.Catalog;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Purchasing;

namespace Panissimo.Application.Purchasing;

// Suppliers

/// <summary>q searches name or RFC.</summary>
public sealed record SupplierListQuery : CatalogListQuery;

public sealed record SupplierListItemDto(
    Guid Id,
    string TaxId,
    string Name,
    string? ContactName,
    string? Phone,
    string? Email,
    int PaymentTermsDays,
    int ItemCount,
    bool IsActive);

public sealed record SupplierDto(
    Guid Id,
    string TaxId,
    string Name,
    string? ContactName,
    string? Phone,
    string? Email,
    int PaymentTermsDays,
    bool IsActive,
    DateTimeOffset CreatedAt,
    string? CreatedByName,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    uint Version);

/// <summary>Light search of active suppliers for the pickers.</summary>
public sealed record SupplierLookupQuery
{
    public const int MaxResults = 50;

    /// <summary>Name or RFC (contains).</summary>
    public string? Q { get; init; }

    /// <summary>One specific supplier (e.g. the one of an existing document), even if inactive.</summary>
    public Guid? Id { get; init; }
    public int Limit { get; init; } = 20;
}

public sealed record SupplierLookupDto(Guid Id, string TaxId, string Name, int PaymentTermsDays, bool IsActive);

public sealed record CreateSupplierRequest(
    string TaxId,
    string Name,
    string? ContactName,
    string? Phone,
    string? Email,
    int PaymentTermsDays) : ISupplierFields
{
    public SupplierDefinition ToDefinition() => new(TaxId, Name, ContactName, Phone, Email, PaymentTermsDays);
}

/// <summary>Deactivating removes the supplier's preferences (RN-35).</summary>
public sealed record UpdateSupplierRequest(
    uint Version,
    string TaxId,
    string Name,
    string? ContactName,
    string? Phone,
    string? Email,
    int PaymentTermsDays,
    bool IsActive) : ISupplierFields
{
    public SupplierDefinition ToDefinition() => new(TaxId, Name, ContactName, Phone, Email, PaymentTermsDays);
}

// Supplier items

public sealed record SupplierItemListQuery
{
    public bool IncludeInactive { get; init; }
}

/// <summary>
/// <c>Price</c> is per purchase unit (or base unit when the item has none); <c>PricePerBaseUnit</c> = Price / factor.
/// </summary>
public sealed record SupplierItemDto(
    Guid Id,
    Guid SupplierId,
    Guid ItemId,
    string ItemSku,
    string ItemName,
    ItemType ItemType,
    bool ItemIsActive,
    string BaseUomCode,
    string? PurchaseUomCode,
    decimal PurchaseToBaseFactor,
    string? SupplierSku,
    decimal Price,
    decimal PricePerBaseUnit,
    int LeadTimeDays,
    bool IsPreferred,
    bool IsActive,
    uint Version);

public sealed record CreateSupplierItemRequest(Guid ItemId, string? SupplierSku, decimal Price, int LeadTimeDays, bool IsPreferred)
    : ISupplierItemFields;

/// <summary>Marking it preferred unmarks the item's previous preferred supplier; an inactive row is never preferred.</summary>
public sealed record UpdateSupplierItemRequest(
    uint Version,
    string? SupplierSku,
    decimal Price,
    int LeadTimeDays,
    bool IsPreferred,
    bool IsActive) : ISupplierItemFields;

/// <summary>An active supplier selling the item: preferred first, then cheapest per base unit.</summary>
public sealed record SupplierOfferDto(
    Guid SupplierItemId,
    Guid SupplierId,
    string SupplierTaxId,
    string SupplierName,
    int PaymentTermsDays,
    string? SupplierSku,
    string? PurchaseUomCode,
    decimal Price,
    decimal PricePerBaseUnit,
    int LeadTimeDays,
    bool IsPreferred);

// Validators

/// <summary>Fields shared by create and update, so both validate the same way.</summary>
public interface ISupplierFields
{
    string TaxId { get; }
    string Name { get; }
    string? ContactName { get; }
    string? Phone { get; }
    string? Email { get; }
    int PaymentTermsDays { get; }
}

public interface ISupplierItemFields
{
    string? SupplierSku { get; }
    decimal Price { get; }
    int LeadTimeDays { get; }
}

public sealed class SupplierFieldsValidator : AbstractValidator<ISupplierFields>
{
    public SupplierFieldsValidator()
    {
        RuleFor(x => x.TaxId).Cascade(CascadeMode.Stop).NotEmpty().WithName("RFC")
            .Must(t => TaxIdRules.IsValid(TaxIdRules.Normalize(t))).WithMessage(TaxIdRules.InvalidMessage);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(SupplierRules.NameMaxLength).WithName("Razón social");
        RuleFor(x => x.ContactName).MaximumLength(SupplierRules.ContactNameMaxLength).WithName("Contacto");
        RuleFor(x => x.Phone).MaximumLength(SupplierRules.PhoneMaxLength).WithName("Teléfono");
        RuleFor(x => x.Email).EmailAddress().MaximumLength(SupplierRules.EmailMaxLength).WithName("Correo")
            .When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.PaymentTermsDays).InclusiveBetween(0, SupplierRules.MaxPaymentTermsDays).WithName("Días de crédito");
    }
}

public sealed class SupplierItemFieldsValidator : AbstractValidator<ISupplierItemFields>
{
    public SupplierItemFieldsValidator()
    {
        RuleFor(x => x.SupplierSku).MaximumLength(SupplierRules.SupplierSkuMaxLength).WithName("Clave del proveedor");
        RuleFor(x => x.Price).Cascade(CascadeMode.Stop).GreaterThanOrEqualTo(0).WithName("Precio")
            .Must(p => decimal.Round(p, 4) == p).WithMessage("El precio admite máximo 4 decimales.");
        RuleFor(x => x.LeadTimeDays).InclusiveBetween(0, SupplierRules.MaxLeadTimeDays).WithName("Días de entrega");
    }
}

public sealed class CreateSupplierRequestValidator : AbstractValidator<CreateSupplierRequest>
{
    public CreateSupplierRequestValidator() => Include(new SupplierFieldsValidator());
}

public sealed class UpdateSupplierRequestValidator : AbstractValidator<UpdateSupplierRequest>
{
    public UpdateSupplierRequestValidator() => Include(new SupplierFieldsValidator());
}

public sealed class CreateSupplierItemRequestValidator : AbstractValidator<CreateSupplierItemRequest>
{
    public CreateSupplierItemRequestValidator()
    {
        RuleFor(x => x.ItemId).NotEmpty().WithName("Artículo");
        Include(new SupplierItemFieldsValidator());
    }
}

public sealed class UpdateSupplierItemRequestValidator : AbstractValidator<UpdateSupplierItemRequest>
{
    public UpdateSupplierItemRequestValidator()
    {
        Include(new SupplierItemFieldsValidator());
        RuleFor(x => x.IsPreferred).Must((x, preferred) => !preferred || x.IsActive)
            .WithMessage("Un artículo de proveedor inactivo no puede ser el preferido.");
    }
}
