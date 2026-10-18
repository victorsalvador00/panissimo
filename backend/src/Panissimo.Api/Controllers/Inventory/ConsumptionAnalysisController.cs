using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Inventory;

/// <summary>Análisis de consumo y mín/máx sugerido (RN-52).</summary>
[ApiController]
[Route("consumption-analysis")]
[Tags("Análisis de consumo")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ConsumptionAnalysisController(IConsumptionAnalysisService analysis) : ControllerBase
{
    /// <summary>
    /// Salidas de la ubicación y sus subalmacenes (consumo, consumo de producción, traspaso y remisión; sin vales internos) en
    /// semanas completas hasta ayer (8 por omisión, máx. 26): total, promedio diario, patrón por día de la semana, tendencia
    /// (últimas 4 semanas contra las 4 anteriores), mín/máx actual y sugerido (promedio × inventory.min_cover_days /
    /// max_cover_days, hacia arriba). Aplicar el sugerido usa PUT /items/{id}/location-settings.
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public Task<ConsumptionAnalysisDto> Get([FromQuery] ConsumptionAnalysisQuery query, CancellationToken ct) => analysis.GetAsync(query, ct);
}
