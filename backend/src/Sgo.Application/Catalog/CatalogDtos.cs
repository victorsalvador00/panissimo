using Sgo.Application.Common;
using Sgo.Domain.Catalog;

namespace Sgo.Application.Catalog;

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
    public Guid? CategoryId { get; init; }
}

/// <summary>Búsqueda ligera de artículos activos para los selectores de todos los módulos.</summary>
public sealed record ItemLookupQuery
{
    public const int MaxResults = 50;

    /// <summary>SKU o nombre (contiene).</summary>
    public string? Q { get; init; }
    public ItemType? Type { get; init; }
    /// <summary>Un artículo concreto (ej. para mostrar el filtro que llega por URL).</summary>
    public Guid? Id { get; init; }
    public int Limit { get; init; } = 20;
}

public sealed record ItemLookupDto(
    Guid Id,
    string Sku,
    string Name,
    ItemType Type,
    string BaseUomCode,
    bool TracksLots,
    int? ShelfLifeDays);

public sealed record ItemListItemDto(
    Guid Id,
    string Sku,
    string Name,
    ItemType Type,
    Guid CategoryId,
    string CategoryName,
    string BaseUomCode,
    bool TracksLots,
    StorageCondition StorageCondition,
    bool IsActive);

public sealed record ItemDto(
    Guid Id,
    string Sku,
    string Name,
    ItemType Type,
    Guid CategoryId,
    Guid BaseUomId,
    Guid? PurchaseUomId,
    decimal PurchaseToBaseFactor,
    bool TracksLots,
    int? ShelfLifeDays,
    StorageCondition StorageCondition,
    decimal TaxRate,
    bool IsActive,
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
    decimal TaxRate)
{
    public ItemDefinition ToDefinition() => new(Sku, Name, Type, CategoryId, BaseUomId, PurchaseUomId,
        PurchaseToBaseFactor, TracksLots, ShelfLifeDays, StorageCondition, TaxRate);
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
    bool IsActive)
{
    public ItemDefinition ToDefinition() => new(Sku, Name, Type, CategoryId, BaseUomId, PurchaseUomId,
        PurchaseToBaseFactor, TracksLots, ShelfLifeDays, StorageCondition, TaxRate);
}

// Min/max per location

/// <summary>One row per location in the caller's scope; Min/Max are null when not configured.</summary>
public sealed record ItemLocationSettingDto(Guid LocationId, string LocationCode, string LocationName, decimal? MinQty, decimal? MaxQty);

/// <summary>Both null removes the setting for that location.</summary>
public sealed record ItemLocationSettingInput(Guid LocationId, decimal? MinQty, decimal? MaxQty);

public sealed record UpdateItemLocationSettingsRequest(IReadOnlyList<ItemLocationSettingInput> Settings);

// Import

public sealed record ItemImportResult(int Created, int Updated);

public static class CatalogMapping
{
    public static UnitOfMeasureDto ToDto(this UnitOfMeasure u) => new(u.Id, u.Code, u.Name, u.Kind, u.IsActive, u.Version);

    public static ItemCategoryDto ToDto(this ItemCategory c) => new(c.Id, c.Name, c.IsActive, c.Version);

    public static ItemDto ToDto(this Item i) => new(i.Id, i.Sku, i.Name, i.Type, i.CategoryId, i.BaseUomId, i.PurchaseUomId,
        i.PurchaseToBaseFactor, i.TracksLots, i.ShelfLifeDays, i.StorageCondition, i.TaxRate, i.IsActive, i.Version);
}
