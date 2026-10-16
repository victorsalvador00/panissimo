using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Application.Purchasing;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Purchasing;

[ApiController]
[Route("purchase-orders")]
[Tags("Compras")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class PurchaseOrdersController(IPurchaseOrderService orders) : ControllerBase
{
    /// <summary>
    /// OC con entrega en ubicaciones a tu alcance. Filtros: status, supplierId, locationId, q (folio o proveedor) y
    /// pendingReceipt=true (aprobadas o parcialmente recibidas: las que se pueden recibir).
    /// </summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<PurchaseOrderListItemDto>> List([FromQuery] PurchaseOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<PurchaseOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>
    /// Crea una OC en borrador con entrega en fábrica o comisariato. Solo artículos del catálogo activo del proveedor;
    /// precio vacío = precio del catálogo (RN-30). Cantidades y precios en unidad de compra, sin IVA.
    /// </summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<PurchaseOrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<PurchaseOrderDto>> Create(CreatePurchaseOrderRequest request, CancellationToken ct)
    {
        var order = await orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }

    /// <summary>Edita una OC en borrador. Las líneas que conservan su lineId mantienen su liga con la requisición.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Update(Guid id, UpdatePurchaseOrderRequest request, CancellationToken ct) =>
        orders.UpdateAsync(id, request, ct);

    /// <summary>Envía la OC: si el subtotal sin IVA alcanza el umbral configurado queda pendiente de aprobación; si no, aprobada (RN-31).</summary>
    [HttpPost("{id:guid}/submit")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Submit(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.SubmitAsync(id, request.Version, ct);

    [HttpPost("{id:guid}/approve")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Approve(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.ApproveAsync(id, request.Version, ct);

    /// <summary>Rechaza una OC pendiente de aprobación, con motivo. El rechazo es final.</summary>
    [HttpPost("{id:guid}/reject")]
    [RequirePermission(Permissions.PurchasingPoApprove)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Reject(Guid id, RejectPurchaseOrderRequest request, CancellationToken ct) =>
        orders.RejectAsync(id, request, ct);

    /// <summary>Cancela una OC en borrador, pendiente o aprobada sin nada recibido.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.CancelAsync(id, request.Version, ct);

    /// <summary>Cierra una OC parcialmente recibida, abandonando el saldo pendiente (RN-32).</summary>
    [HttpPost("{id:guid}/close")]
    [RequirePermission(Permissions.PurchasingPoManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<PurchaseOrderDto> Close(Guid id, VersionRequest request, CancellationToken ct) =>
        orders.CloseAsync(id, request.Version, ct);
}

[ApiController]
[Route("goods-receipts")]
[Tags("Compras")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class GoodsReceiptsController(IGoodsReceiptService receipts) : ControllerBase
{
    /// <summary>Recepciones en ubicaciones a tu alcance. Filtros: purchaseOrderId, supplierId, locationId, from, to, q (folio o factura).</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<GoodsReceiptListItemDto>> List([FromQuery] GoodsReceiptListQuery query, CancellationToken ct) =>
        receipts.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<GoodsReceiptDto> Get(Guid id, CancellationToken ct) => receipts.GetAsync(id, ct);

    /// <summary>
    /// Recibe (total o parcialmente) una OC aprobada: registra la entrada al inventario al costo de la OC (RN-33).
    /// Una línea de la OC puede repetirse para recibirla en varios lotes. La sobre-recepción se limita a la tolerancia (RN-32).
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
