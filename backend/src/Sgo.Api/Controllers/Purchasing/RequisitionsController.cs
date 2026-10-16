using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Purchasing;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Purchasing;

[ApiController]
[Route("requisitions")]
[Tags("Compras")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class RequisitionsController(IRequisitionService requisitions) : ControllerBase
{
    /// <summary>Requisiciones de ubicaciones a tu alcance. Filtros: status, locationId, q (folio).</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<RequisitionListItemDto>> List([FromQuery] RequisitionListQuery query, CancellationToken ct) =>
        requisitions.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RequisitionDto> Get(Guid id, CancellationToken ct) => requisitions.GetAsync(id, ct);

    /// <summary>
    /// Crea una requisición en borrador (solo fábrica o comisariato). Cantidades en unidad de compra.
    /// Una línea sin proveedor toma el preferido del artículo.
    /// </summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<RequisitionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<RequisitionDto>> Create(CreateRequisitionRequest request, CancellationToken ct)
    {
        var requisition = await requisitions.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = requisition.Id }, requisition);
    }

    /// <summary>Edita fecha requerida, notas y líneas de una requisición en borrador.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Update(Guid id, UpdateRequisitionRequest request, CancellationToken ct) =>
        requisitions.UpdateAsync(id, request, ct);

    /// <summary>Envía a aprobación. Todas las líneas deben tener proveedor sugerido.</summary>
    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Submit(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.SubmitAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Approve(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.ApproveAsync(id, request.Version, ct);

    /// <summary>Rechaza una requisición enviada, con motivo.</summary>
    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Reject(Guid id, RejectRequisitionRequest request, CancellationToken ct) =>
        requisitions.RejectAsync(id, request, ct);

    /// <summary>Cancela una requisición en borrador, enviada o aprobada (no convertida).</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.CancelAsync(id, request.Version, ct);

    /// <summary>
    /// Convierte requisiciones aprobadas en OC en borrador, una por proveedor sugerido y ubicación de entrega (RN-34).
    /// Precio sugerido del catálogo del proveedor (RN-30). Todo o nada.
    /// </summary>
    [HttpPost("convert")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<IReadOnlyList<PurchaseOrderListItemDto>> Convert(ConvertRequisitionsRequest request, CancellationToken ct) =>
        requisitions.ConvertAsync(request, ct);
}
