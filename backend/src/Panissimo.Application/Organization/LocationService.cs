using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Catalog;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Organization;

public sealed record LocationListQuery : PageQuery
{
    public bool IncludeInactive { get; init; }
    public LocationType? Type { get; init; }

    /// <summary>The sub-warehouses of this plant or branch.</summary>
    public Guid? ParentLocationId { get; init; }
}

public sealed record LocationDto(
    Guid Id,
    string Code,
    string Name,
    LocationType Type,
    Guid? ParentLocationId,
    string? Address,
    bool IsActive,
    bool CanPurchase,
    bool CanProduce,
    bool CanSupplyBranches,
    bool CanSellToCustomers,
    uint Version,
    IReadOnlyList<ItemType>? SuppliesTypes = null);

/// <summary>Active location for pickers (transfer destination, orders): any active location, not only the user's.</summary>
public sealed record LocationLookupDto(Guid Id, string Code, string Name, LocationType Type);

/// <param name="CanMoveStock">The caller may move inventory in it (RN-40, B-26).</param>
/// <param name="Type">Warehouse or Factory (RN-48).</param>
public sealed record WarehouseDto(Guid Id, string Code, string Name, Guid ParentLocationId, bool IsActive, bool CanMoveStock, LocationType Type);

/// <param name="ParentLocationId">Required for <c>Warehouse</c> (its plant or branch, D-01, RN-44) and <c>Factory</c> (its plant, RN-48).</param>
public sealed record CreateLocationRequest(string Code, string Name, LocationType Type, string? Address, Guid? ParentLocationId = null);

public sealed class CreateLocationRequestValidator : AbstractValidator<CreateLocationRequest>
{
    public CreateLocationRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20).Matches("^[A-Za-z0-9-]+$")
            .WithMessage("El código solo admite letras, números y guion (ej. SUC-11).").WithName("Código");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).WithName("Nombre");
        RuleFor(x => x.Type).IsInEnum().WithName("Tipo");
        RuleFor(x => x.Address).MaximumLength(500).WithName("Dirección");
        RuleFor(x => x.ParentLocationId).NotNull().When(x => x.Type == LocationType.Warehouse)
            .WithMessage("Un subalmacén pertenece a una planta o sucursal: indica su ubicación padre.");
        RuleFor(x => x.ParentLocationId).NotNull().When(x => x.Type == LocationType.Factory)
            .WithMessage("Una fábrica pertenece a una planta: indica su ubicación padre.");
        RuleFor(x => x.ParentLocationId).Null().When(x => x.Type is not (LocationType.Warehouse or LocationType.Factory))
            .WithMessage("Solo un subalmacén o una fábrica tienen ubicación padre.");
    }
}

/// <summary>Code, type and parent are fixed once created (dominio §4.1).</summary>
/// <param name="SuppliesTypes">RN-111, sub-warehouses only: item types production orders take from it by default; null keeps them.</param>
public sealed record UpdateLocationRequest(uint Version, string Name, string? Address, bool IsActive, IReadOnlyList<ItemType>? SuppliesTypes = null);

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
        new(l.Id, l.Code, l.Name, l.Type, l.ParentLocationId, l.Address, l.IsActive, l.CanPurchase, l.CanProduce, l.CanSupplyBranches,
            l.CanSellToCustomers, l.Version, l.SuppliesTypes.Select(Enum.Parse<ItemType>).ToList());
}

public interface ILocationService
{
    Task<PagedResult<LocationDto>> ListAsync(LocationListQuery query, CancellationToken ct = default);
    Task<LocationDto> GetAsync(Guid id, CancellationToken ct = default);

    /// <summary>All active plants and branches (not limited by scope), plant first, then by code. Sub-warehouses are not listed.</summary>
    Task<IReadOnlyList<LocationLookupDto>> LookupAsync(CancellationToken ct = default);

    /// <summary>Active sub-warehouses of a plant or branch in the caller's scope (B-26).</summary>
    Task<IReadOnlyList<WarehouseDto>> WarehousesAsync(Guid locationId, CancellationToken ct = default);
    Task<LocationDto> CreateAsync(CreateLocationRequest request, CancellationToken ct = default);
    Task<LocationDto> UpdateAsync(Guid id, UpdateLocationRequest request, CancellationToken ct = default);
}

