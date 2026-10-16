using System.Security.Claims;
using Sgo.Application.Common;

namespace Sgo.Api.Auth;

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private HttpContext? Context => accessor.HttpContext;

    public Guid? UserId =>
        Guid.TryParse(Context?.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? Context?.User.FindFirstValue("sub"), out var id)
            ? id
            : null;

    public bool IsAuthenticated => Context?.User.Identity?.IsAuthenticated == true;

    public string? IpAddress => Context?.Connection.RemoteIpAddress?.ToString();
}
