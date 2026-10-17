using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Security;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Purchasing;

internal static class PurchasingLocations
{
    /// <summary>RN-33/RN-34: purchasing happens only at the plant, in the caller's scope.</summary>
    public static async Task<Location> EnsurePlantAsync(IAppDbContext db, ILocationScope scope, Guid locationId, string code, string message,
        CancellationToken ct)
    {
        scope.EnsureAccess(locationId);
        var location = await db.Locations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct)
                       ?? throw new NotFoundException("la ubicación", locationId);
        if (location.Type != LocationType.Plant)
            throw new BusinessRuleException(code, message);
        if (!location.IsActive)
            throw new BusinessRuleException("location_inactive", $"La ubicación {location.Code} está inactiva.");
        return location;
    }
}
