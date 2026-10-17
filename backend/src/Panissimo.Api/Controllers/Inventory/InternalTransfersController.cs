using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Logistics;
using Panissimo.Domain.Logistics;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Inventory;

/// <summary>
/// Vales internos entre subalmacenes de una misma planta o sucursal (RN-47): se envían (en tránsito) y se reciben,
/// como un traspaso. Enviar exige el subalmacén origen y recibir el destino.
/// </summary>
[ApiController]
[Route("internal-transfers")]
[Tags("Vales internos")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class InternalTransfersController(ITransferService transfers) : ControllerBase
{
    /// <summary>Vales cuyo origen o destino está a tu alcance. Filtros: tab (ToDispatch, InTransit, Received, All), status, locationId, from, to, q.</summary>
    [HttpGet]
    [RequirePermission(Permissions.InventoryView)]
    public Task<PagedResult<TransferListItemDto>> List([FromQuery] TransferListQuery query, CancellationToken ct) =>
        transfers.ListAsync(query with { Kind = TransferKind.Internal }, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<TransferDto> Get(Guid id, CancellationToken ct) => transfers.GetAsync(id, TransferKind.Internal, ct);

    /// <summary>Crea un vale en borrador entre dos subalmacenes de la misma planta o sucursal.</summary>
    [HttpPost]
    [RequirePermission(Permissions.InventoryInternalTransfers)]
    [ProducesResponseType<TransferDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<TransferDto>> Create(CreateInternalTransferRequest request, CancellationToken ct)
    {
        var transfer = await transfers.CreateInternalAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = transfer.Id }, transfer);
    }

    /// <summary>Edita destino (otro subalmacén de la misma ubicación), notas y líneas de un vale en borrador.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.InventoryInternalTransfers)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Update(Guid id, UpdateTransferRequest request, CancellationToken ct) =>
        transfers.UpdateAsync(id, request, TransferKind.Internal, ct);

    /// <summary>Envía el vale: registra la salida del subalmacén origen (lotes elegidos o FEFO) y queda en tránsito.</summary>
    [HttpPost("{id:guid}/dispatch")]
    [RequirePermission(Permissions.InventoryInternalTransfers)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Dispatch(Guid id, DispatchInternalTransferRequest request, CancellationToken ct) =>
        transfers.DispatchAsync(id, new DispatchTransferRequest(request.Version, "", "", request.Lines), TransferKind.Internal, ct);

    /// <summary>Recibe el vale en el subalmacén destino; si llega menos, indica el motivo de la diferencia.</summary>
    [HttpPost("{id:guid}/receive")]
    [RequirePermission(Permissions.InventoryInternalTransfers)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Receive(Guid id, ReceiveTransferRequest request, CancellationToken ct) =>
        transfers.ReceiveAsync(id, request, TransferKind.Internal, ct);

    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.InventoryInternalTransfers)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<TransferDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        transfers.CancelAsync(id, request.Version, TransferKind.Internal, ct);
}
