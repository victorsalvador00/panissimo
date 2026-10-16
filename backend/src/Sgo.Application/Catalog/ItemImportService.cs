using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.Domain.Common;

namespace Sgo.Application.Catalog;

public interface IItemImportService
{
    /// <summary>
    /// All-or-nothing: validates every row first; any error → <see cref="ImportValidationException"/> and nothing is saved.
    /// Existing SKUs are updated (their active flag is kept); new SKUs are created.
    /// </summary>
    Task<ItemImportResult> ImportAsync(Stream csv, CancellationToken ct = default);
}

/// <summary>
/// Item CSV layout (Spanish headers, agreed for B-05):
/// sku, nombre, tipo, categoria, unidad_base are required; unidad_compra, factor_compra, maneja_lotes,
/// vida_util_dias, almacenamiento and iva are optional.
/// </summary>
public sealed class ItemImportService(ISgoDbContext db, ICsvReader reader) : IItemImportService
{
    public const int MaxRows = 5_000;

    public static class Columns
    {
        public const string Sku = "sku";
        public const string Name = "nombre";
        public const string Type = "tipo";
        public const string Category = "categoria";
        public const string BaseUom = "unidad_base";
        public const string PurchaseUom = "unidad_compra";
        public const string Factor = "factor_compra";
        public const string TracksLots = "maneja_lotes";
        public const string ShelfLife = "vida_util_dias";
        public const string Storage = "almacenamiento";
        public const string Tax = "iva";

        public static readonly IReadOnlyList<string> Required = [Sku, Name, Type, Category, BaseUom];
        public static readonly IReadOnlyList<string> All = [.. Required, PurchaseUom, Factor, TracksLots, ShelfLife, Storage, Tax];
    }

    private static readonly Dictionary<string, ItemType> Types = new()
    {
        ["materia_prima"] = ItemType.RawMaterial,
        ["intermedio"] = ItemType.Intermediate,
        ["terminado"] = ItemType.FinishedGood,
    };

    private static readonly Dictionary<string, StorageCondition> Storages = new()
    {
        ["ambiente"] = StorageCondition.Ambient,
        ["refrigerado"] = StorageCondition.Refrigerated,
        ["congelado"] = StorageCondition.Frozen,
    };

    /// <summary>ItemRules field → CSV column, to report domain errors on the right column.</summary>
    private static readonly Dictionary<string, string> FieldColumns = new()
    {
        ["sku"] = Columns.Sku,
        ["name"] = Columns.Name,
        ["purchaseToBaseFactor"] = Columns.Factor,
        ["shelfLifeDays"] = Columns.ShelfLife,
        ["taxRate"] = Columns.Tax,
    };