public sealed class LocationService(IAppDbContext db, ILocationScope scope, IUserAccessService userAccess) : ILocationService
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
        if (query.ParentLocationId is { } parentId)
            locations = locations.Where(l => l.ParentLocationId == parentId);
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
            .Where(l => l.IsActive && l.Type != LocationType.Warehouse && l.Type != LocationType.Factory)
            .OrderBy(l => l.Type == LocationType.Plant ? 0 : 1).ThenBy(l => l.Code)
            .Select(l => new LocationLookupDto(l.Id, l.Code, l.Name, l.Type))
            .ToListAsync(ct);

    public async Task<IReadOnlyList<WarehouseDto>> WarehousesAsync(Guid locationId, CancellationToken ct = default)
    {
        await FindAsync(locationId, ct);
        var stock = scope.AllowedStockLocationIds;
        var visible = scope.AllowedLocationIds;
        return await db.Locations.AsNoTracking()
            .Where(l => l.ParentLocationId == locationId && l.IsActive && visible.Contains(l.Id))
            .OrderBy(l => l.Code)
            .Select(l => new WarehouseDto(l.Id, l.Code, l.Name, l.ParentLocationId!.Value, l.IsActive, stock.Contains(l.Id), l.Type))
            .ToListAsync(ct);
    }

    public async Task<LocationDto> CreateAsync(CreateLocationRequest request, CancellationToken ct = default)
    {
        Location location;
        if (request.Type is LocationType.Warehouse or LocationType.Factory)
        {
            var parent = await FindAsync(request.ParentLocationId!.Value, ct);
            // RN-44: the stock of a location with sub-warehouses lives in them; existing stock would be left behind.
            if (await db.StockBalances.AnyAsync(b => b.LocationId == parent.Id && b.Quantity != 0, ct))
                throw new BusinessRuleException("location_has_stock",
                    $"{parent.Code} ya tiene existencia: no se le pueden agregar subalmacenes (RN-44).");
            location = request.Type == LocationType.Factory
                ? Location.Factory(request.Code, request.Name, parent, request.Address)
                : Location.Warehouse(request.Code, request.Name, parent, request.Address);
        }
        else
        {
            location = new Location(request.Code, request.Name, request.Type, request.Address);
        }

        if (await db.Locations.AnyAsync(l => l.Code == location.Code, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["code"] = [$"La ubicación '{location.Code}' ya existe."] });

        db.Locations.Add(location);
        await db.SaveChangesAsync(ct);
        // Users with locations.all, and users of the parent of a new sub-warehouse, must see it right away.
        userAccess.InvalidateAll();
        return location.ToDto();
    }

    public async Task<LocationDto> UpdateAsync(Guid id, UpdateLocationRequest request, CancellationToken ct = default)
    {
        var location = await FindAsync(id, ct);
        db.EnsureVersion(location, request.Version);

        location.Update(request.Name, request.Address);
        if (!request.IsActive && location.IsActive && location.IsWarehouse
            && await db.StockBalances.AnyAsync(b => b.LocationId == id && b.Quantity != 0, ct))
            throw new BusinessRuleException("warehouse_has_stock",
                $"El subalmacén {location.Code} tiene existencia: muévela antes de desactivarlo (RN-44).");
        if (request.IsActive) location.Activate(); else location.Deactivate();

        if (request.SuppliesTypes is { } types)
        {
            location.SetSuppliesTypes(types);
            // RN-111: one default per type within a plant or branch.
            var siblings = await db.Locations.AsNoTracking()
                .Where(l => l.ParentLocationId == location.ParentLocationId && l.Id != id && l.IsActive && l.Type == LocationType.Warehouse)
                .ToListAsync(ct);
            if (siblings.FirstOrDefault(sibling => types.Any(sibling.Supplies)) is { } taken)
                throw new BusinessRuleException("supplies_taken",
                    $"{taken.Code} ya surte por omisión alguno de esos tipos: quítaselo primero (RN-111).");
        }

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
