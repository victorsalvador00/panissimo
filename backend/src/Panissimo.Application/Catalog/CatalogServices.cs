using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;

namespace Panissimo.Application.Catalog;

public interface IUnitOfMeasureService
{
    Task<PagedResult<UnitOfMeasureDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default);
    Task<UnitOfMeasureDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<UnitOfMeasureDto> CreateAsync(CreateUnitOfMeasureRequest request, CancellationToken ct = default);
    Task<UnitOfMeasureDto> UpdateAsync(Guid id, UpdateUnitOfMeasureRequest request, CancellationToken ct = default);
}

public sealed class UnitOfMeasureService(IAppDbContext db) : IUnitOfMeasureService
{
    private static readonly Dictionary<string, Expression<Func<UnitOfMeasure, object?>>> SortColumns = new()
    {
        ["code"] = u => u.Code,
        ["name"] = u => u.Name,
        ["kind"] = u => u.Kind,
    };

    public Task<PagedResult<UnitOfMeasureDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default)
    {
        var units = db.UnitsOfMeasure.AsNoTracking();
        if (!query.IncludeInactive)
            units = units.Where(u => u.IsActive);
        if (query.SearchTerm() is { } term)
            units = units.Where(u => u.Code.ToLower().Contains(term) || u.Name.ToLower().Contains(term));

        return units.ApplySort(query.Sort, SortColumns, "code").ToPagedResultAsync(query, CatalogMapping.ToDto, ct);
    }

    public async Task<UnitOfMeasureDto> GetAsync(Guid id, CancellationToken ct = default) => (await FindAsync(id, ct)).ToDto();

    public async Task<UnitOfMeasureDto> CreateAsync(CreateUnitOfMeasureRequest request, CancellationToken ct = default)
    {
        var unit = new UnitOfMeasure(request.Code, request.Name, request.Kind);
        if (await db.UnitsOfMeasure.AnyAsync(u => u.Code == unit.Code, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["code"] = [$"La unidad '{unit.Code}' ya existe."] });

        db.UnitsOfMeasure.Add(unit);
        await db.SaveChangesAsync(ct);
        return unit.ToDto();
    }

    public async Task<UnitOfMeasureDto> UpdateAsync(Guid id, UpdateUnitOfMeasureRequest request, CancellationToken ct = default)
    {
        var unit = await FindAsync(id, ct);
        db.EnsureVersion(unit, request.Version);

        unit.Update(request.Name, request.Kind);
        if (request.IsActive) unit.Activate(); else unit.Deactivate();

        await db.SaveChangesAsync(ct);
        return unit.ToDto();
    }

    private async Task<UnitOfMeasure> FindAsync(Guid id, CancellationToken ct) =>
        await db.UnitsOfMeasure.SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new NotFoundException("la unidad de medida", id);
}

public interface IItemCategoryService
{
    Task<PagedResult<ItemCategoryDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default);
    Task<ItemCategoryDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<ItemCategoryDto> CreateAsync(CreateItemCategoryRequest request, CancellationToken ct = default);
    Task<ItemCategoryDto> UpdateAsync(Guid id, UpdateItemCategoryRequest request, CancellationToken ct = default);
}

public sealed class ItemCategoryService(IAppDbContext db) : IItemCategoryService
{
    private static readonly Dictionary<string, Expression<Func<ItemCategory, object?>>> SortColumns = new()
    {
        ["name"] = c => c.Name,
    };

    public Task<PagedResult<ItemCategoryDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default)
    {
        var categories = db.ItemCategories.AsNoTracking();
        if (!query.IncludeInactive)
            categories = categories.Where(c => c.IsActive);
        if (query.SearchTerm() is { } term)
            categories = categories.Where(c => c.Name.ToLower().Contains(term));

        return categories.ApplySort(query.Sort, SortColumns, "name").ToPagedResultAsync(query, CatalogMapping.ToDto, ct);
    }

    public async Task<ItemCategoryDto> GetAsync(Guid id, CancellationToken ct = default) => (await FindAsync(id, ct)).ToDto();

    public async Task<ItemCategoryDto> CreateAsync(CreateItemCategoryRequest request, CancellationToken ct = default)
    {
        await EnsureUniqueNameAsync(request.Name, null, ct);
        var category = new ItemCategory(request.Name);
        db.ItemCategories.Add(category);
        await db.SaveChangesAsync(ct);
        return category.ToDto();
    }

    public async Task<ItemCategoryDto> UpdateAsync(Guid id, UpdateItemCategoryRequest request, CancellationToken ct = default)
    {
        var category = await FindAsync(id, ct);
        db.EnsureVersion(category, request.Version);
        await EnsureUniqueNameAsync(request.Name, id, ct);

        category.Rename(request.Name);
        if (request.IsActive) category.Activate(); else category.Deactivate();

        await db.SaveChangesAsync(ct);
        return category.ToDto();
    }

    private async Task EnsureUniqueNameAsync(string name, Guid? exceptId, CancellationToken ct)
    {
        var normalized = name.Trim().ToLower();
        if (await db.ItemCategories.AnyAsync(c => c.Name.ToLower() == normalized && c.Id != exceptId, ct))
            throw new RequestValidationException(new Dictionary<string, string[]>
            {
                ["name"] = [$"La categoría '{name.Trim()}' ya existe."],
            });
    }

    private async Task<ItemCategory> FindAsync(Guid id, CancellationToken ct) =>
        await db.ItemCategories.SingleOrDefaultAsync(c => c.Id == id, ct) ?? throw new NotFoundException("la categoría", id);
}
