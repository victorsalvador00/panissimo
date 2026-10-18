using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Production;

/// <summary>Reportes de producción.</summary>
[ApiController]
[Route("reports")]
[Tags("Reportes de producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionReportsController(IProductionSummaryService summary) : ControllerBase
{
    /// <summary>
    /// Resumen de producción (RN-53) por área, producto o día en un rango (máx. 366 días): planeado (OP del rango no
    /// canceladas), producido (cierres del rango), % de cumplimiento, costo producido y merma en pesos (RN-13). Un renglón
    /// por unidad: nunca suma kg con piezas.
    /// </summary>
    [HttpGet("production-summary")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<ProductionSummaryDto> ProductionSummary([FromQuery] ProductionSummaryQuery query, CancellationToken ct) =>
        summary.GetAsync(query, ct);
}
