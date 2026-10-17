using System.Security.Claims;
using Panissimo.Application.Common;

namespace Panissimo.Api.Auth;

/// <summary>The user of the current request; anonymous outside a request (seed, background work).</summary>
public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid? UserId =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue("sub") ?? accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier),
            out var id) ? id : null;

    public bool IsAuthenticated => accessor.HttpContext?.User.Identity?.IsAuthenticated == true;

    public string? IpAddress => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
}
