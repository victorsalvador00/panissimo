using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;

namespace Panissimo.Api.Auth;

/// <summary>
/// Runs after authentication: loads the caller's effective permissions and locations (cached) into
/// <see cref="UserAccessContext"/>, and rejects tokens of users that were deactivated or deleted.
/// </summary>
public sealed class UserAccessMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, ICurrentUser currentUser, IUserAccessService service, UserAccessContext accessContext)
    {
        if (currentUser is { IsAuthenticated: true, UserId: { } userId })
        {
            var access = await service.GetAsync(userId, context.RequestAborted);
            if (access is not { IsActive: true })
                throw new AuthenticationFailedException("user_inactive", "Tu usuario está inactivo o fue eliminado. Contacta al administrador.");
            accessContext.Access = access;
        }

        await next(context);
    }
}
