using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Application.Catalog;

public interface IItemService
{
    Task<PagedResult<ItemListItemDto>> ListAsync(ItemListQuery query, CancellationToken ct = default);
    Task<IReadOnlyList<ItemLookupDto>> LookupAsync(ItemLookupQuery query, CancellationToken ct = default);
    Task<ItemDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<ItemDto> CreateAsync(CreateItemRequest request, CancellationToken ct = default);
    Task<ItemDto> UpdateAsync(Guid id, UpdateItemRequest request, CancellationToken ct = default);
    Task<IReadOnlyList<ItemLocationSettingDto>> GetLocationSettingsAsync(Guid itemId, CancellationToken ct = default);
    Task<IReadOnlyList<ItemLocationSettingDto>> UpdateLocationSettingsAsync(Guid itemId, UpdateItemLocationSettingsRequest request, CancellationToken ct = default);
}

/// <summary>Referential item rules shared by the API and the CSV import (dominio §4.2, D-05).</summary>
public static class ItemReferenceRules
{
    public const string BulkTargetMessage = "La versión a granel debe ser un producto terminado a granel activo.";
    public const string ItemHasMovementsMessage =
        "El artículo ya tiene movimientos de inventario: no puedes cambiar su unidad base ni su control de lotes.";
    public const string WholeMultipleMessage = "Con unidad base en piezas, el múltiplo de OP debe ser entero.";
    public const string BulkHasPackagedMessage =
        "Este producto tiene versiones empaquetadas ligadas: debe seguir siendo un producto terminado a granel.";

    public static bool IsValidBulkTarget(Item target, Guid? selfId) =>
        target.Id != selfId && target is { Type: ItemType.FinishedGood, Presentation: ItemPresentation.Bulk, IsActive: true };

    /// <summary>RN-03b: production quantities of a piece-counted item are whole, so its multiple is too.</summary>
    public static bool MultipleFitsUnit(UnitOfMeasure baseUom, decimal? multiple) =>
        !baseUom.RequiresWholeQuantities || multiple is null || decimal.Truncate(multiple.Value) == multiple.Value;
}

public sealed class ItemService(IAppDbContext db, ILocationScope scope, IUserDirectory userDirectory) : IItemService
{
    private static readonly Dictionary<string, Expression<Func<Item, object?>>> SortColumns = new()
    {
        ["sku"] = i => i.Sku,
        ["name"] = i => i.Name,
        ["type"] = i => i.Type,
    };

