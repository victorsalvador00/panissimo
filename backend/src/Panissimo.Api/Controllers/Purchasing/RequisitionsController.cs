using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Purchasing;

/// <summary>Requisiciones de compra de la Planta (RN-34) y su conversión a órdenes de compra.</summary>
[ApiController]
[Route("requisitions")]
[Tags("Requisiciones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class RequisitionsController(IRequisitionService requisitions, IMaterialRequirementService requirements) : ControllerBase
{
    /// <summary>Requisiciones de las ubicaciones a tu alcance. Filtros: status, locationId, from y to (fecha requerida), q (folio).</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<RequisitionListItemDto>> List([FromQuery] RequisitionListQuery query, CancellationToken ct) =>
        requisitions.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<RequisitionDto> Get(Guid id, CancellationToken ct) => requisitions.GetAsync(id, ct);

    /// <summary>Crea una requisición en borrador. Una línea sin proveedor toma el preferido del artículo.</summary>
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

    /// <summary>Envía a aprobación. Exige proveedor en todas las líneas.</summary>
    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Submit(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.SubmitAsync(id, request.Version, ct);

    /// <summary>Cancela una requisición en borrador, enviada o aprobada.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.CancelAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Approve(Guid id, VersionRequest request, CancellationToken ct) =>
        requisitions.ApproveAsync(id, request.Version, ct);

    /// <summary>Rechaza una requisición enviada. El motivo es obligatorio.</summary>
    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<RequisitionDto> Reject(Guid id, RejectRequisitionRequest request, CancellationToken ct) =>
        requisitions.RejectAsync(id, request, ct);

    /// <summary>
    /// Crea la requisición sugerida del requerimiento de materia prima (RN-50): una requisición normal en borrador con lo
    /// "por comprar" en unidades de compra completas y el proveedor preferido. Opcional: solo algunos artículos.
    /// </summary>
    [HttpPost("suggested")]
    [RequirePermission(Permissions.PurchasingRequisitionsManage)]
    [ProducesResponseType<RequisitionDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<RequisitionDto>> CreateSuggested(CreateSuggestedRequisitionRequest request, CancellationToken ct)
    {
        var requisition = await requirements.CreateSuggestedRequisitionAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = requisition.Id }, requisition);
    }

    /// <summary>
    /// Convierte requisiciones aprobadas en OC en borrador, agrupadas por proveedor y ubicación de entrega, con el precio
    /// del catálogo y el IVA del artículo. Todo o nada.
    /// </summary>
    [HttpPost("convert")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<ConvertRequisitionsResult> Convert(ConvertRequisitionsRequest request, CancellationToken ct) =>
        requisitions.ConvertAsync(request, ct);
}