    public async Task<ItemImportResult> ImportAsync(Stream csv, CancellationToken ct = default)
    {
        var document = reader.Read(csv);
        ValidateLayout(document);

        var categories = await db.ItemCategories.AsNoTracking().ToListAsync(ct);
        // "Lácteos" and "lacteos" match the same category; prefer the active one if both exist.
        var categoriesByName = categories.GroupBy(c => CsvText.Normalize(c.Name))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.IsActive).First());
        var uomsByCode = await db.UnitsOfMeasure.AsNoTracking().ToDictionaryAsync(u => u.Code, ct);

        var errors = new List<ImportError>();
        var parsed = new List<(int Line, ItemDefinition Definition)>();
        var seenSkus = new Dictionary<string, int>();

        foreach (var row in document.Rows)
        {
            var rowErrors = new List<ImportError>();
            var definition = ParseRow(row, categoriesByName, uomsByCode, rowErrors);

            if (definition is not null)
            {
                foreach (var (field, message) in ItemRules.Check(definition))
                    rowErrors.Add(new ImportError(row.Line, FieldColumns.GetValueOrDefault(field), message));

                var sku = ItemRules.NormalizeSku(definition.Sku);
                if (sku.Length > 0 && !seenSkus.TryAdd(sku, row.Line))
                    rowErrors.Add(new ImportError(row.Line, Columns.Sku, $"El SKU '{sku}' está repetido (ya aparece en la fila {seenSkus[sku]})."));
            }

            if (rowErrors.Count > 0)
                errors.AddRange(rowErrors);
            else
                parsed.Add((row.Line, definition!));
        }

        var skus = parsed.Select(p => ItemRules.NormalizeSku(p.Definition.Sku)).ToList();
        var existing = await db.Items.Where(i => skus.Contains(i.Sku)).ToDictionaryAsync(i => i.Sku, ct);

        // Same guard as the API: base unit and lot control are fixed once the item has movements.
        var changing = parsed
            .Where(p => existing.TryGetValue(ItemRules.NormalizeSku(p.Definition.Sku), out var item)
                        && (item.BaseUomId != p.Definition.BaseUomId || item.TracksLots != p.Definition.TracksLots))
            .ToList();
        var changingIds = changing.Select(p => existing[ItemRules.NormalizeSku(p.Definition.Sku)].Id).ToList();
        var withMovements = (await db.InventoryMovements.Where(m => changingIds.Contains(m.ItemId))
            .Select(m => m.ItemId).Distinct().ToListAsync(ct)).ToHashSet();
        foreach (var (line, definition) in changing.Where(p => withMovements.Contains(existing[ItemRules.NormalizeSku(p.Definition.Sku)].Id)))
            errors.Add(new ImportError(line, Columns.BaseUom, ItemService.ItemHasMovementsMessage));

        if (errors.Count > 0)
            throw new ImportValidationException([.. errors.OrderBy(e => e.Row)]);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        int created = 0, updated = 0;
        foreach (var (_, definition) in parsed)
        {
            if (existing.TryGetValue(ItemRules.NormalizeSku(definition.Sku), out var item))
            {
                item.Update(definition);
                updated++;
            }
            else
            {
                db.Items.Add(new Item(definition));
                created++;
            }
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new ItemImportResult(created, updated);
    }

    private static void ValidateLayout(CsvDocument document)
    {
        var errors = new List<ImportError>();
        foreach (var missing in Columns.Required.Except(document.Headers))
            errors.Add(new ImportError(1, missing, $"Falta la columna obligatoria '{missing}'."));
        foreach (var unknown in document.Headers.Except(Columns.All))
            errors.Add(new ImportError(1, unknown, $"La columna '{unknown}' no se reconoce. Columnas válidas: {string.Join(", ", Columns.All)}."));
        foreach (var duplicate in document.Headers.GroupBy(h => h).Where(g => g.Count() > 1))
            errors.Add(new ImportError(1, duplicate.Key, $"La columna '{duplicate.Key}' está repetida."));

        if (errors.Count == 0 && document.Rows.Count == 0)
            errors.Add(new ImportError(1, null, "El archivo no tiene filas para importar."));
        if (document.Rows.Count > MaxRows)
            errors.Add(new ImportError(1, null, $"El archivo tiene {document.Rows.Count} filas; el máximo es {MaxRows}."));

        if (errors.Count > 0)
            throw new ImportValidationException(errors);
    }

    private static ItemDefinition? ParseRow(
        CsvRow row,
        IReadOnlyDictionary<string, ItemCategory> categories,
        IReadOnlyDictionary<string, UnitOfMeasure> uoms,
        List<ImportError> errors)
    {
        void Error(string column, string message) => errors.Add(new ImportError(row.Line, column, message));

        foreach (var column in Columns.Required.Where(c => row.Get(c).Length == 0))
            Error(column, "El valor es obligatorio.");

        var type = default(ItemType);
        if (row.Get(Columns.Type) is { Length: > 0 } typeText && !Types.TryGetValue(CsvText.Normalize(typeText), out type))
            Error(Columns.Type, $"Tipo '{typeText}' no válido. Usa: {string.Join(", ", Types.Keys)}.");

        var categoryId = Guid.Empty;
        if (row.Get(Columns.Category) is { Length: > 0 } categoryText)
        {
            if (!categories.TryGetValue(CsvText.Normalize(categoryText), out var category))
                Error(Columns.Category, $"La categoría '{categoryText}' no existe. Dala de alta en el catálogo de categorías.");
            else if (!category.IsActive)
                Error(Columns.Category, $"La categoría '{categoryText}' está inactiva.");
            else
                categoryId = category.Id;
        }

        var baseUomId = ResolveUom(Columns.BaseUom, "unidad base") ?? Guid.Empty;
        var purchaseUomId = ResolveUom(Columns.PurchaseUom, "unidad de compra");

        decimal? factor = null;
        if (row.Get(Columns.Factor) is { Length: > 0 } factorText)
        {
            if (decimal.TryParse(factorText, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
                factor = value;
            else
                Error(Columns.Factor, $"'{factorText}' no es un número válido (usa punto decimal).");
        }

        var tracksLots = false;
        if (row.Get(Columns.TracksLots) is { Length: > 0 } lotsText)
        {
            switch (CsvText.Normalize(lotsText))
            {
                case "si": tracksLots = true; break;
                case "no": break;
                default: Error(Columns.TracksLots, $"'{lotsText}' no es válido. Usa: si, no."); break;
            }
        }

        int? shelfLife = null;
        if (row.Get(Columns.ShelfLife) is { Length: > 0 } shelfText)
        {
            if (int.TryParse(shelfText, NumberStyles.None, CultureInfo.InvariantCulture, out var days))
                shelfLife = days;
            else
                Error(Columns.ShelfLife, $"'{shelfText}' no es un número entero de días.");
        }

        var storage = StorageCondition.Ambient;
        if (row.Get(Columns.Storage) is { Length: > 0 } storageText && !Storages.TryGetValue(CsvText.Normalize(storageText), out storage))
            Error(Columns.Storage, $"Almacenamiento '{storageText}' no válido. Usa: {string.Join(", ", Storages.Keys)}.");

        var taxRate = 0m;
        if (row.Get(Columns.Tax) is { Length: > 0 } taxText)
        {
            taxRate = taxText switch
            {
                "0" => 0m,
                "16" or "0.16" => 0.16m,
                _ => -1m,
            };
            if (taxRate < 0)
                Error(Columns.Tax, $"IVA '{taxText}' no válido. Usa 0 o 16.");
        }

        return errors.Count > 0
            ? null
            : new ItemDefinition(row.Get(Columns.Sku), row.Get(Columns.Name), type, categoryId, baseUomId,
                purchaseUomId, factor, tracksLots, shelfLife, storage, taxRate);

        Guid? ResolveUom(string column, string label)
        {
            var code = row.Get(column);
            if (code.Length == 0)
                return null;
            if (!uoms.TryGetValue(code.ToLowerInvariant(), out var uom))
            {
                Error(column, $"La {label} '{code}' no existe.");
                return null;
            }
            if (!uom.IsActive)
            {
                Error(column, $"La {label} '{code}' está inactiva.");
                return null;
            }
            return uom.Id;
        }
    }
}
