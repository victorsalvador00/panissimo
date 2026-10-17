using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Purchasing;

/// <summary>Órdenes de compra (RN-30..RN-32). Se entregan solo en la Planta.</summary>
[ApiController]
[Route("purchase-orders")]
[Tags("Órdenes de compra")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class PurchaseOrdersController(IPurchaseOrderService orders) : ControllerBase
{
    /// <summary>
    /// OC de las ubicaciones a tu alcance. Filtros: tab (All, ToApprove, ToReceive), status, pendingReceipt, supplierId,
    /// locationId, from y to (fecha esperada), q (folio o proveedor).
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<PurchaseOrderListItemDto>> List([FromQuery] PurchaseOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<PurchaseOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea una OC en borrador con artículos del catálogo activo del proveedor; el precio se sugiere del catálogo.</summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<PurchaseOrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<PurchaseOrderDto>> Create(CreatePurchaseOrderRequest request, CancellationToken ct)
    {
        var order = await orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }

    /// <summary>Edita entrega, fecha esperada, notas y líneas de una OC en borrador. El proveedor no cambia.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Update(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct) =>
        orders.UpdateAsync(id, request, ct);

    /// <summary>Envía la OC: con subtotal igual o mayor al umbral queda por aprobar; si no, se aprueba sola (RN-31).</summary>
    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Submit(Guid id, VersionRequest request, CancellationToken ct) => orders.SubmitAsync(id, request.Version, ct);

    /// <summary>Cancela una OC en borrador, por aprobar o aprobada sin recepciones.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) => orders.CancelAsync(id, request.Version, ct);

    /// <summary>Cierra con saldo una OC parcialmente recibida.</summary>
    [HttpPost("{id:guid}/close")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Close(Guid id, VersionRequest request, CancellationToken ct) => orders.CloseAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Approve(Guid id, VersionRequest request, CancellationToken ct) => orders.ApproveAsync(id, request.Version, ct);

    /// <summary>Rechaza una OC por aprobar. El motivo es obligatorio y el rechazo es final.</summary>
    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Reject(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct) => orders.RejectAsync(id, request, ct);
}

/// <summary>Recepciones de compra en la Planta (RN-32, RN-33): mueven inventario.</summary>
[ApiController]
[Route("goods-receipts")]
[Tags("Recepciones de compra")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class GoodsReceiptsController(IGoodsReceiptService receipts) : ControllerBase
{
    /// <summary>Historial. Filtros: purchaseOrderId, supplierId, locationId, from, to, q (folio o factura).</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<GoodsReceiptListItemDto>> List([FromQuery] GoodsReceiptListQuery query, CancellationToken ct) =>
        receipts.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<GoodsReceiptDto> Get(Guid id, CancellationToken ct) => receipts.GetAsync(id, ct);

    /// <summary>
    /// Registra una recepción parcial o total. Una línea puede venir en varios lotes; la sobre-recepción se permite hasta
    /// la tolerancia. Registra la entrada al costo UnitPrice / factor (sin IVA). Una recepción simultánea de la misma OC
    /// responde 409.
    /// </summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingReceive)]
    [ProducesResponseType<GoodsReceiptDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<GoodsReceiptDto>> Create(CreateGoodsReceiptRequest request, CancellationToken ct)
    {
        var receipt = await receipts.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = receipt.Id }, receipt);
    }
}
