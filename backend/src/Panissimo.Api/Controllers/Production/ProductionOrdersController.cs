using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Production;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Production;

[ApiController]
[Route("production-orders")]
[Tags("Órdenes de producción")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionOrdersController(IProductionOrderService orders) : ControllerBase
{
    /// <summary>
    /// Órdenes con avance (producido, % y número de cierres). Filtros: tab (ToProduce, InProgress, Drafts, All), status,
    /// locationId, from, to (fecha programada), areaId, shift, source, importId, outputItemId, q (folio, SKU o nombre).
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.ProductionView)]
    public Task<PagedResult<ProductionOrderListItemDto>> List([FromQuery] ProductionOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ProductionOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea una orden en borrador (RN-73, origen Manual) con la receta activa del producto; área por omisión la del artículo.</summary>
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

    /// <summary>Edita una orden en borrador (RN-60). Cambiar de producto toma su receta activa.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Update(Guid id, UpdateProductionOrderRequest request, CancellationToken ct) =>
        orders.UpdateAsync(id, request, ct);

    /// <summary>Libera la orden para producir.</summary>
    [HttpPost("{id:guid}/release")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Release(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.ReleaseAsync(id, request.Version, ct);

    /// <summary>Cancela una orden en borrador o liberada sin cierres. En proceso no se cancela: se termina con el cierre final.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.ProductionOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ProductionOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.CancelAsync(id, request.Version, ct);
}
