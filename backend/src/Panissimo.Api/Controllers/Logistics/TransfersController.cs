using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Logistics;

[ApiController]
[Route("transfers")]
[Tags("Traspasos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class TransfersController(ITransferService transfers) : ControllerBase
{
    /// <summary>
    /// Traspasos cuyo origen o destino está a tu alcance. Filtros: tab (ToDispatch, InTransit, Received, All), status,
    /// received, fromLocationId, toLocationId, locationId, from, to, q.
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.LogisticsView)]
    public Task<PagedResult<TransferListItemDto>> List([FromQuery] TransferListQuery query, CancellationToken ct) =>
        transfers.ListAsync(query with { Kind = TransferKind.Standard }, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.LogisticsView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<TransferDto> Get(Guid id, CancellationToken ct) => transfers.GetAsync(id, ct: ct);

    /// <summary>Crea un traspaso en borrador. Fuera de Planta → sucursal requiere logistics.transfers.special (RN-25).</summary>
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
        transfers.UpdateAsync(id, request, ct: ct);

    /// <summary>Despacha (RN-21): registra la salida en el origen (lote planeado, lotes elegidos o FEFO) y deja el traspaso en tránsito.</summary>
    [HttpPost("{id:guid}/dispatch")]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Dispatch(Guid id, DispatchTransferRequest request, CancellationToken ct) =>
        transfers.DispatchAsync(id, request, ct: ct);

    /// <summary>
    /// Recibe en el destino (RN-22). Por línea se puede rechazar lo que llegó (RN-116): regresa al subalmacén del que salió
    /// (mismo lote y costo) o es merma. Lo que no llegó (enviado − recibido − rechazado) exige motivo; con faltante o
    /// rechazo el traspaso queda con discrepancias.
    /// </summary>
    [HttpPost("{id:guid}/receive")]
    [RequirePermission(Permissions.LogisticsTransfersReceive)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Receive(Guid id, ReceiveTransferRequest request, CancellationToken ct) =>
        transfers.ReceiveAsync(id, request, ct: ct);

    /// <summary>Cancela un traspaso en borrador. Uno despachado no puede cancelarse (RN-23).</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.LogisticsTransfersDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        transfers.CancelAsync(id, request.Version, ct: ct);
}
