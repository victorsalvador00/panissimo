using System.Text.RegularExpressions;
using Panissimo.Domain.Common;

namespace Panissimo.Domain.Catalog;

public enum ItemType
{
    RawMaterial,
    Supply,
    SemiFinished,
    FinishedGood,
}

/// <summary>Bulk goes to branches; packaged goes to third-party customers (D-05).</summary>
public enum ItemPresentation
{
    Bulk,
    Packaged,
}

public enum StorageCondition
{
    Ambient,
    Refrigerated,
    Frozen,
}

/// <summary>Editable data of an item; shared by the API, the CSV import and the entity.</summary>
public sealed record ItemDefinition(
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
    ItemPresentation? Presentation = null,
    Guid? BulkItemId = null,
    int? UnitsPerPackage = null,
    Guid? ProductionAreaId = null,
    decimal? ProductionMultiple = null,
    decimal? UnitWeightGrams = null);

/// <summary>Field-level rules of an item (dominio §4.2). Referential checks live in the service.</summary>
public static partial class ItemRules
{
    public const int SkuMaxLength = 50;
    public const int NameMaxLength = 200;
    public static readonly IReadOnlyList<decimal> AllowedTaxRates = [0.00m, 0.16m];

    [GeneratedRegex("^[A-Z0-9][A-Z0-9._-]*$")]
    private static partial Regex SkuPattern();

    public static string NormalizeSku(string sku) => sku.Trim().ToUpperInvariant();

    /// <summary>Produced with a production order and may have a default area.</summary>
    public static bool IsProduced(ItemType type) => type is ItemType.SemiFinished or ItemType.FinishedGood;

    /// <summary>Returns (field, Spanish message) for every broken rule; empty when valid.</summary>
    public static IReadOnlyList<(string Field, string Message)> Check(ItemDefinition item)
    {
        var errors = new List<(string, string)>();
        var sku = NormalizeSku(item.Sku ?? "");

        if (sku.Length == 0)
            errors.Add(("sku", "El SKU es obligatorio."));
        else if (sku.Length > SkuMaxLength)
            errors.Add(("sku", $"El SKU admite máximo {SkuMaxLength} caracteres."));
        else if (!SkuPattern().IsMatch(sku))
            errors.Add(("sku", "El SKU solo admite letras, números, punto, guion y guion bajo, sin espacios."));

        var name = item.Name?.Trim() ?? "";
        if (name.Length == 0)
            errors.Add(("name", "El nombre es obligatorio."));
        else if (name.Length > NameMaxLength)
            errors.Add(("name", $"El nombre admite máximo {NameMaxLength} caracteres."));

        if (item.PurchaseUomId is not null && item.PurchaseToBaseFactor is not > 0)
            errors.Add(("purchaseToBaseFactor", "El factor de compra debe ser mayor que 0."));
        if (item.PurchaseUomId is null && item.PurchaseToBaseFactor is not null and not 1)
            errors.Add(("purchaseToBaseFactor", "Sin unidad de compra, el factor debe ser 1 o quedar vacío."));
        if (item.PurchaseToBaseFactor is { } factor && decimal.Round(factor, 4) != factor)
            errors.Add(("purchaseToBaseFactor", "El factor de compra admite máximo 4 decimales."));

        if (item.ShelfLifeDays is < 0)
            errors.Add(("shelfLifeDays", "La vida útil no puede ser negativa."));

        if (!AllowedTaxRates.Contains(item.TaxRate))
            errors.Add(("taxRate", "La tasa de IVA debe ser 0 o 0.16."));

        // Presentation (D-05): mandatory for finished goods, absent for the rest.
        if (item.Type == ItemType.FinishedGood && item.Presentation is null)
            errors.Add(("presentation", "La presentación (granel o empaquetado) es obligatoria en productos terminados."));
        if (item.Type != ItemType.FinishedGood && item.Presentation is not null)
            errors.Add(("presentation", "Solo los productos terminados tienen presentación."));

        if (item.Presentation != ItemPresentation.Packaged && item.BulkItemId is not null)
            errors.Add(("bulkItemId", "Solo un producto empaquetado puede ligarse a su versión a granel."));
        if (item.Presentation != ItemPresentation.Packaged && item.UnitsPerPackage is not null)
            errors.Add(("unitsPerPackage", "Las piezas por paquete solo aplican a productos empaquetados."));
        if (item.UnitsPerPackage is <= 0)
            errors.Add(("unitsPerPackage", "Las piezas por paquete deben ser mayores que 0."));

        if (!IsProduced(item.Type) && item.ProductionAreaId is not null)
            errors.Add(("productionAreaId", "Solo los semiterminados y productos terminados tienen área de producción."));

        if (item.ProductionMultiple is { } multiple)
        {
            if (multiple <= 0)
                errors.Add(("productionMultiple", "El múltiplo de OP debe ser mayor que 0."));
            else if (decimal.Round(multiple, 4) != multiple)
                errors.Add(("productionMultiple", "El múltiplo de OP admite máximo 4 decimales."));
        }

        if (item.UnitWeightGrams is { } grams)
        {
            if (grams <= 0)
                errors.Add(("unitWeightGrams", "El gramaje debe ser mayor que 0."));
            else if (decimal.Round(grams, 2) != grams)
                errors.Add(("unitWeightGrams", "El gramaje admite máximo 2 decimales."));
        }

        return errors;
    }
}

