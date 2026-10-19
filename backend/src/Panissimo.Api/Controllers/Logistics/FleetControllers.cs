using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Logistics;

[ApiController]
[Route("vehicles")]
[Tags("Vehículos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class VehiclesController(IFleetService fleet) : ControllerBase
{
    /// <summary>Vehículos de la flotilla (RN-113). Quien despacha traspasos o remisiones elige de los activos.</summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView, Permissions.SalesView)]
    public Task<PagedResult<VehicleDto>> List([FromQuery] FleetListQuery query, CancellationToken ct) => fleet.ListVehiclesAsync(query, ct);

    /// <summary>Da de alta un vehículo. Las placas son únicas y se guardan en mayúsculas, sin espacios.</summary>
    [HttpPost]
    [RequirePermission(Permissions.LogisticsFleetManage)]
    [ProducesResponseType<VehicleDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<VehicleDto>> Create(CreateVehicleRequest request, CancellationToken ct)
    {
        var vehicle = await fleet.CreateVehicleAsync(request, ct);
        return Created($"vehicles/{vehicle.Id}", vehicle);
    }

    /// <summary>Edita la descripción y el estado. Las placas no cambian.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.LogisticsFleetManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<VehicleDto> Update(Guid id, UpdateVehicleRequest request, CancellationToken ct) => fleet.UpdateVehicleAsync(id, request, ct);
}

[ApiController]
[Route("drivers")]
[Tags("Choferes")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class DriversController(IFleetService fleet) : ControllerBase
{
    /// <summary>Choferes de la flotilla (RN-113). Quien despacha traspasos o remisiones elige de los activos.</summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView, Permissions.SalesView)]
    public Task<PagedResult<DriverDto>> List([FromQuery] FleetListQuery query, CancellationToken ct) => fleet.ListDriversAsync(query, ct);

    /// <summary>Da de alta un chofer; el teléfono es opcional.</summary>
    [HttpPost]
    [RequirePermission(Permissions.LogisticsFleetManage)]
    [ProducesResponseType<DriverDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DriverDto>> Create(CreateDriverRequest request, CancellationToken ct)
    {
        var driver = await fleet.CreateDriverAsync(request, ct);
        return Created($"drivers/{driver.Id}", driver);
    }

    /// <summary>Edita nombre, teléfono y estado.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.LogisticsFleetManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<DriverDto> Update(Guid id, UpdateDriverRequest request, CancellationToken ct) => fleet.UpdateDriverAsync(id, request, ct);
}
