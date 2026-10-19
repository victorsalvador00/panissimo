using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Organization;
using Panissimo.Domain.Production;

namespace Panissimo.Application.Production;

/// <summary>RN-49: loads a recipe's factory and checks it against the plant that produces it.</summary>
internal static class ProductionFloor
{
    /// <returns>The recipe's factory, or null when it has none (allowed only at a plant without factories).</returns>
    public static async Task<Location?> EnsureAsync(IAppDbContext db, Guid plantId, Guid? factoryId, string sku, CancellationToken ct)
    {
        var locations = await db.Locations.AsNoTracking()
            .Where(l => l.Id == factoryId || (l.ParentLocationId == plantId && l.Type == LocationType.Factory && l.IsActive))
            .ToListAsync(ct);
        var factory = factoryId is { } id ? locations.SingleOrDefault(l => l.Id == id) : null;
        RecipeRules.EnsureFactory(sku, factory, plantId,
            locations.Any(l => l.ParentLocationId == plantId && l.Type == LocationType.Factory && l.IsActive));
        return factory;
    }
}
