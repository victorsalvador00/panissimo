using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Organization;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Organization;

[ApiController]
[Route("locations")]
[Tags("Ubicaciones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class LocationsController(ILocationService locations) : ControllerBase
{
    /// <summary>Ubicaciones a las que tienes acceso. Activas por defecto; includeInactive=true para ver todas.</summary>
    [HttpGet]
    [RequirePermission(Permissions.LocationsView)]
    public Task<PagedResult<LocationDto>> List([FromQuery] LocationListQuery query, CancellationToken ct) =>
        locations.ListAsync(query, ct);

    /// <summary>
    /// Ubicaciones activas (todas, no solo las tuyas) para elegir el destino de un traspaso. No exige locations.view:
    /// basta logistics.view.
    /// </summary>
    [HttpGet("lookup")]
    [RequireAnyPermission(Permissions.LocationsView, Permissions.LogisticsView)]
    public Task<IReadOnlyList<LocationLookupDto>> Lookup(CancellationToken ct) => locations.LookupAsync(ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LocationsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<LocationDto> Get(Guid id, CancellationToken ct) => locations.GetAsync(id, ct);

    /// <summary>Da de alta una ubicación (sucursal, fábrica o comisariato).</summary>
    [HttpPost]
    [RequirePermission(Permissions.LocationsManage)]
    [ProducesResponseType<LocationDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<LocationDto>> Create(CreateLocationRequest request, CancellationToken ct)
    {
        var location = await locations.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = location.Id }, location);
    }

    /// <summary>Edita nombre, dirección y estado. El código y el tipo no cambian.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.LocationsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<LocationDto> Update(Guid id, UpdateLocationRequest request, CancellationToken ct) =>
        locations.UpdateAsync(id, request, ct);
}
