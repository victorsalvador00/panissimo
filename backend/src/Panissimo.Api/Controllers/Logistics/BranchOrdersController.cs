using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Logistics;

/// <summary>Pedidos de sucursal a la Planta (RN-20, RN-24).</summary>
[ApiController]
[Route("branch-orders")]
[Tags("Pedidos de sucursal")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class BranchOrdersController(IBranchOrderService orders) : ControllerBase
{
    /// <summary>
    /// Pedidos cuya sucursal o Planta está a tu alcance. Filtros: tab (All, ToApprove), status, locationId (sucursal),
    /// from y to (fecha requerida), q (folio).
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView)]
    public Task<PagedResult<BranchOrderListItemDto>> List([FromQuery] BranchOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    /// <summary>Artículos en o bajo su mínimo en la sucursal, con la cantidad para llegar al máximo (RN-20).</summary>
    [HttpGet("suggestion")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<IReadOnlyList<BranchOrderSuggestionDto>> Suggestion([FromQuery] Guid locationId, CancellationToken ct) =>
        orders.SuggestAsync(locationId, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LogisticsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<BranchOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea un pedido en borrador de una sucursal a la Planta: productos a granel e insumos, en unidad base.</summary>
    [HttpPost]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<BranchOrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<BranchOrderDto>> Create(CreateBranchOrderRequest request, CancellationToken ct)
    {
        var order = await orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Update(Guid id, UpdateBranchOrderRequest request, CancellationToken ct) => orders.UpdateAsync(id, request, ct);

    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Submit(Guid id, VersionRequest request, CancellationToken ct) => orders.SubmitAsync(id, request.Version, ct);

    /// <summary>Cancela un pedido en borrador o enviado. Uno aprobado se cancela cancelando su traspaso.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) => orders.CancelAsync(id, request.Version, ct);

    /// <summary>
    /// Aprueba con la cantidad de cada línea (0 a lo solicitado; no todo en 0) y crea un traspaso en borrador con lo
    /// aprobado. No reserva existencia.
    /// </summary>
    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.LogisticsOrdersApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Approve(Guid id, ApproveBranchOrderRequest request, CancellationToken ct) => orders.ApproveAsync(id, request, ct);

    /// <summary>Rechaza un pedido enviado. El motivo es obligatorio.</summary>
    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.LogisticsOrdersApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Reject(Guid id, RejectBranchOrderRequest request, CancellationToken ct) => orders.RejectAsync(id, request, ct);
}
