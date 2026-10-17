using System.Globalization;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Application.Production;

/// <summary>One cell as read from the sheet: the cached value of a formula, a date cell, a number or text.</summary>
public sealed record ExcelCell(string Text, DateOnly? Date, decimal? Number);

/// <param name="Row">Sheet row number (headers are row 1).</param>
public sealed record ExcelRow(int Row, IReadOnlyDictionary<string, ExcelCell> Cells)
{
    public ExcelCell? Get(string column) => Cells.TryGetValue(column, out var cell) && cell.Text.Length > 0 ? cell : null;
}

/// <param name="Headers">Normalized: lowercase, without accents, spaces as underscores.</param>
public sealed record ExcelSheet(IReadOnlyList<string> Headers, IReadOnlyList<ExcelRow> Rows);

/// <summary>Reads the production order sheet and builds the template (backend §7). Business validation lives in the service.</summary>
public interface IExcelOrderReader
{
    /// <summary>Sheet "OP" or the first one; empty rows skipped. Throws <see cref="ImportValidationException"/> if unreadable.</summary>
    ExcelSheet Read(Stream xlsx);

    /// <summary>Template with the "OP" sheet (headers, date format, shift list) and an "Instrucciones" sheet.</summary>
    byte[] CreateTemplate();
}

public sealed record ImportWarningDto(string Code, int? Row, string Message);

public sealed record ImportOrderPreviewDto(
    IReadOnlyList<int> Rows, DateOnly ScheduledDate, Guid LocationId, string LocationCode, Guid ItemId, string Sku, string Name,
    Guid? ProductionAreaId, string? AreaName, Shift? Shift, decimal Quantity, string Uom, int RecipeVersion, string? Notes);

/// <summary>Result of validating a file (RN-90..RN-93). With errors nothing can be imported.</summary>
public sealed record ImportPreviewDto(
    string FileSha256, int RowCount, int OrderCount, IReadOnlyList<ImportError> Errors, IReadOnlyList<ImportWarningDto> Warnings,
    IReadOnlyList<ImportOrderPreviewDto> Orders);

public sealed record ImportResultDto(Guid ImportId, string Folio, int OrderCount, bool ReleasedOnImport, IReadOnlyList<string> OrderFolios);

public sealed record ProductionOrderImportListItemDto(
    Guid Id, string Folio, string FileName, int RowCount, int OrderCount, bool ReleasedOnImport, DateTimeOffset CreatedAt, string? CreatedByName);

public sealed record ImportedOrderDto(Guid Id, string Folio, string Sku, string ItemName, DateOnly ScheduledDate, decimal PlannedQty,
    string? AreaName, Shift? Shift, ProductionOrderStatus Status);

public sealed record ProductionOrderImportDto(
    Guid Id, string Folio, string FileName, string FileSha256, int RowCount, int OrderCount, bool ReleasedOnImport, DateTimeOffset CreatedAt,
    string? CreatedByName, IReadOnlyList<ImportedOrderDto> Orders);

/// <summary>RN-93 warnings were not confirmed (422 <c>import_warnings_not_confirmed</c>).</summary>
public interface IProductionOrderImportService
{
    Task<ImportPreviewDto> ValidateAsync(Stream xlsx, string fileName, CancellationToken ct = default);

    /// <summary>
    /// Revalidates the same file (no state is kept between preview and import). Errors → 400 with the row errors; unconfirmed
    /// warnings → 422. Creates the import and its orders (Draft, or Released with <paramref name="releaseOnImport"/>) in one
    /// transaction (RN-94).
    /// </summary>
    Task<ImportResultDto> CreateAsync(Stream xlsx, string fileName, bool confirmWarnings, bool releaseOnImport, CancellationToken ct = default);

    Task<PagedResult<ProductionOrderImportListItemDto>> ListAsync(PageQuery query, CancellationToken ct = default);
    Task<ProductionOrderImportDto> GetAsync(Guid id, CancellationToken ct = default);
    byte[] Template();
}

