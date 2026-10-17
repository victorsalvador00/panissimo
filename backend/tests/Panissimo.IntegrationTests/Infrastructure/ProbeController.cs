using Microsoft.AspNetCore.Mvc;
using Panissimo.Api.Auth;
using Panissimo.Application.Security;
using Panissimo.Domain.Security;

namespace Panissimo.IntegrationTests.Infrastructure;

/// <summary>Test-only endpoints to exercise [RequirePermission] and the location scope before real modules exist.</summary>
[ApiController]
[Route("test-probe")]
public sealed class ProbeController(ILocationScope scope) : ControllerBase
{
    [HttpGet("catalog-manage")]
    [RequirePermission(Permissions.CatalogManage)]
    public IActionResult CatalogManage() => Ok();

    [HttpGet("any-of")]
    [RequirePermission(Permissions.PurchasingView, Permissions.InventoryView)]
    public IActionResult AnyOf() => Ok();

    [HttpGet("locations/{locationId:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    public IActionResult Location(Guid locationId)
    {
        scope.EnsureAccess(locationId);
        return Ok();
    }
}
