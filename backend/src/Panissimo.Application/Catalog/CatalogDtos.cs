using FluentValidation;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Application.Catalog;

public record CatalogListQuery : PageQuery
{
    public bool IncludeInactive { get; init; }
}

// Units of measure

public sealed record UnitOfMeasureDto(Guid Id, string Code, string Name, UomKind Kind, bool IsActive, uint Version);

public sealed record CreateUnitOfMeasureRequest(string Code, string Name, UomKind Kind);

/// <summary>The code is fixed once created: the CSV import and other screens refer to units by code.</summary>
public sealed record UpdateUnitOfMeasureRequest(uint Version, string Name, UomKind Kind, bool IsActive);

// Item categories

public sealed record ItemCategoryDto(Guid Id, string Name, bool IsActive, uint Version);

public sealed record CreateItemCategoryRequest(string Name);

public sealed record UpdateItemCategoryRequest(uint Version, string Name, bool IsActive);

// Items

public sealed record ItemListQuery : CatalogListQuery
{
    public ItemType? Type { get; init; }
    public ItemPresentation? Presentation { get; init; }
    public Guid? CategoryId { get; init; }
    public Guid? AreaId { get; init; }

    /// <summary>Packaged versions of a bulk item.</summary>
    public Guid? BulkItemId { get; init; }
}

/// <summary>Light search of active items for the pickers of every module.</summary>
public sealed record ItemLookupQuery
{
    public const int MaxResults = 50;

    /// <summary>SKU or name (contains).</summary>
    public string? Q { get; init; }
    public ItemType? Type { get; init; }
    public ItemPresentation? Presentation { get; init; }
    public Guid? AreaId { get; init; }

    /// <summary>One specific item (e.g. to show a filter that arrives by URL), even if inactive.</summary>
    public Guid? Id { get; init; }
    public int Limit { get; init; } = 20;
}

public sealed record ItemLookupDto(
    Guid Id,
    string Sku,
    string Name,
    ItemType Type,
    ItemPresentation? Presentation,
    string BaseUomCode,
    bool TracksLots,
    int? ShelfLifeDays,
    Guid? ProductionAreaId);

public sealed record ItemListItemDto(
    Guid Id,
    string Sku,
    string? InternalCode,
    string Name,
    ItemType Type,
    ItemPresentation? Presentation,
    Guid CategoryId,
    string CategoryName,
    string BaseUomCode,
    Guid? ProductionAreaId,
    string? ProductionAreaName,
    bool TracksLots,
    StorageCondition StorageCondition,
    bool IsActive);

public sealed record ItemDto(
    Guid Id,
    string Sku,
    string? InternalCode,
    string Name,
    ItemType Type,
    Guid CategoryId,
    Guid BaseUomId,
    string BaseUomCode,
    Guid? PurchaseUomId,
    decimal PurchaseToBaseFactor,
    bool TracksLots,
    int? ShelfLifeDays,
    StorageCondition StorageCondition,
    decimal TaxRate,
    ItemPresentation? Presentation,
    Guid? BulkItemId,
    string? BulkItemSku,
    string? BulkItemName,
    int? UnitsPerPackage,
    Guid? ProductionAreaId,
    decimal ProductionMultiple,
    decimal? UnitWeightGrams,
    bool IsActive,
    DateTimeOffset CreatedAt,
    string? CreatedByName,
    DateTimeOffset? UpdatedAt,
    string? UpdatedByName,
    uint Version);

public sealed record CreateItemRequest(
    string Sku,
    string Name,
    ItemType Type,
    Guid CategoryId,
    Guid BaseUomId,
    Guid? PurchaseUomId,
    decimal? PurchaseToBaseFactor,
    bool TracksLots,
    int? ShelfLifeDays,
    StorageCondition StorageCondition,
    decimal TaxRate,
    ItemPresentation? Presentation,
    Guid? BulkItemId,
    int? UnitsPerPackage,
    Guid? ProductionAreaId,
    decimal? ProductionMultiple,
    decimal? UnitWeightGrams,
    string? InternalCode = null)
{
    public ItemDefinition ToDefinition() => new(Sku, Name, Type, CategoryId, BaseUomId, PurchaseUomId,
        PurchaseToBaseFactor, TracksLots, ShelfLifeDays, StorageCondition, TaxRate, Presentation, BulkItemId,
        UnitsPerPackage, ProductionAreaId, ProductionMultiple, UnitWeightGrams, InternalCode);
}

