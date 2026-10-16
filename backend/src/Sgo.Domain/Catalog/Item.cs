using System.Text.RegularExpressions;
using Sgo.Domain.Common;

namespace Sgo.Domain.Catalog;

public enum ItemType
{
    RawMaterial,
    Intermediate,
    FinishedGood,
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
    decimal TaxRate);

/// <summary>Field-level rules of an item (dominio §4.2). Referential checks live in the service.</summary>
public static partial class ItemRules
{
    public const int SkuMaxLength = 50;
    public const int NameMaxLength = 200;
    public static readonly IReadOnlyList<decimal> AllowedTaxRates = [0.00m, 0.16m];

    [GeneratedRegex("^[A-Z0-9][A-Z0-9._-]*$")]
    private static partial Regex SkuPattern();

    public static string NormalizeSku(string sku) => sku.Trim().ToUpperInvariant();

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

        if (item.ShelfLifeDays is <= 0)
            errors.Add(("shelfLifeDays", "La vida útil debe ser mayor que 0 días."));

        if (!AllowedTaxRates.Contains(item.TaxRate))
            errors.Add(("taxRate", "La tasa de IVA debe ser 0 o 0.16."));

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
    }
}

/// <summary>Min/max per location, in base unit (dominio §4.2). Drives low-stock alerts and order suggestions.</summary>
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
