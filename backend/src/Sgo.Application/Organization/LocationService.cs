using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Domain.Common;
using Sgo.Domain.Organization;

namespace Sgo.Application.Organization;

public sealed record LocationListQuery : PageQuery
{
    public bool IncludeInactive { get; init; }
    public LocationType? Type { get; init; }
}

public sealed record LocationDto(
    Guid Id,
    string Code,
    string Name,
    LocationType Type,
    string? Address,
    bool IsActive,
    bool CanProduce,
    bool CanSupplyBranches,
    uint Version);

/// <summary>Active location for destination pickers (e.g. transfers): any active location, not only the user's.</summary>
public sealed record LocationLookupDto(Guid Id, string Code, string Name, LocationType Type);

public sealed record CreateLocationRequest(string Code, string Name, LocationType Type, string? Address);

public sealed class CreateLocationRequestValidator : AbstractValidator<CreateLocationRequest>
{
    public CreateLocationRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9-]+$")
            .WithMessage("El código solo admite letras, números y guion (ej. SUC-11).").WithName("Código");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).WithName("Nombre");
        RuleFor(x => x.Type).IsInEnum().WithName("Tipo");
        RuleFor(x => x.Address).MaximumLength(500).WithName("Dirección");
    }
}

/// <summary>Code and type are fixed once created: documents and rules (RN-14, RN-20) depend on them.</summary>
public sealed record UpdateLocationRequest(uint Version, string Name, string? Address, bool IsActive);

public sealed class UpdateLocationRequestValidator : AbstractValidator<UpdateLocationRequest>
{
    public UpdateLocationRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).WithName("Nombre");
        RuleFor(x => x.Address).MaximumLength(500).WithName("Dirección");
    }
}

public static class LocationMapping
{
    public static LocationDto ToDto(this Location l) =>
        new(l.Id, l.Code, l.Name, l.Type, l.Address, l.IsActive, l.CanProduce, l.CanSupplyBranches, l.Version);
}

public interface ILocationService
{
    Task<PagedResult<LocationDto>> ListAsync(LocationListQuery query, CancellationToken ct = default);
    Task<LocationDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>All active locations (not limited by scope), ordered by code.</summary>
    Task<IReadOnlyList<LocationLookupDto>> LookupAsync(CancellationToken ct = default);
    Task<LocationDto> CreateAsync(CreateLocationRequest request, CancellationToken ct = default);
    Task<LocationDto> UpdateAsync(Guid id, UpdateLocationRequest request, CancellationToken ct = default);
}

public sealed class LocationService(ISgoDbContext db, ILocationScope scope, IUserAccessService userAccess) : ILocationService
{
    private static readonly Dictionary<string, Expression<Func<Location, object?>>> SortColumns = new()
    {
        ["code"] = l => l.Code,
        ["name"] = l => l.Name,
        ["type"] = l => l.Type,
    };

    public Task<PagedResult<LocationDto>> ListAsync(LocationListQuery query, CancellationToken ct = default)
    {
        var allowed = scope.AllowedLocationIds;
        var locations = db.Locations.AsNoTracking().Where(l => allowed.Contains(l.Id));

        if (!query.IncludeInactive)
            locations = locations.Where(l => l.IsActive);
        if (query.Type is { } type)
            locations = locations.Where(l => l.Type == type);
        if (query.SearchTerm() is { } term)
            locations = locations.Where(l => l.Code.ToLower().Contains(term) || l.Name.ToLower().Contains(term));

        return locations
            .ApplySort(query.Sort, SortColumns, "code")
            .ToPagedResultAsync(query, LocationMapping.ToDto, ct);
    }

    public async Task<LocationDto> GetAsync(Guid id, CancellationToken ct = default) =>
        (await FindAsync(id, ct)).ToDto();

    public async Task<IReadOnlyList<LocationLookupDto>> LookupAsync(CancellationToken ct = default) =>
        await db.Locations.AsNoTracking()
            .Where(l => l.IsActive)
            .OrderBy(l => l.Code)
            .Select(l => new LocationLookupDto(l.Id, l.Code, l.Name, l.Type))
            .ToListAsync(ct);

    public async Task<LocationDto> CreateAsync(CreateLocationRequest request, CancellationToken ct = default)
    {
        var location = new Location(request.Code, request.Name, request.Type, request.Address);
        if (await db.Locations.AnyAsync(l => l.Code == location.Code, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["code"] = [$"La ubicación '{location.Code}' ya existe."] });

        db.Locations.Add(location);
        await db.SaveChangesAsync(ct);
        userAccess.InvalidateAll(); // users with locations.all must see the new location right away
        return location.ToDto();
    }

    public async Task<LocationDto> UpdateAsync(Guid id, UpdateLocationRequest request, CancellationToken ct = default)
    {
        var location = await FindAsync(id, ct);
        db.EnsureVersion(location, request.Version);

        location.Update(request.Name, location.Type, request.Address);
        if (request.IsActive) location.Activate(); else location.Deactivate();

        await db.SaveChangesAsync(ct);
        return location.ToDto();
    }

    private async Task<Location> FindAsync(Guid id, CancellationToken ct)
    {
        var location = await db.Locations.SingleOrDefaultAsync(l => l.Id == id, ct)
                       ?? throw new NotFoundException("la ubicación", id);
        scope.EnsureAccess(location.Id);
        return location;
    }
}
