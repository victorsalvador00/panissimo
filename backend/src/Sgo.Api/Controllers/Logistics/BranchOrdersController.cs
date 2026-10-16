using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Logistics;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Logistics;

[ApiController]
[Route("branch-orders")]
[Tags("Logística")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class BranchOrdersController(IBranchOrderService orders) : ControllerBase
{
    /// <summary>Pedidos cuya sucursal u origen está a tu alcance. Filtros: status, requestingLocationId, supplyingLocationId, locationId, q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView)]
    public Task<PagedResult<BranchOrderListItemDto>> List([FromQuery] BranchOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    /// <summary>
    /// Sugerido por mín/máx de la sucursal: proyectado = existencia + en tránsito + pedidos pendientes; si es ≤ mínimo,
    /// sugiere máximo − proyectado (unidad base).
    /// </summary>
    [HttpGet("suggestion")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    public Task<IReadOnlyList<BranchOrderSuggestionDto>> Suggestion([FromQuery] Guid locationId, CancellationToken ct) =>
        orders.SuggestAsync(locationId, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LogisticsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<BranchOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea un pedido en borrador de una sucursal a la fábrica o al comisariato. Cantidades en unidad base.</summary>
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
    public Task<BranchOrderDto> Update(Guid id, UpdateBranchOrderRequest request, CancellationToken ct) =>
        orders.UpdateAsync(id, request, ct);

    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Submit(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.SubmitAsync(id, request.Version, ct);

    /// <summary>Cancela un pedido en borrador o enviado. Uno aprobado se cancela cancelando su traspaso en borrador.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.LogisticsOrdersCreate)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.CancelAsync(id, request.Version, ct);

    /// <summary>
    /// El origen aprueba con la cantidad de cada línea (0 a lo solicitado) y se crea el traspaso en borrador con lo aprobado (RN-20).
    /// </summary>
    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.LogisticsOrdersApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Approve(Guid id, ApproveBranchOrderRequest request, CancellationToken ct) =>
        orders.ApproveAsync(id, request, ct);

    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.LogisticsOrdersApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<BranchOrderDto> Reject(Guid id, RejectBranchOrderRequest request, CancellationToken ct) =>
        orders.RejectAsync(id, request, ct);
}