public sealed class ProductionOrderImportService(
    IAppDbContext db,
    IExcelOrderReader reader,
    ILocationScope scope,
    UserAccessContext access,
    IClock clock,
    ICurrentUser currentUser,
    IFolioGenerator folios,
    IUserDirectory userDirectory,
    IProductionOrderService orders) : IProductionOrderImportService
{
    public const int MaxRows = 3_000;
    public const int MaxNotesLength = 500;

    public static class Columns
    {
        public const string Date = "fecha";
        /// <summary>D-07: products are identified only by their internal code, not by the system SKU.</summary>
        public const string InternalCode = "codigo_interno";
        public const string Quantity = "cantidad";
        public const string Area = "area";
        public const string Shift = "turno";
        public const string Location = "ubicacion";
        public const string Notes = "notas";

        public static readonly IReadOnlyList<string> Required = [Date, InternalCode, Quantity];
        public static readonly IReadOnlyList<string> All = [.. Required, Area, Shift, Location, Notes];
    }

    private static readonly Dictionary<string, Shift> Shifts = new()
    {
        ["dia"] = Domain.Organization.Shift.Day,
        ["tarde"] = Domain.Organization.Shift.Afternoon,
        ["noche"] = Domain.Organization.Shift.Night,
    };

    private static readonly string[] DateFormats = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd"];

    private sealed record ParsedRow(int Row, DateOnly Date, Guid LocationId, Guid ItemId, Guid? AreaId, Shift? Shift, decimal Quantity, string? Notes);

    private sealed record Validation(ImportPreviewDto Preview, IReadOnlyList<CreateProductionOrderRequest> Requests);

    public byte[] Template() => reader.CreateTemplate();

    public async Task<ImportPreviewDto> ValidateAsync(Stream xlsx, string fileName, CancellationToken ct = default) =>
        (await ValidateCoreAsync(await ReadAllAsync(xlsx, ct), ct)).Preview;

    public async Task<ImportResultDto> CreateAsync(Stream xlsx, string fileName, bool confirmWarnings, bool releaseOnImport,
        CancellationToken ct = default)
    {
        if (releaseOnImport && access.Access?.Has(Permissions.ProductionOrdersManage) != true)
            throw new ForbiddenException("Liberar las órdenes al importar requiere el permiso de administrar órdenes de producción.");

        var bytes = await ReadAllAsync(xlsx, ct);
        var validation = await ValidateCoreAsync(bytes, ct);
        var preview = validation.Preview;
        if (preview.Errors.Count > 0)
            throw new ImportValidationException(preview.Errors);
        if (preview.Warnings.Count > 0 && !confirmWarnings)
            throw new BusinessRuleException("import_warnings_not_confirmed",
                $"El archivo tiene {preview.Warnings.Count} aviso(s): confírmalos para importar.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var import = new ProductionOrderImport(await folios.NextAsync(DocType.ProductionOrderImport, ct), Path.GetFileName(fileName),
            preview.FileSha256, preview.RowCount, preview.OrderCount, releaseOnImport);
        db.ProductionOrderImports.Add(import);
        await db.SaveChangesAsync(ct);

        var created = await orders.CreateManyInTransactionAsync(validation.Requests, ProductionOrderSource.Import, import.Id, ct);
        if (releaseOnImport)
            foreach (var order in created)
                order.Release(clock.UtcNow, currentUser.UserId);

        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new ImportResultDto(import.Id, import.Folio, created.Count, releaseOnImport, created.Select(o => o.Folio).ToList());
    }

    public async Task<PagedResult<ProductionOrderImportListItemDto>> ListAsync(PageQuery query, CancellationToken ct = default)
    {
        var imports = db.ProductionOrderImports.AsNoTracking();
        if (query.SearchTerm() is { } term)
            imports = imports.Where(i => i.Folio.ToLower().Contains(term) || i.FileName.ToLower().Contains(term));
        var page = await imports.OrderByDescending(i => i.CreatedAt).ToPagedResultAsync(query, ct);
        var users = await userDirectory.GetNamesAsync(page.Items.Select(i => i.CreatedBy), ct);
        return new PagedResult<ProductionOrderImportListItemDto>(page.Items.Select(i => new ProductionOrderImportListItemDto(i.Id, i.Folio,
            i.FileName, i.RowCount, i.OrderCount, i.ReleasedOnImport, i.CreatedAt, users.Of(i.CreatedBy))).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<ProductionOrderImportDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var import = await db.ProductionOrderImports.AsNoTracking().SingleOrDefaultAsync(i => i.Id == id, ct)
                     ?? throw new NotFoundException("la importación", id);
        var allowed = scope.AllowedLocationIds;
        var imported = await (from o in db.ProductionOrders.AsNoTracking()
                              where o.ImportId == id && allowed.Contains(o.LocationId)
                              join i in db.Items on o.OutputItemId equals i.Id
                              join a in db.ProductionAreas on o.ProductionAreaId equals a.Id into areas
                              from a in areas.DefaultIfEmpty()
                              orderby o.ScheduledDate, o.Folio
                              select new ImportedOrderDto(o.Id, o.Folio, i.Sku, i.Name, o.ScheduledDate, o.PlannedQty, a == null ? null : a.Name,
                                  o.Shift, o.Status)).ToListAsync(ct);
        var users = await userDirectory.GetNamesAsync([import.CreatedBy], ct);
        return new ProductionOrderImportDto(import.Id, import.Folio, import.FileName, import.FileSha256, import.RowCount, import.OrderCount,
            import.ReleasedOnImport, import.CreatedAt, users.Of(import.CreatedBy), imported);
    }

    private static async Task<byte[]> ReadAllAsync(Stream xlsx, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        await xlsx.CopyToAsync(buffer, ct);
        return buffer.ToArray();
    }

    /// <summary>RN-90..RN-93: every row is checked and every error reported; valid rows are grouped into orders.</summary>
    private async Task<Validation> ValidateCoreAsync(byte[] bytes, CancellationToken ct)
    {
        var sha = Convert.ToHexStringLower(SHA256.HashData(bytes));
        var sheet = reader.Read(new MemoryStream(bytes));
        var errors = new List<ImportError>();
        var warnings = new List<ImportWarningDto>();

        foreach (var missing in Columns.Required.Except(sheet.Headers))
            errors.Add(new ImportError(1, missing, $"Falta la columna obligatoria '{missing}'."));
        foreach (var unknown in sheet.Headers.Except(Columns.All).Distinct())
            warnings.Add(new ImportWarningDto("unknown_column", 1, $"La columna '{unknown}' no se reconoce y se ignorará."));
        if (sheet.Rows.Count > MaxRows)
            errors.Add(new ImportError(1, null, $"El archivo tiene {sheet.Rows.Count} filas; el máximo es {MaxRows}."));
        if (errors.Count == 0 && sheet.Rows.Count == 0)
            errors.Add(new ImportError(1, null, "El archivo no tiene filas para importar."));
        if (errors.Count > 0)
            return new Validation(new ImportPreviewDto(sha, sheet.Rows.Count, 0, errors, warnings, []), []);

        var catalogs = await LoadCatalogsAsync(sheet, ct);
        var today = clock.BusinessDate();
        var parsed = new List<ParsedRow>();
        foreach (var row in sheet.Rows)
        {
            var rowErrors = new List<ImportError>();
            var result = ParseRow(row, catalogs, today, rowErrors);
            if (rowErrors.Count > 0) errors.AddRange(rowErrors); else parsed.Add(result!);
        }

        if (errors.Count > 0)
            return new Validation(new ImportPreviewDto(sha, sheet.Rows.Count, 0, errors, warnings, []), []);

        // RN-92: same (date, sku, area, shift, location) → one order.
        var groups = parsed.GroupBy(p => (p.Date, p.ItemId, p.AreaId, p.Shift, p.LocationId))
            .OrderBy(g => g.Key.Date).ThenBy(g => catalogs.Items[g.Key.ItemId].Sku).ToList();

        // RN-93: same file as a previous import; an open order of the same product, date, area and shift.
        var previous = await db.ProductionOrderImports.AsNoTracking().Where(i => i.FileSha256 == sha)
            .OrderByDescending(i => i.CreatedAt).FirstOrDefaultAsync(ct);
        if (previous is not null)
            warnings.Add(new ImportWarningDto("duplicate_file", null,
                $"Este archivo ya se importó el {BusinessCalendar.ToBusinessDate(previous.CreatedAt):dd/MM/yyyy} ({previous.Folio})."));
        warnings.AddRange(await ExistingOrderWarningsAsync(groups.Select(g => (g.Key.Date, g.Key.ItemId, g.Key.AreaId, g.Key.Shift, Row: g.Min(r => r.Row))), catalogs, ct));

        var previews = groups.Select(g =>
        {
            var item = catalogs.Items[g.Key.ItemId];
            var notes = string.Join(" / ", g.Select(r => r.Notes).OfType<string>().Distinct());
            return new ImportOrderPreviewDto(g.Select(r => r.Row).ToList(), g.Key.Date, g.Key.LocationId, catalogs.LocationCodes[g.Key.LocationId],
                item.Id, item.Sku, item.Name, g.Key.AreaId, g.Key.AreaId is { } a ? catalogs.AreaNames[a] : null, g.Key.Shift, g.Sum(r => r.Quantity),
                item.Uom, catalogs.RecipeVersions[item.Id], notes.Length == 0 ? null : notes[..Math.Min(notes.Length, MaxNotesLength)]);
        }).ToList();
        var requests = previews.Select(p => new CreateProductionOrderRequest(p.LocationId, p.ItemId, p.Quantity, p.ScheduledDate,
            p.ProductionAreaId, p.Shift, p.Notes)).ToList();

        return new Validation(new ImportPreviewDto(sha, sheet.Rows.Count, previews.Count, [], warnings, previews), requests);
    }

    private async Task<IEnumerable<ImportWarningDto>> ExistingOrderWarningsAsync(
        IEnumerable<(DateOnly Date, Guid ItemId, Guid? AreaId, Shift? Shift, int Row)> groups, Catalogs catalogs, CancellationToken ct)
    {
        var list = groups.ToList();
        var itemIds = list.Select(g => g.ItemId).Distinct().ToList();
        var dates = list.Select(g => g.Date).Distinct().ToList();
        var existing = await db.ProductionOrders.AsNoTracking()
            .Where(o => itemIds.Contains(o.OutputItemId) && dates.Contains(o.ScheduledDate) && o.Status != ProductionOrderStatus.Cancelled)
            .Select(o => new { o.Folio, o.OutputItemId, o.ScheduledDate, o.ProductionAreaId, o.Shift })
            .ToListAsync(ct);

        return list.SelectMany(g => existing
            .Where(o => o.OutputItemId == g.ItemId && o.ScheduledDate == g.Date && o.ProductionAreaId == g.AreaId && o.Shift == g.Shift)
            .Select(o => new ImportWarningDto("existing_order", g.Row,
                $"Ya existe la OP {o.Folio} de {catalogs.Items[g.ItemId].Sku} para el {g.Date:dd/MM/yyyy}" +
                (g.Shift is { } s ? $", turno {ShiftLabel(s)}." : "."))));
    }

    private static string ShiftLabel(Shift shift) => shift switch
    {
        Domain.Organization.Shift.Day => "Día",
        Domain.Organization.Shift.Afternoon => "Tarde",
        _ => "Noche",
    };

    private sealed record ImportItem(Guid Id, string Sku, string? InternalCode, string Name, ItemType Type, bool IsActive, Guid? AreaId, string Uom);

    private sealed record Catalogs(
        IReadOnlyDictionary<string, ImportItem> ItemsByInternalCode,
        IReadOnlyDictionary<Guid, ImportItem> Items,
        IReadOnlyDictionary<Guid, int> RecipeVersions,
        IReadOnlyDictionary<string, ProductionArea> AreasByKey,
        IReadOnlyDictionary<Guid, string> AreaNames,
        IReadOnlyDictionary<string, Location> LocationsByCode,
        IReadOnlyDictionary<Guid, string> LocationCodes,
        Location? DefaultPlant);

    /// <summary>Products, areas and plants resolved in a few queries for the whole file.</summary>
    private async Task<Catalogs> LoadCatalogsAsync(ExcelSheet sheet, CancellationToken ct)
    {
        var codes = sheet.Rows.Select(r => r.Get(Columns.InternalCode)?.Text).OfType<string>().Select(ItemRules.NormalizeSku).Distinct().ToList();
        var items = await (from i in db.Items.AsNoTracking()
                           join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                           where codes.Contains(i.InternalCode!)
                           select new ImportItem(i.Id, i.Sku, i.InternalCode, i.Name, i.Type, i.IsActive, i.ProductionAreaId, u.Code)).ToListAsync(ct);
        var itemIds = items.Select(i => i.Id).ToList();
        var recipes = await db.Recipes.AsNoTracking().Where(r => itemIds.Contains(r.OutputItemId) && r.IsActive)
            .ToDictionaryAsync(r => r.OutputItemId, r => r.VersionNumber, ct);

        var areas = await db.ProductionAreas.AsNoTracking().ToListAsync(ct);
        var areasByKey = new Dictionary<string, ProductionArea>();
        foreach (var area in areas.OrderBy(a => a.IsActive))
        {
            areasByKey[CsvText.Normalize(area.Code)] = area;
            areasByKey[CsvText.Normalize(area.Name)] = area;
        }

        var allowed = scope.AllowedLocationIds;
        var plants = await db.Locations.AsNoTracking().Where(l => l.Type == LocationType.Plant).ToListAsync(ct);
        var defaultPlant = plants.Where(p => p.IsActive && allowed.Contains(p.Id)).OrderBy(p => p.Code != Location.PlantCode).FirstOrDefault();

        return new Catalogs(items.ToDictionary(i => i.InternalCode!), items.ToDictionary(i => i.Id), recipes, areasByKey,
            areas.ToDictionary(a => a.Id, a => a.Name), plants.ToDictionary(p => p.Code), plants.ToDictionary(p => p.Id, p => p.Code), defaultPlant);
    }

    private ParsedRow? ParseRow(ExcelRow row, Catalogs catalogs, DateOnly today, List<ImportError> errors)
    {
        void Error(string column, string message) => errors.Add(new ImportError(row.Row, column, message));

        foreach (var column in Columns.Required.Where(c => row.Get(c) is null))
            Error(column, "El valor es obligatorio.");

        DateOnly? date = null;
        if (row.Get(Columns.Date) is { } dateCell)
        {
            date = dateCell.Date
                   ?? (dateCell.Number is { } serial && serial is > 0 and < 2958466 ? DateOnly.FromDateTime(DateTime.FromOADate((double)serial)) : (DateOnly?)null)
                   ?? (DateOnly.TryParseExact(dateCell.Text, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed) ? parsed : (DateOnly?)null);
            if (date is null)
                Error(Columns.Date, $"'{dateCell.Text}' no es una fecha válida. Usa una celda de fecha o el formato dd/mm/aaaa.");
            else if (date < today)
                Error(Columns.Date, $"La fecha {date:dd/MM/yyyy} ya pasó.");
        }

        ImportItem? item = null;
        if (row.Get(Columns.InternalCode) is { } codeCell)
        {
            var code = ItemRules.NormalizeSku(codeCell.Text);
            if (!catalogs.ItemsByInternalCode.TryGetValue(code, out item) || !item.IsActive)
                Error(Columns.InternalCode, $"El código interno '{codeCell.Text}' no existe o su artículo no está activo.");
            else if (!RecipeRules.CanBeProduced(item.Type))
                Error(Columns.InternalCode, $"{item.Sku} no se produce: solo semiterminados y productos terminados.");
            else if (!catalogs.RecipeVersions.ContainsKey(item.Id))
                Error(Columns.InternalCode, $"{item.Sku} no tiene receta activa.");
            if (errors.Any(e => e.Row == row.Row && e.Column == Columns.InternalCode))
                item = null;
        }

        decimal? quantity = null;
        if (row.Get(Columns.Quantity) is { } qtyCell)
        {
            quantity = qtyCell.Number ?? CsvText.ParseDecimal(qtyCell.Text);
            if (quantity is null)
                Error(Columns.Quantity, $"'{qtyCell.Text}' no es un número válido.");
            else if (quantity <= 0)
                Error(Columns.Quantity, "La cantidad debe ser mayor que cero.");
            else if (InventoryMath.Round(quantity.Value) != quantity)
                Error(Columns.Quantity, "La cantidad admite máximo 4 decimales.");
            else if (item?.Uom == UnitOfMeasure.PieceCode && !InventoryMath.IsWhole(quantity.Value))
                Error(Columns.Quantity, $"{item.Sku} se maneja en piezas: la cantidad debe ser entera.");
        }

        Guid? areaId = item?.AreaId;
        if (row.Get(Columns.Area) is { } areaCell)
        {
            if (!catalogs.AreasByKey.TryGetValue(CsvText.Normalize(areaCell.Text), out var area) || !area.IsActive)
                Error(Columns.Area, $"El área '{areaCell.Text}' no existe o no está activa.");
            else
                areaId = area.Id;
        }

        Shift? shift = null;
        if (row.Get(Columns.Shift) is { } shiftCell)
        {
            if (Shifts.TryGetValue(CsvText.Normalize(shiftCell.Text), out var value))
                shift = value;
            else
                Error(Columns.Shift, $"Turno '{shiftCell.Text}' no válido. Usa Día, Tarde o Noche.");
        }

        var locationId = catalogs.DefaultPlant?.Id;
        if (row.Get(Columns.Location) is { } locationCell)
        {
            if (!catalogs.LocationsByCode.TryGetValue(locationCell.Text.Trim().ToUpperInvariant(), out var location)
                || !location.IsActive || !scope.AllowedLocationIds.Contains(location.Id))
            {
                Error(Columns.Location, $"'{locationCell.Text}' no es una Planta activa de tu alcance.");
                locationId = null;
            }
            else
                locationId = location.Id;
        }
        else if (locationId is null)
            Error(Columns.Location, "No tienes acceso a la Planta.");

        var notes = row.Get(Columns.Notes)?.Text.Trim();
        if (notes is { Length: > MaxNotesLength })
            Error(Columns.Notes, $"Las notas admiten máximo {MaxNotesLength} caracteres.");

        return errors.Any(e => e.Row == row.Row)
            ? null
            : new ParsedRow(row.Row, date!.Value, locationId!.Value, item!.Id, areaId, shift, quantity!.Value, notes);
    }
}
