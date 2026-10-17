using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Catalog;

public interface IItemImportService
{
    /// <summary>
    /// All-or-nothing: validates every row first; any error → <see cref="ImportValidationException"/> and nothing is saved.
    /// Existing SKUs are updated (their active flag is kept); new SKUs are created.
    /// </summary>
    Task<ItemImportResult> ImportAsync(Stream csv, CancellationToken ct = default);
}

/// <summary>
/// Item CSV (backend §13, B-05): sku, nombre, tipo, categoria and unidad_base are required; the rest are optional.
/// D-07: sku_interno is required; a row without it is skipped (reported in the result) and the rest is imported.
/// A packaged row may point (sku_granel) to a bulk item that already exists or that comes in the same file.
/// </summary>
public sealed class ItemImportService(IAppDbContext db, ICsvReader reader) : IItemImportService
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
        public const string Presentation = "presentacion";
        public const string BulkSku = "sku_granel";
        public const string UnitsPerPackage = "piezas_por_paquete";
        public const string Area = "area";
        public const string Multiple = "multiplo_op";
        public const string Weight = "gramaje_g";
        public const string InternalSku = "sku_interno";

        public static readonly IReadOnlyList<string> Required = [Sku, Name, Type, Category, BaseUom];

        public static readonly IReadOnlyList<string> All =
        [
            .. Required, PurchaseUom, Factor, TracksLots, ShelfLife, Storage, Tax, Presentation, BulkSku, UnitsPerPackage,
            Area, Multiple, Weight, InternalSku,
        ];
    }

    private static readonly Dictionary<string, ItemType> Types = new()
    {
        ["materia_prima"] = ItemType.RawMaterial,
        ["insumo"] = ItemType.Supply,
        ["semiterminado"] = ItemType.SemiFinished,
        ["terminado"] = ItemType.FinishedGood,
    };

    private static readonly Dictionary<string, ItemPresentation> Presentations = new()
    {
        ["granel"] = ItemPresentation.Bulk,
        ["empaquetado"] = ItemPresentation.Packaged,
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
        ["presentation"] = Columns.Presentation,
        ["bulkItemId"] = Columns.BulkSku,
        ["unitsPerPackage"] = Columns.UnitsPerPackage,
        ["productionAreaId"] = Columns.Area,
        ["productionMultiple"] = Columns.Multiple,
        ["unitWeightGrams"] = Columns.Weight,
        ["internalSku"] = Columns.InternalSku,
    };

    private sealed record ParsedRow(int Line, ItemDefinition Definition, string? BulkSku)
    {
        public string Sku => ItemRules.NormalizeSku(Definition.Sku);
    }

    private sealed record Catalogs(
        IReadOnlyDictionary<string, ItemCategory> Categories,
        IReadOnlyDictionary<string, UnitOfMeasure> Uoms,
        IReadOnlyDictionary<string, ProductionArea> Areas);

    public async Task<ItemImportResult> ImportAsync(Stream csv, CancellationToken ct = default)
    {
        var document = reader.Read(csv);
        ValidateLayout(document);

        var catalogs = await LoadCatalogsAsync(ct);
        var errors = new List<ImportError>();
        var parsed = new List<ParsedRow>();
        var seenSkus = new Dictionary<string, int>();

        var skipped = new List<ImportError>();
        var hasInternalColumn = document.Headers.Contains(Columns.InternalSku);
        foreach (var row in document.Rows)
        {
            if (row.Get(Columns.InternalSku).Length == 0)
            {
                skipped.Add(new ImportError(row.Line, Columns.InternalSku, hasInternalColumn
                    ? "Renglón omitido: falta el SKU interno."
                    : $"Renglón omitido: el archivo no trae la columna {Columns.InternalSku}."));
                continue;
            }

            var rowErrors = new List<ImportError>();
            var result = ParseRow(row, catalogs, rowErrors);

            if (result is not null)
            {
                // The bulk link is resolved later; a placeholder lets ItemRules check that only packaged rows have one.
                var probe = result.Definition with { BulkItemId = result.BulkSku is null ? null : Guid.Empty };
                foreach (var (field, message) in ItemRules.Check(probe))
                    rowErrors.Add(new ImportError(row.Line, FieldColumns.GetValueOrDefault(field), message));

                if (!ItemReferenceRules.MultipleFitsUnit(catalogs.Uoms.Values.Single(u => u.Id == result.Definition.BaseUomId),
                        result.Definition.ProductionMultiple))
                    rowErrors.Add(new ImportError(row.Line, Columns.Multiple, ItemReferenceRules.WholeMultipleMessage));

                if (result.Sku.Length > 0 && !seenSkus.TryAdd(result.Sku, row.Line))
                    rowErrors.Add(new ImportError(row.Line, Columns.Sku, $"El SKU '{result.Sku}' está repetido (ya aparece en la fila {seenSkus[result.Sku]})."));
            }

            if (rowErrors.Count > 0)
                errors.AddRange(rowErrors);
            else
                parsed.Add(result!);
        }

        var fileSkus = parsed.Select(p => p.Sku).ToList();
        var bulkSkus = parsed.Select(p => p.BulkSku).OfType<string>().ToList();
        var existing = await db.Items.Where(i => fileSkus.Contains(i.Sku) || bulkSkus.Contains(i.Sku)).ToDictionaryAsync(i => i.Sku, ct);
        var bySku = parsed.ToDictionary(p => p.Sku);

        errors.AddRange(ValidateBulkLinks(parsed, bySku, existing));
        errors.AddRange(await ValidateFixedOnceMovedAsync(parsed, existing, ct));
        errors.AddRange(await ValidateBulkWithPackagedAsync(parsed, existing, ct));

        errors.AddRange(await ValidateInternalSkusAsync(parsed, ct));

        if (errors.Count > 0)
            throw new ImportValidationException([.. errors.OrderBy(e => e.Row)]);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        int created = 0, updated = 0;

        // First pass without links (a packaged row may point to a bulk item created by this same file).
        var items = new Dictionary<string, Item>();
        foreach (var row in parsed)
        {
            var unlinked = row.Definition with { BulkItemId = null };
            if (existing.TryGetValue(row.Sku, out var item))
            {
                item.Update(unlinked);
                updated++;
            }
            else
            {
                item = new Item(unlinked);
                db.Items.Add(item);
                created++;
            }
            items[row.Sku] = item;
        }

        foreach (var row in parsed.Where(p => p.BulkSku is not null))
        {
            var target = items.GetValueOrDefault(row.BulkSku!) ?? existing[row.BulkSku!];
            items[row.Sku].Update(row.Definition with { BulkItemId = target.Id });
        }

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new ItemImportResult(created, updated, skipped);
    }

    /// <summary>sku_granel must be an active bulk finished good, in the file or in the catalog, and not the row itself.</summary>
    private static IEnumerable<ImportError> ValidateBulkLinks(
        IReadOnlyList<ParsedRow> parsed, IReadOnlyDictionary<string, ParsedRow> bySku, IReadOnlyDictionary<string, Item> existing)
    {
        foreach (var row in parsed.Where(p => p.BulkSku is not null))
        {
            bool valid;
            if (row.BulkSku == row.Sku)
                valid = false;
            else if (bySku.TryGetValue(row.BulkSku!, out var target))
                valid = target.Definition is { Type: ItemType.FinishedGood, Presentation: ItemPresentation.Bulk }
                        && (!existing.TryGetValue(target.Sku, out var stored) || stored.IsActive);
            else
                valid = existing.TryGetValue(row.BulkSku!, out var item) && ItemReferenceRules.IsValidBulkTarget(item, null);

            if (!valid)
                yield return new ImportError(row.Line, Columns.BulkSku, $"'{row.BulkSku}': {ItemReferenceRules.BulkTargetMessage}");
        }
    }

    /// <summary>Same guard as the API: base unit and lot control are fixed once the item has movements.</summary>
    private async Task<IEnumerable<ImportError>> ValidateFixedOnceMovedAsync(
        IReadOnlyList<ParsedRow> parsed, IReadOnlyDictionary<string, Item> existing, CancellationToken ct)
    {
        var changing = parsed
            .Where(p => existing.TryGetValue(p.Sku, out var item)
                        && (item.BaseUomId != p.Definition.BaseUomId || item.TracksLots != p.Definition.TracksLots))
            .ToList();
        if (changing.Count == 0)
            return [];

        var ids = changing.Select(p => existing[p.Sku].Id).ToList();
        var moved = (await db.InventoryMovements.Where(m => ids.Contains(m.ItemId)).Select(m => m.ItemId).Distinct().ToListAsync(ct)).ToHashSet();
        return changing.Where(p => moved.Contains(existing[p.Sku].Id))
            .Select(p => new ImportError(p.Line, Columns.BaseUom, ItemReferenceRules.ItemHasMovementsMessage));
    }

    private async Task<IEnumerable<ImportError>> ValidateBulkWithPackagedAsync(
        IReadOnlyList<ParsedRow> parsed, IReadOnlyDictionary<string, Item> existing, CancellationToken ct)
    {
        var leavingBulk = parsed
            .Where(p => existing.TryGetValue(p.Sku, out var item) && item.Presentation == ItemPresentation.Bulk
                        && p.Definition is not { Type: ItemType.FinishedGood, Presentation: ItemPresentation.Bulk })
            .ToList();
        if (leavingBulk.Count == 0)
            return [];

        var ids = leavingBulk.Select(p => existing[p.Sku].Id).ToList();
        var withPackaged = (await db.Items.Where(i => i.BulkItemId != null && ids.Contains(i.BulkItemId.Value))
            .Select(i => i.BulkItemId!.Value).Distinct().ToListAsync(ct)).ToHashSet();
        return leavingBulk.Where(p => withPackaged.Contains(existing[p.Sku].Id))
            .Select(p => new ImportError(p.Line, Columns.Presentation, ItemReferenceRules.BulkHasPackagedMessage));
    }

    private async Task<Catalogs> LoadCatalogsAsync(CancellationToken ct)
    {
        var categories = await db.ItemCategories.AsNoTracking().ToListAsync(ct);
        var areas = await db.ProductionAreas.AsNoTracking().ToListAsync(ct);

        // "Lácteos" and "lacteos" match the same category; prefer the active one if both exist.
        var categoriesByName = categories.GroupBy(c => CsvText.Normalize(c.Name))
            .ToDictionary(g => g.Key, g => g.OrderByDescending(c => c.IsActive).First());
        // Areas are matched by code or by name ("BIZ-DIA" or "Bizcocho Día").
        var areasByKey = new Dictionary<string, ProductionArea>();
        foreach (var area in areas.OrderBy(a => a.IsActive))
        {
            areasByKey[CsvText.Normalize(area.Code)] = area;
            areasByKey[CsvText.Normalize(area.Name)] = area;
        }

        return new Catalogs(categoriesByName,
            await db.UnitsOfMeasure.AsNoTracking().ToDictionaryAsync(u => u.Code, ct),
            areasByKey);
    }

    /// <summary>D-07: an internal SKU is unique in the file and in the catalog.</summary>
    private async Task<IEnumerable<ImportError>> ValidateInternalSkusAsync(IReadOnlyList<ParsedRow> parsed, CancellationToken ct)
    {
        var errors = new List<ImportError>();
        foreach (var duplicate in parsed.GroupBy(r => ItemRules.NormalizeInternalSku(r.Definition.InternalSku)).Where(g => g.Count() > 1))
            errors.AddRange(duplicate.Skip(1).Select(r => new ImportError(r.Line, Columns.InternalSku,
                $"El SKU interno '{duplicate.Key}' está repetido (ya aparece en la fila {duplicate.First().Line}).")));

        var codes = parsed.Select(r => ItemRules.NormalizeInternalSku(r.Definition.InternalSku)).Distinct().ToList();
        var taken = await db.Items.AsNoTracking().Where(i => codes.Contains(i.InternalSku))
            .ToDictionaryAsync(i => i.InternalSku, i => i.Sku, ct);
        errors.AddRange(parsed.Where(r => taken.TryGetValue(ItemRules.NormalizeInternalSku(r.Definition.InternalSku), out var sku) && sku != r.Sku)
            .Select(r => new ImportError(r.Line, Columns.InternalSku, $"El SKU interno '{ItemRules.NormalizeInternalSku(r.Definition.InternalSku)}' ya lo usa otro artículo.")));
        return errors;
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

    private static ParsedRow? ParseRow(CsvRow row, Catalogs catalogs, List<ImportError> errors)
    {
        var before = errors.Count;
        void Error(string column, string message) => errors.Add(new ImportError(row.Line, column, message));

        foreach (var column in Columns.Required.Where(c => row.Get(c).Length == 0))
            Error(column, "El valor es obligatorio.");

        var type = default(ItemType);
        if (row.Get(Columns.Type) is { Length: > 0 } typeText && !Types.TryGetValue(CsvText.Normalize(typeText), out type))
            Error(Columns.Type, $"Tipo '{typeText}' no válido. Usa: {string.Join(", ", Types.Keys)}.");

        var categoryId = Guid.Empty;
        if (row.Get(Columns.Category) is { Length: > 0 } categoryText)
        {
            if (!catalogs.Categories.TryGetValue(CsvText.Normalize(categoryText), out var category))
                Error(Columns.Category, $"La categoría '{categoryText}' no existe. Dala de alta en el catálogo de categorías.");
            else if (!category.IsActive)
                Error(Columns.Category, $"La categoría '{categoryText}' está inactiva.");
            else
                categoryId = category.Id;
        }

        var baseUomId = ResolveUom(Columns.BaseUom, "unidad base") ?? Guid.Empty;
        var purchaseUomId = ResolveUom(Columns.PurchaseUom, "unidad de compra");
        var factor = ParseDecimal(Columns.Factor);

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

        var shelfLife = ParseInt(Columns.ShelfLife, "un número entero de días");

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

        ItemPresentation? presentation = null;
        if (row.Get(Columns.Presentation) is { Length: > 0 } presentationText)
        {
            if (Presentations.TryGetValue(CsvText.Normalize(presentationText), out var value))
                presentation = value;
            else
                Error(Columns.Presentation, $"Presentación '{presentationText}' no válida. Usa: {string.Join(", ", Presentations.Keys)}.");
        }

        var bulkSku = row.Get(Columns.BulkSku) is { Length: > 0 } bulkText ? ItemRules.NormalizeSku(bulkText) : null;
        var unitsPerPackage = ParseInt(Columns.UnitsPerPackage, "un número entero de piezas");

        Guid? areaId = null;
        if (row.Get(Columns.Area) is { Length: > 0 } areaText)
        {
            if (!catalogs.Areas.TryGetValue(CsvText.Normalize(areaText), out var area))
                Error(Columns.Area, $"El área '{areaText}' no existe. Usa el código o el nombre de un área de producción.");
            else if (!area.IsActive)
                Error(Columns.Area, $"El área '{areaText}' está inactiva.");
            else
                areaId = area.Id;
        }

        var multiple = ParseDecimal(Columns.Multiple);
        var weight = ParseDecimal(Columns.Weight);

        return errors.Count > before
            ? null
            : new ParsedRow(row.Line, new ItemDefinition(row.Get(Columns.Sku), row.Get(Columns.InternalSku), row.Get(Columns.Name), type, categoryId,
                baseUomId, purchaseUomId, factor, tracksLots, shelfLife, storage, taxRate, presentation, null, unitsPerPackage, areaId,
                multiple, weight), bulkSku);

        Guid? ResolveUom(string column, string label)
        {
            var code = row.Get(column);
            if (code.Length == 0)
                return null;
            if (!catalogs.Uoms.TryGetValue(code.ToLowerInvariant(), out var uom))
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

        decimal? ParseDecimal(string column)
        {
            if (row.Get(column) is not { Length: > 0 } text)
                return null;
            var value = CsvText.ParseDecimal(text);
            if (value is null)
                Error(column, $"'{text}' no es un número válido (usa punto decimal).");
            return value;
        }

        int? ParseInt(string column, string what)
        {
            if (row.Get(column) is not { Length: > 0 } text)
                return null;
            if (int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var value))
                return value;
            Error(column, $"'{text}' no es {what}.");
            return null;
        }
    }
}
