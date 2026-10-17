using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Sales;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Sales;

/// <summary>Remisiones de un pedido de cliente (RN-81).</summary>
[ApiController]
[Route("customer-orders/{orderId:guid}/shipments")]
[Tags("Remisiones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class CustomerOrderShipmentsController(ICustomerShipmentService shipments) : ControllerBase
{
    [HttpGet]
    [RequirePermission(Permissions.SalesView)]
    public Task<PagedResult<CustomerShipmentListItemDto>> List(Guid orderId, [FromQuery] CustomerShipmentListQuery query, CancellationToken ct) =>
        shipments.ListAsync(query with { CustomerOrderId = orderId }, ct);

    /// <summary>Crea una remisión en borrador con el saldo de cada línea de un pedido confirmado o parcialmente remisionado.</summary>
    [HttpPost]
    [RequirePermission(Permissions.SalesShipmentsDispatch)]
    [ProducesResponseType<CustomerShipmentDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<CustomerShipmentDto>> Create(Guid orderId, CancellationToken ct)
    {
        var shipment = await shipments.CreateFromOrderAsync(orderId, ct);
        return CreatedAtAction(nameof(CustomerShipmentsController.Get), "CustomerShipments", new { id = shipment.Id }, shipment);
    }
}

/// <summary>Remisiones a clientes (RN-81..RN-83): documento de entrega, no factura. Despacharlas mueve inventario.</summary>
[ApiController]
[Route("customer-shipments")]
[Tags("Remisiones")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class CustomerShipmentsController(ICustomerShipmentService shipments) : ControllerBase
{
    /// <summary>Filtros: tab (All, ToDispatch), status, customerId, customerOrderId, from, to, q (folio).</summary>
    [HttpGet]
    [RequirePermission(Permissions.SalesView)]
    public Task<PagedResult<CustomerShipmentListItemDto>> List([FromQuery] CustomerShipmentListQuery query, CancellationToken ct) =>
        shipments.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.SalesView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<CustomerShipmentDto> Get(Guid id, CancellationToken ct) => shipments.GetAsync(id, ct);

    /// <summary>Edita notas y cantidades de una remisión en borrador (máximo el saldo más la tolerancia; 0 omite la línea).</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.SalesShipmentsDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerShipmentDto> Update(Guid id, UpdateCustomerShipmentRequest request, CancellationToken ct) =>
        shipments.UpdateAsync(id, request, ct);

    /// <summary>
    /// Despacha: registra la salida en la Planta con los lotes elegidos o FEFO (los vencidos se rechazan) al costo promedio
    /// vigente y avanza el pedido. Un despacho simultáneo responde 409.
    /// </summary>
    [HttpPost("{id:guid}/dispatch")]
    [RequirePermission(Permissions.SalesShipmentsDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerShipmentDto> Dispatch(Guid id, DispatchCustomerShipmentRequest request, CancellationToken ct) =>
        shipments.DispatchAsync(id, request, ct);

    /// <summary>Cancela una remisión en borrador.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.SalesShipmentsDispatch)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerShipmentDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) => shipments.CancelAsync(id, request.Version, ct);
}
