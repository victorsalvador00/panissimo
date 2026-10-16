using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.Domain.Common;

namespace Sgo.Application.Catalog;

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

public sealed class ItemService(ISgoDbContext db, ILocationScope scope) : IItemService
{
    public const string ItemHasMovementsMessage =
        "El artículo ya tiene movimientos de inventario: no puedes cambiar su unidad base ni su control de lotes.";

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
        if (query.CategoryId is { } categoryId)
            items = items.Where(i => i.CategoryId == categoryId);
        if (query.SearchTerm() is { } term)
            items = items.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term));

        var page = await items.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, ct);

        // Categories and units are small catalogs: resolve the page's names in two queries.
        var categoryIds = page.Items.Select(i => i.CategoryId).Distinct().ToList();
        var uomIds = page.Items.Select(i => i.BaseUomId).Distinct().ToList();
        var categories = await db.ItemCategories.Where(c => categoryIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name, ct);
        var uoms = await db.UnitsOfMeasure.Where(u => uomIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Code, ct);

        return new PagedResult<ItemListItemDto>(
            page.Items.Select(i => new ItemListItemDto(i.Id, i.Sku, i.Name, i.Type, i.CategoryId, categories[i.CategoryId],
                uoms[i.BaseUomId], i.TracksLots, i.StorageCondition, i.IsActive)).ToList(),
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
        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var term = query.Q.Trim().ToLower();
            items = items.Where(i => i.Sku.ToLower().Contains(term) || i.Name.ToLower().Contains(term));
        }

        var limit = Math.Clamp(query.Limit, 1, ItemLookupQuery.MaxResults);
        return await (from i in items
                      join u in db.UnitsOfMeasure on i.BaseUomId equals u.Id
                      orderby i.Sku
                      select new ItemLookupDto(i.Id, i.Sku, i.Name, i.Type, u.Code, i.TracksLots, i.ShelfLifeDays))
            .Take(limit)
            .ToListAsync(ct);
    }

    public async Task<ItemDto> GetAsync(Guid id, CancellationToken ct = default) => (await FindAsync(id, ct)).ToDto();

    public async Task<ItemDto> CreateAsync(CreateItemRequest request, CancellationToken ct = default)
    {
        var definition = request.ToDefinition();
        await ValidateReferencesAsync(definition, null, ct);

        var item = new Item(definition);
        db.Items.Add(item);
        await db.SaveChangesAsync(ct);
        return item.ToDto();
    }

    public async Task<ItemDto> UpdateAsync(Guid id, UpdateItemRequest request, CancellationToken ct = default)
    {
        var item = await FindAsync(id, ct);
        db.EnsureVersion(item, request.Version);
        var definition = request.ToDefinition();
        await ValidateReferencesAsync(definition, item, ct);

        if ((definition.BaseUomId != item.BaseUomId || definition.TracksLots != item.TracksLots)
            && await db.InventoryMovements.AnyAsync(m => m.ItemId == id, ct))
            throw new BusinessRuleException("item_has_movements", ItemHasMovementsMessage);

        item.Update(definition);
        if (request.IsActive) item.Activate(); else item.Deactivate();

        await db.SaveChangesAsync(ct);
        return item.ToDto();
    }

    public async Task<IReadOnlyList<ItemLocationSettingDto>> GetLocationSettingsAsync(Guid itemId, CancellationToken ct = default)
    {
        await FindAsync(itemId, ct);
        var allowed = scope.AllowedLocationIds;

        var rows = await (from l in db.Locations.AsNoTracking()
                          where allowed.Contains(l.Id) && l.IsActive
                          join s in db.ItemLocationSettings.Where(s => s.ItemId == itemId) on l.Id equals s.LocationId into settings
                          from s in settings.DefaultIfEmpty()
                          orderby l.Code
                          select new ItemLocationSettingDto(l.Id, l.Code, l.Name,
                              s == null ? null : s.MinQty, s == null ? null : s.MaxQty))
            .ToListAsync(ct);
        return rows;
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

    /// <summary>SKU unique; category and units must exist and be active (current ones may stay even if deactivated).</summary>
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

        if (!await db.UnitsOfMeasure.AnyAsync(u => u.Id == d.BaseUomId && (u.IsActive || u.Id == currentBaseUomId), ct))
            errors["baseUomId"] = ["La unidad base no existe o está inactiva."];

        if (d.PurchaseUomId is { } purchaseUomId
            && !await db.UnitsOfMeasure.AnyAsync(u => u.Id == purchaseUomId && (u.IsActive || u.Id == currentPurchaseUomId), ct))
            errors["purchaseUomId"] = ["La unidad de compra no existe o está inactiva."];

        if (errors.Count > 0)
            throw new RequestValidationException(errors);
    }

    private async Task<Item> FindAsync(Guid id, CancellationToken ct) =>
        await db.Items.SingleOrDefaultAsync(i => i.Id == id, ct) ?? throw new NotFoundException("el artículo", id);
}
