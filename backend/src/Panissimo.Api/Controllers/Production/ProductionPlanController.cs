using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Production;

/// <summary>Plan de producción de la Planta (RN-70, RN-71).</summary>
[ApiController]
[Route("production-plan")]
[Tags("Plan de producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionPlanController(IProductionPlanService plan) : ControllerBase
{
    /// <summary>
    /// Demanda neta por producto y día: pedidos de sucursal, pedidos de cliente, reposición a stock (mín/máx) y, para
    /// semiterminados, OP padre; contra existencia utilizable y OP abiertas. Es una consulta: no guarda ni reserva nada.
    /// Rango por omisión: hoy + production.plan_default_days. Filtros: areaId, q (SKU o nombre).
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionPlanDto> Get([FromQuery] ProductionPlanQuery query, CancellationToken ct) => plan.GetAsync(query, ct);

    /// <summary>
    /// Genera una OP en borrador por producto, fecha, área y turno (origen Plan), ligada a las líneas de pedido que atiende,
    /// repartida por fecha requerida. Todo o nada; un producto sin receta activa lo bloquea.
    /// </summary>
    [HttpPost("generate")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<GenerateProductionPlanResult> Generate(GenerateProductionPlanRequest request, CancellationToken ct) =>
        plan.GenerateAsync(request, ct);
}
