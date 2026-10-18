using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Inventory;

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

    /// <summary>
    /// Average cost per item of a plant or branch with its sub-warehouses (RN-04, RN-46): weighted by the stock of each
    /// one, like the total row of the stock. Without stock, the location's own cost or else the highest of its
    /// sub-warehouses.
    /// </summary>
    public static async Task<Dictionary<Guid, decimal>> AverageCostsAsync(
        IAppDbContext db, Guid locationId, IReadOnlyCollection<Guid> itemIds, CancellationToken ct)
    {
        var locationIds = await WithWarehousesAsync(db, locationId, ct);
        var costs = await db.ItemLocationCosts.AsNoTracking()
            .Where(c => locationIds.Contains(c.LocationId) && itemIds.Contains(c.ItemId))
            .Select(c => new { c.LocationId, c.ItemId, c.AverageCost })
            .ToListAsync(ct);
        var stock = await db.StockBalances.AsNoTracking()
            .Where(b => locationIds.Contains(b.LocationId) && itemIds.Contains(b.ItemId) && b.Quantity > 0)
            .GroupBy(b => new { b.LocationId, b.ItemId })
            .Select(g => new { g.Key.LocationId, g.Key.ItemId, Qty = g.Sum(b => b.Quantity) })
            .ToDictionaryAsync(x => (x.LocationId, x.ItemId), x => x.Qty, ct);

        return costs.GroupBy(c => c.ItemId).ToDictionary(g => g.Key, g =>
        {
            var weighted = g.Select(c => (Qty: stock.GetValueOrDefault((c.LocationId, c.ItemId)), c.AverageCost)).ToList();
            var qty = weighted.Sum(w => w.Qty);
            if (qty > 0)
                return InventoryMath.Round(weighted.Sum(w => w.Qty * w.AverageCost) / qty);
            return g.FirstOrDefault(c => c.LocationId == locationId)?.AverageCost ?? g.Max(c => c.AverageCost);
        });
    }
}
