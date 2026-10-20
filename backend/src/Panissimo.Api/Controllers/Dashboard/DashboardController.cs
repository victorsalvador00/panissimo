using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Dashboard;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Dashboard;

/// <summary>Tablero de la ubicación activa (backend §8.2).</summary>
[ApiController]
[Route("dashboard")]
[Tags("Tablero")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class DashboardController(IDashboardService dashboard) : ControllerBase
{
    /// <summary>
    /// Bloques del tablero de una ubicación o, sin locationId, de todas las del alcance. Basta la sesión: cada bloque llega
    /// en null cuando falta su permiso (bajo mínimo y lotes por caducar con inventory.view; traspasos con logistics.view;
    /// pedidos por aprobar con logistics.orders.approve; pedidos en curso con logistics.orders.create; OC por aprobar con
    /// purchasing.po.approve; producción de hoy, OP en proceso y recetas con alza de insumos con production.view; pedidos de
    /// cliente por surtir con sales.view; remisiones por despachar con sales.shipments.dispatch; bajo mínimo por ubicación
    /// solo con locations.all). Cada lista trae el conteo y los primeros 5.
    /// </summary>
    [HttpGet]
    public Task<DashboardDto> Get([FromQuery] Guid? locationId, CancellationToken ct) => dashboard.GetAsync(locationId, ct);
}

/// <summary>Pendientes del usuario para los globos del menú (RN-118).</summary>
[ApiController]
[Route("my-tasks")]
[Tags("Tablero")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class PendingTasksController(IPendingTasksService tasks) : ControllerBase
{
    /// <summary>
    /// Cuántos documentos esperan al usuario, contados como la pestaña de su lista: OC por aprobar
    /// (purchasing.po.approve) y por recibir (purchasing.receive); OP por producir y en proceso (production.orders.close);
    /// vales internos por enviar y en tránsito (inventory.internal_transfers), estos de locationId y sus subalmacenes;
    /// renglones del plan de producción por programar (production.orders.manage). Cada conteo llega en null sin su permiso.
    /// Las órdenes y el plan cubren todo el alcance del usuario.
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingPoApprove, Permissions.PurchasingReceive, Permissions.ProductionOrdersClose,
        Permissions.InventoryInternalTransfers, Permissions.ProductionOrdersManage)]
    [ProducesResponseType<PendingTasksDto>(StatusCodes.Status200OK)]
    public Task<PendingTasksDto> Get([FromQuery] Guid? locationId, CancellationToken ct) => tasks.GetAsync(locationId, ct);
}
