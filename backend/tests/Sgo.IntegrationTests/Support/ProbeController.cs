using Microsoft.AspNetCore.Mvc;
using Sgo.Api.Auth;
using Sgo.Application.Common;
using Sgo.Domain.Security;

namespace Sgo.IntegrationTests.Support;

/// <summary>
/// Test-only endpoints that exercise [RequirePermission] and ILocationScope
/// before any business endpoint exists. Registered only by <see cref="SgoApiFactory"/>.
/// </summary>
[ApiController]
[Route("test-probe")]
public sealed class ProbeController(ILocationScope locationScope) : ControllerBase
{
    [HttpGet("view")]
    [RequirePermission(Permissions.InventoryView)]
    public IActionResult View() => Ok();

    [HttpGet("adjust")]
    [RequirePermission(Permissions.InventoryAdjust)]
    public IActionResult Adjust() => Ok();

    [HttpGet("locations/{locationId:guid}")]
    [RequirePermission(Permissions.InventoryView)]
    public IActionResult Location(Guid locationId)
    {
        locationScope.EnsureAccess(locationId);
        return Ok();
    }
}
