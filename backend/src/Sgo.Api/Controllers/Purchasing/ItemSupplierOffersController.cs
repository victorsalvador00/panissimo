using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Purchasing;
using Sgo.Domain.Security;

namespace Sgo.Api.Controllers.Purchasing;

/// <summary>Suppliers are a global catalog: no location scope applies.</summary>
[ApiController]
[Route("items")]
[Tags("Compras")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
public sealed class ItemSupplierOffersController(ISupplierService suppliers) : ControllerBase
{
    /// <summary>
    /// Proveedores activos que venden el artículo, con precio por unidad de compra (sin IVA) y días de entrega;
    /// primero el preferido y luego por precio. Trae la unidad de compra del artículo (para capturar requisiciones).
    /// </summary>
    [HttpGet("{id:guid}/supplier-offers")]
    [RequirePermission(Permissions.PurchasingView)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public Task<ItemSupplierOffersDto> Offers(Guid id, CancellationToken ct) => suppliers.OffersAsync(id, ct);
}
