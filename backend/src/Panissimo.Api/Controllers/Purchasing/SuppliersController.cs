using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Common;
using Panissimo.Application.Purchasing;
using Panissimo.Domain.Security;

namespace Panissimo.Api.Controllers.Purchasing;

/// <summary>Proveedores y sus artículos (RN-35). Catálogo global: no depende de la ubicación.</summary>
[ApiController]
[Route("suppliers")]
[Tags("Proveedores")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class SuppliersController(ISupplierService suppliers) : ControllerBase
{
    /// <summary>Lista paginada. Filtros: q (razón social o RFC), includeInactive.</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<SupplierListItemDto>> List([FromQuery] SupplierListQuery query, CancellationToken ct) => suppliers.ListAsync(query, ct);

    /// <summary>Búsqueda rápida de proveedores activos para los selectores (máximo 50).</summary>
    [HttpGet("lookup")]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<IReadOnlyList<SupplierLookupDto>> Lookup([FromQuery] SupplierLookupQuery query, CancellationToken ct) =>
        suppliers.LookupAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<SupplierDto> Get(Guid id, CancellationToken ct) => suppliers.GetAsync(id, ct);

    /// <summary>Alta con RFC válido y único (salvo los genéricos XAXX010101000 y XEXX010101000).</summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<SupplierDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<SupplierDto>> Create(CreateSupplierRequest request, CancellationToken ct)
    {
        var supplier = await suppliers.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = supplier.Id }, supplier);
    }

    /// <summary>Edita datos y estado. Desactivar quita sus preferencias y bloquea la edición de sus artículos.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<SupplierDto> Update(Guid id, UpdateSupplierRequest request, CancellationToken ct) => suppliers.UpdateAsync(id, request, ct);

    /// <summary>Artículos que vende el proveedor, con precio por unidad de compra y por unidad base.</summary>
    [HttpGet("{id:guid}/items")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<SupplierItemDto>> ListItems(Guid id, [FromQuery] SupplierItemListQuery query, CancellationToken ct) =>
        suppliers.ListItemsAsync(id, query, ct);

    /// <summary>Agrega una materia prima o insumo al catálogo del proveedor. Marcarlo preferido desmarca el anterior.</summary>
    [HttpPost("{id:guid}/items")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<SupplierItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<SupplierItemDto>> AddItem(Guid id, CreateSupplierItemRequest request, CancellationToken ct)
    {
        var row = await suppliers.AddItemAsync(id, request, ct);
        return CreatedAtAction(nameof(ListItems), new { id }, row);
    }

    /// <summary>Edita clave, precio, días de entrega, preferido y estado. Una fila inactiva nunca es preferida.</summary>
    [HttpPut("{id:guid}/items/{supplierItemId:guid}")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<SupplierItemDto> UpdateItem(Guid id, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct) =>
        suppliers.UpdateItemAsync(id, supplierItemId, request, ct);
}

[ApiController]
[Route("items")]
[Tags("Proveedores")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class SupplierOffersController(ISupplierService suppliers) : ControllerBase
{
    /// <summary>Proveedores activos que venden el artículo: primero el preferido, luego el más barato por unidad base.</summary>
    [HttpGet("{id:guid}/supplier-offers")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<IReadOnlyList<SupplierOfferDto>> Get(Guid id, CancellationToken ct) => suppliers.GetOffersAsync(id, ct);
}
