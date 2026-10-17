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
public sealed class ProductionOrdersController(IProductionOrderService orders, IProductionCloseService closes) : ControllerBase
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

    /// <summary>
    /// Vista previa de un cierre de qty: teórico por componente (RN-11), existencia utilizable, costo estimado y el lote que
    /// se crearía (RN-62).
    /// </summary>
    [HttpGet("{id:guid}/close-preview")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ClosePreviewDto> ClosePreview(Guid id, [FromQuery] decimal qty, CancellationToken ct) =>
        closes.PreviewAsync(id, qty, ct);

    /// <summary>Cierres de la orden, del primero al último.</summary>
    [HttpGet("{id:guid}/closes")]
    [RequirePermission(Permissions.ProductionView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<ProductionCloseListItemDto>> Closes(Guid id, CancellationToken ct) => closes.ListByOrderAsync(id, ct);

    /// <summary>
    /// Registra un cierre parcial o final (RN-61..RN-66): consumo real (FEFO o lotes elegidos), lote propio del cierre,
    /// entrada del producto al costo del cierre. 409 por faltantes (sin movimientos parciales) o por otro cierre simultáneo;
    /// 422 por tolerancia o motivo de faltante.
    /// </summary>
    [HttpPost("{id:guid}/closes")]
    [RequirePermission(Permissions.ProductionOrdersClose)]
    [ProducesResponseType<ProductionCloseResultDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<ProductionCloseResultDto>> CreateClose(Guid id, CreateProductionCloseRequest request, CancellationToken ct)
    {
        var result = await closes.CreateAsync(id, request, ct);
        return CreatedAtAction(nameof(ProductionClosesController.Get), "ProductionCloses", new { id = result.Close.Id }, result);
    }
}

[ApiController]
[Route("production-closes")]
[Tags("Cierres de producción")]
[RequirePermission(Permissions.ProductionView)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ProductionClosesController(IProductionCloseService closes) : ControllerBase
{
    /// <summary>Cierres de la Planta. Filtros: locationId, from, to (fecha de negocio), areaId, itemId, productionOrderId, kind, q.</summary>
    [HttpGet]
    public Task<PagedResult<ProductionCloseListItemDto>> List([FromQuery] ProductionCloseListQuery query, CancellationToken ct) =>
        closes.ListAsync(query, ct);

    /// <summary>Detalle con consumos, lotes consumidos, merma por componente y lote producido.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ProductionCloseDto> Get(Guid id, CancellationToken ct) => closes.GetAsync(id, ct);
}