    public async Task<PagedResult<ItemListItemDto>> ListAsync(ItemListQuery query, CancellationToken ct = default)
    {
        var items = db.Items.AsNoTracking();
        if (!query.IncludeInactive)
            items = items.Where(i => i.IsActive);
        if (query.Type is { } type)
            items = items.Where(i => i.Type == type);
        if (query.Presentation is { } presentation)
            items = items.Where(i => i.Presentation == presentation);
        if (query.CategoryId is { } categoryId)
            items = items.Where(i => i.CategoryId == categoryId);
        if (query.BulkItemId is { } bulkItemId)
            items = items.Where(i => i.BulkItemId == bulkItemId);
        if (query.SearchTerm() is { } term)
            items = items.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term));

        var page = await items.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, ct);

        // Categories and units are small catalogs: resolve the page's names in two queries.
        var categoryIds = page.Items.Select(i => i.CategoryId).Distinct().ToList();
        var uomIds = page.Items.Select(i => i.BaseUomId).Distinct().ToList();
        var categories = await db.ItemCategories.Where(c => categoryIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var uoms = await db.UnitsOfMeasure.Where(u => uomIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Code, ct);
        var itemIds = page.Items.Select(i => i.Id).ToList();
        var photos = await db.ItemPhotos.Where(p => itemIds.Contains(p.ItemId)).Select(p => new { p.ItemId, p.Revision }).ToDictionaryAsync(p => p.ItemId, p => p.Revision, ct);

        return new PagedResult<ItemListItemDto>(
            page.Items.Select(i => new ItemListItemDto(i.Id, i.Sku, i.Name, i.Type, i.Presentation, i.CategoryId,
                categories[i.CategoryId], uoms[i.BaseUomId], i.TracksLots, i.StorageCondition, i.IsActive,
                photos.TryGetValue(i.Id, out var revision) ? revision : null)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<IReadOnlyList<ItemLookupDto>> LookupAsync(ItemLookupQuery query, CancellationToken ct = default)
    {
        var items = db.Items.AsNoTracking();
        if (query.Id is { } id)
            items = items.Where(i => i.Id == id);
        else
            items = items.Where(i => i.IsActive);
        if (query.Type is { } type)
            items = items.Where(i => i.Type == type);
        if (query.Presentation is { } presentation)
            items = items.Where(i => i.Presentation == presentation);
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var term = query.Q.Trim().ToLower();
            items = items.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term));
        }

        var limit = Math.Clamp(query.Limit, 1, ItemLookupQuery.MaxResults);
        return await (from i in items
                      join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                      orderby i.Sku
                      select new ItemLookupDto(i.Id, i.Sku, i.Name, i.Type, i.Presentation, u.Code, i.TracksLots,
                          i.ShelfLifeDays,
                          db.ItemPhotos.Where(p => p.ItemId == i.Id).Select(p => (long?)p.Revision).FirstOrDefault()))
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task<ItemDto> GetAsync(Guid id, CancellationToken ct = default) => await ToDtoAsync(await FindAsync(id, ct), ct);

    public async Task<ItemDto> CreateAsync(CreateItemRequest request, CancellationToken ct = default)
    {
        var definition = request.ToDefinition();
        await ValidateReferencesAsync(definition, null, ct);

        var item = new Item(definition);
        db.Items.Add(item);
        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(item, ct);
    }

    public async Task<ItemDto> UpdateAsync(Guid id, UpdateItemRequest request, CancellationToken ct = default)
    {
        var item = await FindAsync(id, ct);
        db.EnsureVersion(item, request.Version);
        var definition = request.ToDefinition();
        await ValidateReferencesAsync(definition, item, ct);

        if ((definition.BaseUomId != item.BaseUomId || definition.TracksLots != item.TracksLots)
            && await db.InventoryMovements.AnyAsync(m => m.ItemId == id, ct))
            throw new BusinessRuleException("item_has_movements", ItemReferenceRules.ItemHasMovementsMessage);

        item.Update(definition);
        if (request.IsActive) item.Activate(); else item.Deactivate();

        await db.SaveChangesAsync(ct);
        return await ToDtoAsync(item, ct);
    }

    public async Task<IReadOnlyList<ItemLocationSettingDto>> GetLocationSettingsAsync(Guid itemId, CancellationToken ct = default)
    {
        await FindAsync(itemId, ct);
        var allowed = scope.AllowedLocationIds;

        return await (from l in db.Locations.AsNoTracking()
                      where allowed.Contains(l.Id) && l.IsActive
                      join s in db.ItemLocationSettings.Where(s => s.ItemId == itemId) on l.Id equals s.LocationId into settings
                      from s in settings.DefaultIfEmpty()
                      orderby l.Code
                      select new ItemLocationSettingDto(l.Id, l.Code, l.Name,
                          s == null ? null : s.MinQty, s == null ? null : s.MaxQty))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<ItemLocationSettingDto>> UpdateLocationSettingsAsync(
        Guid itemId, UpdateItemLocationSettingsRequest request, CancellationToken ct = default)
    {
        await FindAsync(itemId, ct);

        var locationIds = request.Settings.Select(s => s.LocationId).ToList();
        foreach (var locationId in locationIds)
            scope.EnsureAccess(locationId);

        var existing = await db.ItemLocationSettings
            .Where(s => s.ItemId == itemId && locationIds.Contains(s.LocationId))
            .ToDictionaryAsync(s => s.LocationId, ct);

        foreach (var input in request.Settings)
        {
            existing.TryGetValue(input.LocationId, out var setting);
            if (input.MinQty is null)
            {
                if (setting is not null)
                    db.ItemLocationSettings.Remove(setting);
            }
            else if (setting is null)
                db.ItemLocationSettings.Add(new ItemLocationSetting(itemId, input.LocationId, input.MinQty.Value, input.MaxQty!.Value));
            else
                setting.Set(input.MinQty.Value, input.MaxQty!.Value);
        }

        await db.SaveChangesAsync(ct);
        return await GetLocationSettingsAsync(itemId, ct);
    }

    /// <summary>
    /// SKU unique; category and units must exist and be active (the current ones may stay even if deactivated);
    /// the bulk link must point to an active bulk finished good; a bulk item with packaged versions stays bulk.
    /// </summary>
    private async Task ValidateReferencesAsync(ItemDefinition d, Item? current, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var sku = ItemRules.NormalizeSku(d.Sku);
        var currentId = current?.Id;
        var currentCategoryId = current?.CategoryId;
        var currentBaseUomId = current?.BaseUomId;
        var currentPurchaseUomId = current?.PurchaseUomId;

        if (await db.Items.AnyAsync(i => i.Sku == sku && i.Id != currentId, ct))
            errors["sku"] = [$"El SKU '{sku}' ya existe."];

        if (!await db.ItemCategories.AnyAsync(c => c.Id == d.CategoryId && (c.IsActive || c.Id == currentCategoryId), ct))
            errors["categoryId"] = ["La categoría no existe o está inactiva."];

        var baseUom = await db.UnitsOfMeasure.SingleOrDefaultAsync(
            u => u.Id == d.BaseUomId && (u.IsActive || u.Id == currentBaseUomId), ct);
        if (baseUom is null)
            errors["baseUomId"] = ["La unidad base no existe o está inactiva."];
        else if (!ItemReferenceRules.MultipleFitsUnit(baseUom, d.ProductionMultiple))
            errors["productionMultiple"] = [ItemReferenceRules.WholeMultipleMessage];

        if (d.PurchaseUomId is { } purchaseUomId
            && !await db.UnitsOfMeasure.AnyAsync(u => u.Id == purchaseUomId && (u.IsActive || u.Id == currentPurchaseUomId), ct))
            errors["purchaseUomId"] = ["La unidad de compra no existe o está inactiva."];

        if (d.BulkItemId is { } bulkItemId && d.BulkItemId != current?.BulkItemId)
        {
            var target = await db.Items.AsNoTracking().SingleOrDefaultAsync(i => i.Id == bulkItemId, ct);
            if (target is null || !ItemReferenceRules.IsValidBulkTarget(target, currentId))
                errors["bulkItemId"] = [ItemReferenceRules.BulkTargetMessage];
        }

        if (current is { Presentation: ItemPresentation.Bulk }
            && (d.Type != ItemType.FinishedGood || d.Presentation != ItemPresentation.Bulk)
            && await db.Items.AnyAsync(i => i.BulkItemId == current.Id, ct))
            errors["presentation"] = [ItemReferenceRules.BulkHasPackagedMessage];

        if (errors.Count > 0)
            throw new RequestValidationException(errors);
    }

    private async Task<ItemDto> ToDtoAsync(Item i, CancellationToken ct)
    {
        var baseUomCode = await db.UnitsOfMeasure.Where(u => u.Id == i.BaseUomId).Select(u => u.Code).SingleAsync(ct);
        var bulk = i.BulkItemId is { } bulkId
            ? await db.Items.AsNoTracking().Where(b => b.Id == bulkId).Select(b => new { b.Sku, b.Name }).SingleOrDefaultAsync(ct)
            : null;
        var names = await userDirectory.GetNamesAsync([i.CreatedBy, i.UpdatedBy], ct);
        var photoRevision = await db.ItemPhotos.Where(p => p.ItemId == i.Id).Select(p => (long?)p.Revision).SingleOrDefaultAsync(ct);

        return new ItemDto(i.Id, i.Sku, i.Name, i.Type, i.CategoryId, i.BaseUomId, baseUomCode, i.PurchaseUomId,
            i.PurchaseToBaseFactor, i.TracksLots, i.ShelfLifeDays, i.StorageCondition, i.TaxRate, i.Presentation,
            i.BulkItemId, bulk?.Sku, bulk?.Name, i.UnitsPerPackage, i.ProductionMultiple, i.UnitWeightGrams,
            i.IsActive, i.CreatedAt, names.Of(i.CreatedBy), i.UpdatedAt, names.Of(i.UpdatedBy), i.Version, photoRevision);
    }

    private async Task<Item> FindAsync(Guid id, CancellationToken ct) =>
        await db.Items.SingleOrDefaultAsync(i => i.Id == id, ct) ?? throw new NotFoundException("el artículo", id);
}
