using Sgo.Application.Common;
using Sgo.Domain.Common;

namespace Sgo.Application.Security;

public sealed class LocationScope(UserAccessContext context) : ILocationScope
{
    public const string OutOfScopeMessage = "No tienes acceso a esta ubicación.";

    public IReadOnlySet<Guid> AllowedLocationIds => context.Access?.LocationIds ?? new HashSet<Guid>();

    public void EnsureAccess(Guid locationId)
    {
        if (!AllowedLocationIds.Contains(locationId))
            throw new ForbiddenException(OutOfScopeMessage);
    }
}
