using System.Linq.Expressions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;
using Panissimo.Domain.Logistics;

namespace Panissimo.Application.Logistics;

public sealed record FleetListQuery : PageQuery
{
    public bool IncludeInactive { get; init; }
}

public sealed record VehicleDto(Guid Id, string Plate, string Description, bool IsActive, uint Version);

public sealed record CreateVehicleRequest(string Plate, string Description);

/// <summary>The plates are fixed once created: dispatches keep them in their text copy.</summary>
public sealed record UpdateVehicleRequest(uint Version, string Description, bool IsActive);

public sealed record DriverDto(Guid Id, string Name, string? Phone, bool IsActive, uint Version);

public sealed record CreateDriverRequest(string Name, string? Phone);

public sealed record UpdateDriverRequest(uint Version, string Name, string? Phone, bool IsActive);

public sealed class CreateVehicleRequestValidator : AbstractValidator<CreateVehicleRequest>
{
    public CreateVehicleRequestValidator()
    {
        RuleFor(x => x.Plate).NotEmpty().MaximumLength(Vehicle.PlateMaxLength + 5).WithName("Placas");
        RuleFor(x => x.Description).NotEmpty().MaximumLength(Vehicle.DescriptionMaxLength).WithName("Descripción");
    }
}

public sealed class UpdateVehicleRequestValidator : AbstractValidator<UpdateVehicleRequest>
{
    public UpdateVehicleRequestValidator() =>
        RuleFor(x => x.Description).NotEmpty().MaximumLength(Vehicle.DescriptionMaxLength).WithName("Descripción");
}

public sealed class CreateDriverRequestValidator : AbstractValidator<CreateDriverRequest>
{
    public CreateDriverRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(Driver.NameMaxLength).WithName("Nombre");
        RuleFor(x => x.Phone).MaximumLength(Driver.PhoneMaxLength).WithName("Teléfono");
    }
}

public sealed class UpdateDriverRequestValidator : AbstractValidator<UpdateDriverRequest>
{
    public UpdateDriverRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(Driver.NameMaxLength).WithName("Nombre");
        RuleFor(x => x.Phone).MaximumLength(Driver.PhoneMaxLength).WithName("Teléfono");
    }
}

/// <summary>RN-113: vehicles and drivers of the fleet (logistics.fleet.manage); dispatches pick active ones.</summary>
public interface IFleetService
{
    Task<PagedResult<VehicleDto>> ListVehiclesAsync(FleetListQuery query, CancellationToken ct = default);
    Task<VehicleDto> CreateVehicleAsync(CreateVehicleRequest request, CancellationToken ct = default);
    Task<VehicleDto> UpdateVehicleAsync(Guid id, UpdateVehicleRequest request, CancellationToken ct = default);
    Task<PagedResult<DriverDto>> ListDriversAsync(FleetListQuery query, CancellationToken ct = default);
    Task<DriverDto> CreateDriverAsync(CreateDriverRequest request, CancellationToken ct = default);
    Task<DriverDto> UpdateDriverAsync(Guid id, UpdateDriverRequest request, CancellationToken ct = default);
}

public sealed class FleetService(IAppDbContext db) : IFleetService
{
    private static readonly Dictionary<string, Expression<Func<Vehicle, object?>>> VehicleSort = new()
    {
        ["plate"] = v => v.Plate,
        ["description"] = v => v.Description,
    };

    private static readonly Dictionary<string, Expression<Func<Driver, object?>>> DriverSort = new()
    {
        ["name"] = d => d.Name,
    };

    public Task<PagedResult<VehicleDto>> ListVehiclesAsync(FleetListQuery query, CancellationToken ct = default)
    {
        var vehicles = db.Vehicles.AsNoTracking();
        if (!query.IncludeInactive)
            vehicles = vehicles.Where(v => v.IsActive);
        if (query.SearchTerm() is { } term)
            vehicles = vehicles.Where(v => v.Plate.ToLower().Contains(term) || v.Description.ToLower().Contains(term));
        return vehicles.ApplySort(query.Sort, VehicleSort, "description").ToPagedResultAsync(query, ToDto, ct);
    }

    public async Task<VehicleDto> CreateVehicleAsync(CreateVehicleRequest request, CancellationToken ct = default)
    {
        var vehicle = new Vehicle(request.Plate, request.Description);
        if (await db.Vehicles.AnyAsync(v => v.Plate == vehicle.Plate, ct))
            throw new RequestValidationException(new Dictionary<string, string[]> { ["plate"] = [$"Las placas '{vehicle.Plate}' ya existen."] });
        db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync(ct);
        return ToDto(vehicle);
    }

    public async Task<VehicleDto> UpdateVehicleAsync(Guid id, UpdateVehicleRequest request, CancellationToken ct = default)
    {
        var vehicle = await db.Vehicles.SingleOrDefaultAsync(v => v.Id == id, ct) ?? throw new NotFoundException("el vehículo", id);
        db.EnsureVersion(vehicle, request.Version);
        vehicle.Update(request.Description);
        if (request.IsActive) vehicle.Activate(); else vehicle.Deactivate();
        await db.SaveChangesAsync(ct);
        return ToDto(vehicle);
    }

    public Task<PagedResult<DriverDto>> ListDriversAsync(FleetListQuery query, CancellationToken ct = default)
    {
        var drivers = db.Drivers.AsNoTracking();
        if (!query.IncludeInactive)
            drivers = drivers.Where(d => d.IsActive);
        if (query.SearchTerm() is { } term)
            drivers = drivers.Where(d => d.Name.ToLower().Contains(term));
        return drivers.ApplySort(query.Sort, DriverSort, "name").ToPagedResultAsync(query, ToDto, ct);
    }

    public async Task<DriverDto> CreateDriverAsync(CreateDriverRequest request, CancellationToken ct = default)
    {
        var driver = new Driver(request.Name, request.Phone);
        db.Drivers.Add(driver);
        await db.SaveChangesAsync(ct);
        return ToDto(driver);
    }

    public async Task<DriverDto> UpdateDriverAsync(Guid id, UpdateDriverRequest request, CancellationToken ct = default)
    {
        var driver = await db.Drivers.SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new NotFoundException("el chofer", id);
        db.EnsureVersion(driver, request.Version);
        driver.Update(request.Name, request.Phone);
        if (request.IsActive) driver.Activate(); else driver.Deactivate();
        await db.SaveChangesAsync(ct);
        return ToDto(driver);
    }

    /// <summary>RN-113: the active vehicle and driver a dispatch takes, with their text copy.</summary>
    public static async Task<(Vehicle Vehicle, Driver Driver)> ForDispatchAsync(IAppDbContext db, Guid vehicleId, Guid driverId, CancellationToken ct)
    {
        var vehicle = await db.Vehicles.AsNoTracking().SingleOrDefaultAsync(v => v.Id == vehicleId, ct);
        var driver = await db.Drivers.AsNoTracking().SingleOrDefaultAsync(d => d.Id == driverId, ct);
        FleetRules.EnsureCanDispatch(vehicle, driver);
        return (vehicle!, driver!);
    }

    private static VehicleDto ToDto(Vehicle v) => new(v.Id, v.Plate, v.Description, v.IsActive, v.Version);

    private static DriverDto ToDto(Driver d) => new(d.Id, d.Name, d.Phone, d.IsActive, d.Version);
}
