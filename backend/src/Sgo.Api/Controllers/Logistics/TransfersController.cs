using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Logistics;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Logistics;

[ApiController]
[Route("transfers")]
[Tags("Logística")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class TransfersController(ITransferService transfers) : ControllerBase
{
    /// <summary>Traspasos cuyo origen o destino está a tu alcance. Filtros: status, received (recibidos con o sin diferencias), fromLocationId, toLocationId, locationId, from, to, q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView)]
    public Task<PagedResult<TransferListItemDto>> List([FromQuery] TransferListQuery query, CancellationToken ct) =>
        transfers.ListAsync(query, ct);

    /// <summary>Traspasos despachados pendientes de recibir (en tránsito).</summary>
    [HttpGet("in-transit")]
    [RequirePermission(Permissions.LogisticsView)]
    public Task<IReadOnlyList<TransferListItemDto>> InTransit([FromQuery] Guid? locationId, CancellationToken ct) =>
        transfers.InTransitAsync(locationId, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LogisticsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<TransferDto> Get(Guid id, CancellationToken ct) => transfers.GetAsync(id, ct);

    /// <summary>Crea un traspaso en borrador. Rutas distintas de fábrica/comisariato → sucursal requieren logistics.transfers.special.</summary>
    [HttpPost]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<TransferDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<TransferDto>> Create(CreateTransferRequest request, CancellationToken ct)
    {
        var transfer = await transfers.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = transfer.Id }, transfer);
    }

    /// <summary>Edita destino, notas y líneas de un traspaso en borrador.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Update(Guid id, UpdateTransferRequest request, CancellationToken ct) =>
        transfers.UpdateAsync(id, request, ct);

    /// <summary>Despacha: registra la salida en el origen (FEFO o lotes elegidos) y deja el traspaso en tránsito.</summary>
    [HttpPost("{id:guid}/dispatch")]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Dispatch(Guid id, DispatchTransferRequest request, CancellationToken ct) =>
        transfers.DispatchAsync(id, request, ct);

    /// <summary>Recibe en el destino. Recibir menos de lo enviado exige motivo y deja el traspaso con discrepancias.</summary>
    [HttpPost("{id:guid}/receive")]
    [RequirePermission(Permissions.LogisticsTransfersReceive)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Receive(Guid id, ReceiveTransferRequest request, CancellationToken ct) =>
        transfers.ReceiveAsync(id, request, ct);

    /// <summary>Cancela un traspaso en borrador. Uno despachado no puede cancelarse (RN-23).</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        transfers.CancelAsync(id, request.Version, ct);
}
