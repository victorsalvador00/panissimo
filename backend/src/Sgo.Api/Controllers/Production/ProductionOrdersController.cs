using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Production;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Production;

[ApiController]
[Route("production-orders")]
[Tags("Producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionOrdersController(IProductionOrderService orders) : ControllerBase
{
    /// <summary>Órdenes de producción de tus ubicaciones. Filtros: locationId, status, outputItemId, from, to (fecha programada), q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    public Task<PagedResult<ProductionOrderListItemDto>> List([FromQuery] ProductionOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ProductionOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea la orden en borrador con la receta activa del producto (queda fija esa versión). Solo fábrica o comisariato.</summary>
    [HttpPost]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProductionOrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<ProductionOrderDto>> Create(CreateProductionOrderRequest request, CancellationToken ct)
    {
        var order = await orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }

    /// <summary>Edita cantidad planeada, fecha y notas de una orden en borrador (recalcula el consumo teórico).</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Update(Guid id, UpdateProductionOrderRequest request, CancellationToken ct) =>
        orders.UpdateAsync(id, request, ct);

    [HttpPost("{id:guid}/release")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Release(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.ReleaseAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.CancelAsync(id, request.Version, ct);

    /// <summary>
    /// Completa la orden en una sola transacción (RN-12): consume componentes por el consumo real (FEFO o lotes elegidos),
    /// da entrada al producto con lote = folio y caducidad = hoy + vida útil, y calcula su costo unitario.
    /// </summary>
    [HttpPost("{id:guid}/complete")]
    [RequirePermission(Permissions.ProductionOrdersComplete)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Complete(Guid id, CompleteProductionOrderRequest request, CancellationToken ct) =>
        orders.CompleteAsync(id, request, ct);
}