public sealed record UpdateItemRequest(
    uint Version,
    string Sku,
    string Name,
    ItemType Type,
    Guid CategoryId,
    Guid BaseUomId,
    Guid? PurchaseUomId,
    decimal? PurchaseToBaseFactor,
    bool TracksLots,
    int? ShelfLifeDays,
    StorageCondition StorageCondition,
    decimal TaxRate,
    ItemPresentation? Presentation,
    Guid? BulkItemId,
    int? UnitsPerPackage,
    Guid? ProductionAreaId,
    decimal? ProductionMultiple,
    decimal? UnitWeightGrams,
    bool IsActive,
    string? InternalCode = null)
{
    public ItemDefinition ToDefinition() => new(Sku, Name, Type, CategoryId, BaseUomId, PurchaseUomId,
        PurchaseToBaseFactor, TracksLots, ShelfLifeDays, StorageCondition, TaxRate, Presentation, BulkItemId,
        UnitsPerPackage, ProductionAreaId, ProductionMultiple, UnitWeightGrams, InternalCode);
}

// Min/max per location

/// <summary>One row per active location in the caller's scope; Min/Max are null when not configured.</summary>
public sealed record ItemLocationSettingDto(Guid LocationId, string LocationCode, string LocationName, decimal? MinQty, decimal? MaxQty);

/// <summary>Both null removes the setting for that location.</summary>
public sealed record ItemLocationSettingInput(Guid LocationId, decimal? MinQty, decimal? MaxQty);

public sealed record UpdateItemLocationSettingsRequest(IReadOnlyList<ItemLocationSettingInput> Settings);

// Import

/// <param name="Skipped">Rows left out, with the reason (D-07: a row without internal code).</param>
public sealed record ItemImportResult(int Created, int Updated, IReadOnlyList<ImportError> Skipped);

public static class CatalogMapping
{
    public static UnitOfMeasureDto ToDto(this UnitOfMeasure u) => new(u.Id, u.Code, u.Name, u.Kind, u.IsActive, u.Version);

    public static ItemCategoryDto ToDto(this ItemCategory c) => new(c.Id, c.Name, c.IsActive, c.Version);
}

// Validators

public sealed class CreateUnitOfMeasureRequestValidator : AbstractValidator<CreateUnitOfMeasureRequest>
{
    public CreateUnitOfMeasureRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9._-]+$")
            .WithMessage("El código solo admite letras, números, punto, guion y guion bajo.").WithName("Código");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.Kind).IsInEnum().WithName("Tipo");
    }
}

public sealed class UpdateUnitOfMeasureRequestValidator : AbstractValidator<UpdateUnitOfMeasureRequest>
{
    public UpdateUnitOfMeasureRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.Kind).IsInEnum().WithName("Tipo");
    }
}

public sealed class CreateItemCategoryRequestValidator : AbstractValidator<CreateItemCategoryRequest>
{
    public CreateItemCategoryRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
}

public sealed class UpdateItemCategoryRequestValidator : AbstractValidator<UpdateItemCategoryRequest>
{
    public UpdateItemCategoryRequestValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
}

/// <summary>Field rules come from <see cref="ItemRules"/> so the API and the CSV import agree.</summary>
public sealed class CreateItemRequestValidator : AbstractValidator<CreateItemRequest>
{
    public CreateItemRequestValidator() => RuleFor(x => x).Custom((request, context) =>
    {
        foreach (var (field, message) in ItemRules.Check(request.ToDefinition()))
            context.AddFailure(field, message);
    });
}

public sealed class UpdateItemRequestValidator : AbstractValidator<UpdateItemRequest>
{
    public UpdateItemRequestValidator() => RuleFor(x => x).Custom((request, context) =>
    {
        foreach (var (field, message) in ItemRules.Check(request.ToDefinition()))
            context.AddFailure(field, message);
    });
}

public sealed class UpdateItemLocationSettingsRequestValidator : AbstractValidator<UpdateItemLocationSettingsRequest>
{
    public UpdateItemLocationSettingsRequestValidator()
    {
        RuleFor(x => x.Settings).Cascade(CascadeMode.Stop).NotNull().WithMessage("Indica la configuración por ubicación.")
            .Must(s => s.Select(x => x.LocationId).Distinct().Count() == s.Count).WithMessage("Hay ubicaciones repetidas.");
        RuleForEach(x => x.Settings).ChildRules(setting =>
        {
            setting.RuleFor(s => s.MinQty).Must((s, min) => (min is null) == (s.MaxQty is null))
                .WithMessage("Captura mínimo y máximo, o deja ambos vacíos para quitar la configuración.");
            setting.RuleFor(s => s.MinQty).GreaterThanOrEqualTo(0).When(s => s.MinQty is not null).WithName("Mínimo");
            setting.RuleFor(s => s.MaxQty).GreaterThanOrEqualTo(s => s.MinQty!.Value)
                .When(s => s.MinQty is not null && s.MaxQty is not null)
                .WithMessage("El máximo debe ser mayor o igual que el mínimo.");
            setting.RuleFor(s => s.MinQty).Must(q => q is null || decimal.Round(q.Value, 4) == q)
                .WithMessage("Máximo 4 decimales.");
            setting.RuleFor(s => s.MaxQty).Must(q => q is null || decimal.Round(q.Value, 4) == q)
                .WithMessage("Máximo 4 decimales.");
        });
    }
}