[Audited]
public class Item : AuditableEntity, IVersioned
{
    private Item() { }

    public Item(ItemDefinition definition)
    {
        Apply(definition);
        IsActive = true;
    }

    /// <summary>D-07: Paníssimo's own code (e.g. SKU0001); unique. The OP import identifies products by it.</summary>
    public string Sku { get; private set; } = null!;

    public string Name { get; private set; } = null!;
    public ItemType Type { get; private set; }
    public Guid CategoryId { get; private set; }

    /// <summary>Unit in which inventory is kept (RN-03).</summary>
    public Guid BaseUomId { get; private set; }

    public Guid? PurchaseUomId { get; private set; }

    /// <summary>BaseQty = PurchaseQty × factor (RN-03). 1 when there is no purchase unit.</summary>
    public decimal PurchaseToBaseFactor { get; private set; }

    public bool TracksLots { get; private set; }
    public int? ShelfLifeDays { get; private set; }
    public StorageCondition StorageCondition { get; private set; }
    public decimal TaxRate { get; private set; }

    /// <summary>Only finished goods (D-05).</summary>
    public ItemPresentation? Presentation { get; private set; }

    /// <summary>Packaged → its bulk version. Informative; never moves inventory.</summary>
    public Guid? BulkItemId { get; private set; }

    public int? UnitsPerPackage { get; private set; }

    /// <summary>Default area of its production orders.</summary>
    public Guid? ProductionAreaId { get; private set; }

    /// <summary>The production plan rounds up to this multiple (RN-70).</summary>
    public decimal ProductionMultiple { get; private set; }

    public decimal? UnitWeightGrams { get; private set; }
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Update(ItemDefinition definition) => Apply(definition);

    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;

    private void Apply(ItemDefinition d)
    {
        var errors = ItemRules.Check(d);
        if (errors.Count > 0)
            throw new BusinessRuleException("invalid_item", errors[0].Message);

        Sku = ItemRules.NormalizeSku(d.Sku);
        Name = d.Name.Trim();
        Type = d.Type;
        CategoryId = d.CategoryId;
        BaseUomId = d.BaseUomId;
        PurchaseUomId = d.PurchaseUomId;
        PurchaseToBaseFactor = d.PurchaseUomId is null ? 1m : d.PurchaseToBaseFactor!.Value;
        TracksLots = d.TracksLots;
        ShelfLifeDays = d.ShelfLifeDays;
        StorageCondition = d.StorageCondition;
        TaxRate = d.TaxRate;
        Presentation = d.Presentation;
        BulkItemId = d.BulkItemId;
        UnitsPerPackage = d.UnitsPerPackage;
        ProductionAreaId = d.ProductionAreaId;
        ProductionMultiple = d.ProductionMultiple ?? 1m;
        UnitWeightGrams = d.UnitWeightGrams;
    }
}

[Audited]
public class ItemCategory : AuditableEntity, IVersioned
{
    private ItemCategory() { }

    public ItemCategory(string name)
    {
        Rename(name);
        IsActive = true;
    }

    public string Name { get; private set; } = null!;
    public bool IsActive { get; private set; }
    public uint Version { get; private set; }

    public void Rename(string name) => Name = name.Trim();
    public void Activate() => IsActive = true;
    public void Deactivate() => IsActive = false;
}

/// <summary>Min/max per location, in base unit (dominio §4.2). Drives alerts, order suggestions and plan replenishment.</summary>
[Audited]
public class ItemLocationSetting
{
    private ItemLocationSetting() { }

    public ItemLocationSetting(Guid itemId, Guid locationId, decimal minQty, decimal maxQty)
    {
        ItemId = itemId;
        LocationId = locationId;
        Set(minQty, maxQty);
    }

    public Guid ItemId { get; private set; }
    public Guid LocationId { get; private set; }
    public decimal MinQty { get; private set; }
    public decimal MaxQty { get; private set; }

    public void Set(decimal minQty, decimal maxQty)
    {
        if (minQty < 0)
            throw new BusinessRuleException("invalid_min_max", "El mínimo no puede ser negativo.");
        if (maxQty < minQty)
            throw new BusinessRuleException("invalid_min_max", "El máximo debe ser mayor o igual que el mínimo.");
        MinQty = minQty;
        MaxQty = maxQty;
    }
}
