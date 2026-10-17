using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;

namespace Panissimo.Application.Inventory;

/// <summary>RN-46: the stock of a plant or branch is its own plus that of its sub-warehouses.</summary>
public static class InventoryLocations
{
    /// <summary>The location and all its sub-warehouses (active or not: stock may remain in an inactive one).</summary>
    public static async Task<List<Guid>> WithWarehousesAsync(IAppDbContext db, Guid locationId, CancellationToken ct)
    {
        var ids = await db.Locations.AsNoTracking().Where(l => l.ParentLocationId == locationId).Select(l => l.Id).ToListAsync(ct);
        ids.Add(locationId);
        return ids;
    }
}
