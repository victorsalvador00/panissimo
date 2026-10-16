using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Dashboard;
using Sgo.Application.Organization;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Organization;

[ApiController]
[Route("settings")]
[Tags("Configuración")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class SettingsController(ISettingsService settings) : ControllerBase
{
    /// <summary>Parámetros del sistema con su tipo y límites: umbral de aprobación de OC, tolerancia de recepción y días de alerta de caducidad.</summary>
    [HttpGet]
    [RequirePermission(Permissions.SettingsManage)]
    public Task<IReadOnlyList<AppSettingDto>> Get(CancellationToken ct) => settings.GetAsync(ct);

    /// <summary>Guarda los parámetros indicados; cada uno valida su versión (409 si otro usuario lo cambió).</summary>
    [HttpPut]
    [RequirePermission(Permissions.SettingsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<IReadOnlyList<AppSettingDto>> Update(UpdateSettingsRequest request, CancellationToken ct) =>
        settings.UpdateAsync(request, ct);
}

[ApiController]
[Route("dashboard")]
[Tags("Tablero")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
public sealed class DashboardController(IDashboardService dashboard) : ControllerBase
{
    /// <summary>
    /// Contadores del tablero para la ubicación indicada, o para todas las de tu alcance si no se indica.
    /// Cada bloque llega en null si no tienes el permiso correspondiente.
    /// </summary>
    [HttpGet]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public Task<DashboardDto> Get([FromQuery] Guid? locationId, CancellationToken ct) => dashboard.GetAsync(locationId, ct);
}
