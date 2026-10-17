using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Sales;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Sales;

/// <summary>Clientes terceros, sus puntos de entrega y artículos (dominio §4.6). Catálogo global: no depende de la ubicación.</summary>
[ApiController]
[Route("customers")]
[Tags("Clientes")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class CustomersController(ICustomerService customers) : ControllerBase
{
    /// <summary>Lista paginada. Filtros: q (código, nombre o RFC), includeInactive.</summary>
    [HttpGet]
    [RequirePermission(Permissions.SalesView)]
    public Task<PagedResult<CustomerListItemDto>> List([FromQuery] CustomerListQuery query, CancellationToken ct) => customers.ListAsync(query, ct);

    /// <summary>Búsqueda rápida de clientes activos para los selectores (máximo 50).</summary>
    [HttpGet("lookup")]
    [RequirePermission(Permissions.SalesView)]
    public Task<IReadOnlyList<CustomerLookupDto>> Lookup([FromQuery] CustomerLookupQuery query, CancellationToken ct) =>
        customers.LookupAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.SalesView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<CustomerDto> Get(Guid id, CancellationToken ct) => customers.GetAsync(id, ct);

    /// <summary>Alta con código único (ej. CLI-001) y RFC opcional con las mismas reglas que el proveedor.</summary>
    [HttpPost]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<CustomerDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CustomerDto>> Create(CreateCustomerRequest request, CancellationToken ct)
    {
        var customer = await customers.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = customer.Id }, customer);
    }

    /// <summary>Edita código, datos y estado. El código debe seguir siendo único.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<CustomerDto> Update(Guid id, UpdateCustomerRequest request, CancellationToken ct) => customers.UpdateAsync(id, request, ct);

    [HttpGet("{id:guid}/delivery-points")]
    [RequirePermission(Permissions.SalesView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<DeliveryPointDto>> ListDeliveryPoints(Guid id, [FromQuery] DeliveryPointListQuery query, CancellationToken ct) =>
        customers.ListDeliveryPointsAsync(id, query, ct);

    [HttpPost("{id:guid}/delivery-points")]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<DeliveryPointDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DeliveryPointDto>> AddDeliveryPoint(Guid id, CreateDeliveryPointRequest request, CancellationToken ct)
    {
        var point = await customers.AddDeliveryPointAsync(id, request, ct);
        return CreatedAtAction(nameof(ListDeliveryPoints), new { id }, point);
    }

    [HttpPut("{id:guid}/delivery-points/{pointId:guid}")]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<DeliveryPointDto> UpdateDeliveryPoint(Guid id, Guid pointId, UpdateDeliveryPointRequest request, CancellationToken ct) =>
        customers.UpdateDeliveryPointAsync(id, pointId, request, ct);

    /// <summary>Productos terminados que compra el cliente, con su clave y precio informativo.</summary>
    [HttpGet("{id:guid}/items")]
    [RequirePermission(Permissions.SalesView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<CustomerItemDto>> ListItems(Guid id, [FromQuery] CustomerItemListQuery query, CancellationToken ct) =>
        customers.ListItemsAsync(id, query, ct);

    /// <summary>Agrega un producto terminado activo (granel o empaquetado); otros tipos responden 422 (D-05).</summary>
    [HttpPost("{id:guid}/items")]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<CustomerItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<CustomerItemDto>> AddItem(Guid id, CreateCustomerItemRequest request, CancellationToken ct)
    {
        var row = await customers.AddItemAsync(id, request, ct);
        return CreatedAtAction(nameof(ListItems), new { id }, row);
    }

    [HttpPut("{id:guid}/items/{customerItemId:guid}")]
    [RequirePermission(Permissions.SalesCustomersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<CustomerItemDto> UpdateItem(Guid id, Guid customerItemId, UpdateCustomerItemRequest request, CancellationToken ct) =>
        customers.UpdateItemAsync(id, customerItemId, request, ct);
}

/// <summary>Pedidos de clientes terceros (RN-80, RN-82). Los surte la Planta.</summary>
[ApiController]
[Route("customer-orders")]
[Tags("Pedidos de cliente")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class CustomerOrdersController(ICustomerOrderService orders) : ControllerBase
{
    /// <summary>Filtros: tab (All, ToFulfill, Drafts), status, customerId, from y to (fecha requerida), q (folio, referencia o cliente).</summary>
    [HttpGet]
    [RequirePermission(Permissions.SalesView)]
    public Task<PagedResult<CustomerOrderListItemDto>> List([FromQuery] CustomerOrderListQuery query, CancellationToken ct) =>
        orders.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.SalesView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<CustomerOrderDto> Get(Guid id, CancellationToken ct) => orders.GetAsync(id, ct);

    /// <summary>Crea un pedido en borrador: solo productos terminados (granel o empaquetado); otros tipos responden 422 (D-05).</summary>
    [HttpPost]
    [RequirePermission(Permissions.SalesOrdersManage)]
    [ProducesResponseType<CustomerOrderDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<CustomerOrderDto>> Create(CreateCustomerOrderRequest request, CancellationToken ct)
    {
        var order = await orders.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
    }

    /// <summary>Edita un pedido en borrador. Uno confirmado no se edita: se cancela y se captura otro.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.SalesOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerOrderDto> Update(Guid id, UpdateCustomerOrderRequest request, CancellationToken ct) => orders.UpdateAsync(id, request, ct);

    /// <summary>Confirma el pedido: se vuelve demanda del plan de producción.</summary>
    [HttpPost("{id:guid}/confirm")]
    [RequirePermission(Permissions.SalesOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerOrderDto> Confirm(Guid id, VersionRequest request, CancellationToken ct) => orders.ConfirmAsync(id, request.Version, ct);

    /// <summary>Cancela un pedido en borrador o confirmado sin remisiones.</summary>
    [HttpPost("{id:guid}/cancel")]
    [RequirePermission(Permissions.SalesOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerOrderDto> Cancel(Guid id, VersionRequest request, CancellationToken ct) => orders.CancelAsync(id, request.Version, ct);

    /// <summary>Cierra con saldo un pedido parcialmente remisionado. El motivo es obligatorio.</summary>
    [HttpPost("{id:guid}/close")]
    [RequirePermission(Permissions.SalesOrdersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<CustomerOrderDto> Close(Guid id, CloseCustomerOrderRequest request, CancellationToken ct) => orders.CloseAsync(id, request, ct);
}
