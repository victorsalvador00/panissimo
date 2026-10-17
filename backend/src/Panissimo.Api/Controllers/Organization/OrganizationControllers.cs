using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Organization;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Organization;

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

    /// <summary>Ubicaciones activas (todas, no solo las tuyas) para selectores: destino de traspasos, pedidos y ventas.</summary>
    [HttpGet("lookup")]
    [RequirePermission(Permissions.LocationsView, Permissions.LogisticsView, Permissions.SalesView)]
    public Task<IReadOnlyList<LocationLookupDto>> Lookup(CancellationToken ct) => locations.LookupAsync(ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LocationsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<LocationDto> Get(Guid id, CancellationToken ct) => locations.GetAsync(id, ct);

    /// <summary>Da de alta una ubicación (sucursal o planta).</summary>
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

[ApiController]
[Route("settings")]
[Tags("Configuración")]
[RequirePermission(Permissions.SettingsManage)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class SettingsController(ISettingsService settings) : ControllerBase
{
    /// <summary>Parámetros del sistema con su tipo, límites, valor y versión.</summary>
    [HttpGet]
    public Task<IReadOnlyList<AppSettingDto>> Get(CancellationToken ct) => settings.GetAsync(ct);

    /// <summary>Guarda los parámetros indicados; cada uno valida su versión (409 si otro usuario lo cambió).</summary>
    [HttpPut]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<IReadOnlyList<AppSettingDto>> Update(UpdateSettingsRequest request, CancellationToken ct) =>
        settings.UpdateAsync(request, ct);
}
