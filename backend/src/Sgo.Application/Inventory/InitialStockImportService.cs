using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Application.Inventory;

public sealed record InitialStockImportResult(int Lines, IReadOnlyList<string> AdjustmentFolios);

public interface IInitialStockImportService
{
    /// <summary>
    /// All-or-nothing: one Correction adjustment per location, all in one transaction. Rows for an item that
    /// already has movements at that location are rejected (use an adjustment instead).
    /// </summary>
    Task<InitialStockImportResult> ImportAsync(Stream csv, CancellationToken ct = default);
}

/// <summary>CSV layout agreed for B-07: ubicacion, sku, cantidad, costo_unitario (required); lote, caducidad (lot items).</summary>
public sealed class InitialStockImportService(
    ISgoDbContext db,
    ICsvReader reader,
    ILocationScope scope,
    IAdjustmentService adjustments) : IInitialStockImportService
{
    public const int MaxRows = 5_000;
    public const string AdjustmentNotes = "Carga de existencias iniciales";

    public static class Columns
    {
        public const string Location = "ubicacion";
        public const string Sku = "sku";
        public const string Quantity = "cantidad";
        public const string UnitCost = "costo_unitario";
        public const string Lot = "lote";
        public const string Expiration = "caducidad";

        public static readonly IReadOnlyList<string> Required = [Location, Sku, Quantity, UnitCost];
        public static readonly IReadOnlyList<string> All = [.. Required, Lot, Expiration];
    }

    private static readonly string[] DateFormats = ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy"];

    private sealed record ParsedRow(int Line, Guid LocationId, Item Item, decimal Quantity, decimal UnitCost, string? Lot, DateOnly? Expiration);

    public async Task<InitialStockImportResult> ImportAsync(Stream csv, CancellationToken ct = default)
    {
        var document = reader.Read(csv);
        ValidateLayout(document);

        var locations = await db.Locations.AsNoTracking().ToDictionaryAsync(l => l.Code, ct);
        var skus = document.Rows.Select(r => ItemRules.NormalizeSku(r.Get(Columns.Sku))).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => skus.Contains(i.Sku)).ToDictionaryAsync(i => i.Sku, ct);

        var errors = new List<ImportError>();
        var parsed = new List<ParsedRow>();
        var seen = new Dictionary<(Guid, Guid, string?), int>();
        var lotExpirations = new Dictionary<(Guid ItemId, string Lot), (DateOnly? Expiration, int Line)>();

        foreach (var row in document.Rows)
        {
            var rowErrors = new List<ImportError>();
            var result = ParseRow(row, locations, items, rowErrors);
            if (result is not null)
            {
                var key = (result.LocationId, result.Item.Id, result.Lot?.ToUpperInvariant());
                if (!seen.TryAdd(key, row.Line))
                    rowErrors.Add(new ImportError(row.Line, Columns.Sku, $"Artículo y lote repetidos (ya aparecen en la fila {seen[key]})."));

                if (result.Lot is { } lot)
                {
                    if (lotExpirations.TryGetValue((result.Item.Id, lot), out var previous) && previous.Expiration != result.Expiration)
                        rowErrors.Add(new ImportError(row.Line, Columns.Expiration, $"El lote {lot} tiene otra caducidad en la fila {previous.Line}."));
                    lotExpirations.TryAdd((result.Item.Id, lot), (result.Expiration, row.Line));
                }
            }
            if (rowErrors.Count > 0) errors.AddRange(rowErrors); else parsed.Add(result!);
        }

        await CheckDatabaseConflictsAsync(parsed, errors, ct);
        if (errors.Count > 0)
            throw new ImportValidationException([.. errors.OrderBy(e => e.Row)]);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var folios = new List<string>();
        foreach (var group in parsed.GroupBy(p => p.LocationId))
        {
            var request = new CreateAdjustmentRequest(group.Key, AdjustmentReason.Correction, AdjustmentNotes,
                group.Select(p => new AdjustmentLineRequest(p.Item.Id, null, p.Lot, p.Expiration, p.Quantity, p.UnitCost, null)).ToList());
            folios.Add((await adjustments.CreateInTransactionAsync(request, ct)).Folio);
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return new InitialStockImportResult(parsed.Count, folios);
    }

    private static void ValidateLayout(CsvDocument document)
    {
        var errors = new List<ImportError>();
        foreach (var missing in Columns.Required.Except(document.Headers))
            errors.Add(new ImportError(1, missing, $"Falta la columna obligatoria '{missing}'."));
        foreach (var unknown in document.Headers.Except(Columns.All))
            errors.Add(new ImportError(1, unknown, $"La columna '{unknown}' no se reconoce. Columnas válidas: {string.Join(", ", Columns.All)}."));
        if (errors.Count == 0 && document.Rows.Count == 0)
            errors.Add(new ImportError(1, null, "El archivo no tiene filas para importar."));
        if (document.Rows.Count > MaxRows)
            errors.Add(new ImportError(1, null, $"El archivo tiene {document.Rows.Count} filas; el máximo es {MaxRows}."));
        if (errors.Count > 0)
            throw new ImportValidationException(errors);
    }

    private ParsedRow? ParseRow(CsvRow row, IReadOnlyDictionary<string, Domain.Organization.Location> locations,
        IReadOnlyDictionary<string, Item> items, List<ImportError> errors)
    {
        void Error(string column, string message) => errors.Add(new ImportError(row.Line, column, message));

        foreach (var column in Columns.Required.Where(c => row.Get(c).Length == 0))
            Error(column, "El valor es obligatorio.");

        Guid locationId = Guid.Empty;
        if (row.Get(Columns.Location) is { Length: > 0 } code)
        {
            if (!locations.TryGetValue(code.ToUpperInvariant(), out var location))
                Error(Columns.Location, $"La ubicación '{code}' no existe.");
            else if (!scope.AllowedLocationIds.Contains(location.Id))
                Error(Columns.Location, $"No tienes acceso a la ubicación '{location.Code}'.");
            else if (!location.IsActive)
                Error(Columns.Location, $"La ubicación '{location.Code}' está inactiva.");
            else
                locationId = location.Id;
        }

        Item? item = null;
        if (row.Get(Columns.Sku) is { Length: > 0 } sku)
        {
            if (!items.TryGetValue(ItemRules.NormalizeSku(sku), out item))
                Error(Columns.Sku, $"El SKU '{sku}' no existe.");
            else if (!item.IsActive)
                Error(Columns.Sku, $"El artículo '{item.Sku}' está inactivo.");
        }

        var quantity = ParseDecimal(Columns.Quantity, positive: true);
        var unitCost = ParseDecimal(Columns.UnitCost, positive: false);

        var lot = row.Get(Columns.Lot) is { Length: > 0 } lotText ? lotText : null;
        DateOnly? expiration = null;
        if (row.Get(Columns.Expiration) is { Length: > 0 } dateText)
        {
            if (DateOnly.TryParseExact(dateText, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                expiration = date;
            else
                Error(Columns.Expiration, $"Fecha '{dateText}' no válida. Usa AAAA-MM-DD o DD/MM/AAAA.");
        }

        if (item is not null)
        {
            if (item.TracksLots && lot is null)
                Error(Columns.Lot, $"El artículo {item.Sku} maneja lotes: indica el lote.");
            if (!item.TracksLots && (lot is not null || expiration is not null))
                Error(Columns.Lot, $"El artículo {item.Sku} no maneja lotes: deja vacíos lote y caducidad.");
            if (lot is { Length: > 50 })
                Error(Columns.Lot, "El lote admite máximo 50 caracteres.");
        }

        return errors.Count > 0 ? null : new ParsedRow(row.Line, locationId, item!, quantity!.Value, unitCost!.Value, lot, expiration);

        decimal? ParseDecimal(string column, bool positive)
        {
            var text = row.Get(column);
            if (text.Length == 0)
                return null;
            if (!decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
            {
                Error(column, $"'{text}' no es un número válido (usa punto decimal).");
                return null;
            }
            if (positive ? value <= 0 : value < 0)
                Error(column, positive ? "Debe ser mayor que 0." : "No puede ser negativo.");
            if (InventoryMath.Round(value) != value)
                Error(column, "Admite máximo 4 decimales.");
            return value;
        }
    }

    private async Task CheckDatabaseConflictsAsync(List<ParsedRow> rows, List<ImportError> errors, CancellationToken ct)
    {
        var itemIds = rows.Select(r => r.Item.Id).Distinct().ToList();

        // Initial stock is loaded once: an item that already moved at a location needs an adjustment instead.
        var moved = (await db.InventoryMovements.Where(m => itemIds.Contains(m.ItemId))
                .Select(m => new { m.LocationId, m.ItemId }).Distinct().ToListAsync(ct))
            .Select(x => (x.LocationId, x.ItemId)).ToHashSet();
        var existingLots = (await db.Lots.Where(l => itemIds.Contains(l.ItemId)).ToListAsync(ct))
            .ToDictionary(l => (l.ItemId, l.LotNumber));

        foreach (var row in rows.ToList())
        {
            if (moved.Contains((row.LocationId, row.Item.Id)))
                errors.Add(new ImportError(row.Line, Columns.Sku,
                    $"El artículo {row.Item.Sku} ya tiene movimientos en esta ubicación; usa un ajuste."));
            if (row.Lot is { } lot && existingLots.TryGetValue((row.Item.Id, lot), out var existing) && existing.ExpirationDate != row.Expiration)
                errors.Add(new ImportError(row.Line, Columns.Expiration,
                    $"El lote {lot} ya existe con caducidad {existing.ExpirationDate:dd/MM/yyyy}."));
        }
    }
}
