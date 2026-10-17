using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Purchasing;

/// <summary>Requerimiento de materia prima de la Planta (RN-50).</summary>
[ApiController]
[Route("material-requirements")]
[Tags("Requerimiento de materia prima")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class MaterialRequirementsController(IMaterialRequirementService requirements) : ControllerBase
{
    /// <summary>
    /// Por componente de las OP abiertas hasta la fecha elegida (hoy + 7 por omisión): requerido, mínimo, existencia utilizable
    /// (sin vencidos, con subalmacenes), en camino (OC no finales y requisiciones abiertas) y faltante; por comprar (en
    /// unidades de compra completas), por producir (semiterminados) o cubierto. Es una consulta: no guarda ni reserva nada.
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView, Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<MaterialRequirementDto> Get([FromQuery] MaterialRequirementQuery query, CancellationToken ct) => requirements.GetAsync(query, ct);
}
