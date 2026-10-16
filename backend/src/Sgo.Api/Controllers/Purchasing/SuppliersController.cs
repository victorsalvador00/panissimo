using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Purchasing;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Purchasing;

/// <summary>Suppliers are a global catalog: no location scope applies.</summary>
[ApiController]
[Route("suppliers")]
[Tags("Compras")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class SuppliersController(ISupplierService suppliers) : ControllerBase
{
    /// <summary>Proveedores. Filtros: q (razón social o RFC), includeInactive. Orden: name, taxId, paymentTermsDays.</summary>
    [HttpGet]
    [RequirePermission(Permissions.PurchasingView)]
    public Task<PagedResult<SupplierDto>> List([FromQuery] CatalogListQuery query, CancellationToken ct) =>
        suppliers.ListAsync(query, ct);

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<SupplierDto> Get(Guid id, CancellationToken ct) => suppliers.GetAsync(id, ct);

    /// <summary>Alta de proveedor. El RFC es único, salvo los genéricos del SAT (XAXX010101000, XEXX010101000).</summary>
    [HttpPost]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<SupplierDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<SupplierDto>> Create(CreateSupplierRequest request, CancellationToken ct)
    {
        var supplier = await suppliers.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = supplier.Id }, supplier);
    }

    /// <summary>Edita datos o activa/desactiva. Al desactivar deja de ser proveedor preferido de sus artículos.</summary>
    [HttpPut("{id:guid}")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public Task<SupplierDto> Update(Guid id, UpdateSupplierRequest request, CancellationToken ct) =>
        suppliers.UpdateAsync(id, request, ct);

    /// <summary>Artículos del proveedor con precio por unidad de compra (sin IVA). Filtros: q, itemId, includeInactive.</summary>
    [HttpGet("{id:guid}/items")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<PagedResult<SupplierItemDto>> ListItems(Guid id, [FromQuery] SupplierItemListQuery query, CancellationToken ct) =>
        suppliers.ListItemsAsync(id, query, ct);

    [HttpGet("{id:guid}/items/{supplierItemId:guid}")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<SupplierItemDto> GetItem(Guid id, Guid supplierItemId, CancellationToken ct) =>
        suppliers.GetItemAsync(id, supplierItemId, ct);

    /// <summary>Liga un artículo activo al proveedor. isPreferred=true lo vuelve el proveedor preferido del artículo.</summary>
    [HttpPost("{id:guid}/items")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<SupplierItemDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<SupplierItemDto>> AddItem(Guid id, CreateSupplierItemRequest request, CancellationToken ct)
    {
        var item = await suppliers.AddItemAsync(id, request, ct);
        return CreatedAtAction(nameof(GetItem), new { id, supplierItemId = item.Id }, item);
    }

    /// <summary>Edita precio, clave y días de entrega; marca como preferido o activa/desactiva.</summary>
    [HttpPut("{id:guid}/items/{supplierItemId:guid}")]
    [RequirePermission(Permissions.PurchasingSuppliersManage)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status422UnprocessableEntity)]
    public Task<SupplierItemDto> UpdateItem(Guid id, Guid supplierItemId, UpdateSupplierItemRequest request, CancellationToken ct) =>
        suppliers.UpdateItemAsync(id, supplierItemId, request, ct);
}
