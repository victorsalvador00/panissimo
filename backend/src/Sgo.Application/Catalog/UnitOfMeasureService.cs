using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Domain.Catalog;
using Sgo.Domain.Common;

namespace Sgo.Application.Catalog;

public interface IUnitOfMeasureService
{
    Task<PagedResult<UnitOfMeasureDto>> ListAsync(CatalogListQuery query, CancellationToken ct = default);
    Task<UnitOfMeasureDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<UnitOfMeasureDto> CreateAsync(CreateUnitOfMeasureRequest request, CancellationToken ct = default);
    Task<UnitOfMeasureDto> UpdateAsync(Guid id, UpdateUnitOfMeasureRequest request, CancellationToken ct = default);
}

public sealed class UnitOfMeasureService(ISgoDbContext db) : IUnitOfMeasureService
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
