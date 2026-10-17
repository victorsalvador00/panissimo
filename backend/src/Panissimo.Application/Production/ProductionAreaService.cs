using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Production;

public sealed record ProductionAreaListQuery : PageQuery
{
    public bool IncludeInactive { get; init; }
}

public sealed record ProductionAreaDto(Guid Id, string Code, string Name, int SortOrder, bool IsActive, uint Version);

public sealed record CreateProductionAreaRequest(string Code, string Name, int SortOrder);

/// <summary>The code is fixed once created: the Excel import refers to areas by code or name.</summary>
public sealed record UpdateProductionAreaRequest(uint Version, string Name, int SortOrder, bool IsActive);

public sealed class CreateProductionAreaRequestValidator : AbstractValidator<CreateProductionAreaRequest>
{
    public CreateProductionAreaRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9-]+$")
            .WithMessage("El código solo admite letras, números y guion (ej. BIZ-DIA).").WithName("Código");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 9999).WithName("Orden");
    }
}

public sealed class UpdateProductionAreaRequestValidator : AbstractValidator<UpdateProductionAreaRequest>
{
    public UpdateProductionAreaRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithName("Nombre");
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 9999).WithName("Orden");
    }
}

public interface IProductionAreaService
{
    Task<PagedResult<ProductionAreaDto>> ListAsync(ProductionAreaListQuery query, CancellationToken ct = default);
    Task<ProductionAreaDto> GetAsync(Guid id, CancellationToken ct = default);
    Task<ProductionAreaDto> CreateAsync(CreateProductionAreaRequest request, CancellationToken ct = default);
    Task<ProductionAreaDto> UpdateAsync(Guid id, UpdateProductionAreaRequest request, CancellationToken ct = default);
}

public sealed class ProductionAreaService(IAppDbContext db) : IProductionAreaService
{
    private static readonly Dictionary<string, Expression<Func<ProductionArea, object?>>> SortColumns = new()
    {
        ["sortOrder"] = a => a.SortOrder,
        ["code"] = a => a.Code,
        ["name"] = a => a.Name,
    };

    public Task<PagedResult<ProductionAreaDto>> ListAsync(ProductionAreaListQuery query, CancellationToken ct = default)
    {
        var areas = db.ProductionAreas.AsNoTracking();
        if (!query.IncludeInactive)
            areas = areas.Where(a => a.IsActive);
        if (query.SearchTerm() is { } term)
            areas = areas.Where(a => a.Code.ToLower().Contains(term) || a.Name.ToLower().Contains(term));

        return areas.ApplySort(query.Sort, SortColumns, "sortOrder").ToPagedResultAsync(query, ToDto, ct);
    }

    public async Task<ProductionAreaDto> GetAsync(Guid id, CancellationToken ct = default) => ToDto(await FindAsync(id, ct));

    public async Task<ProductionAreaDto> CreateAsync(CreateProductionAreaRequest request, CancellationToken ct = default)
    {
        var area = new ProductionArea(request.Code, request.Name, request.SortOrder);
        if (await db.ProductionAreas.AnyAsync(a => a.Code == area.Code, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["code"] = [$"El área '{area.Code}' ya existe."] });

        db.ProductionAreas.Add(area);
        await db.SaveChangesAsync(ct);
        return ToDto(area);
    }

    public async Task<ProductionAreaDto> UpdateAsync(Guid id, UpdateProductionAreaRequest request, CancellationToken ct = default)
    {
        var area = await FindAsync(id, ct);
        db.EnsureVersion(area, request.Version);

        area.Update(request.Name, request.SortOrder);
        if (request.IsActive) area.Activate(); else area.Deactivate();

        await db.SaveChangesAsync(ct);
        return ToDto(area);
    }

    private static ProductionAreaDto ToDto(ProductionArea a) => new(a.Id, a.Code, a.Name, a.SortOrder, a.IsActive, a.Version);

    private async Task<ProductionArea> FindAsync(Guid id, CancellationToken ct) =>
        await db.ProductionAreas.SingleOrDefaultAsync(a => a.Id == id, ct) ?? throw new NotFoundException("el área de producción", id);
}
