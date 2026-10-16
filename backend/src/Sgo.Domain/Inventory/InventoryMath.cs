namespace Sgo.Domain.Inventory;

public static class InventoryMath
{
    /// <summary>Quantities and costs are numeric(18,4) (RN-03).</summary>
    public const int Decimals = 4;

    public static decimal Round(decimal value) => decimal.Round(value, Decimals, MidpointRounding.AwayFromZero);

    /// <summary>
    /// RN-04: weighted average after an entry. When the previous stock is ≤ 0 the new cost is the entry cost.
    /// </summary>
    public static decimal AverageAfterEntry(decimal currentQty, decimal currentCost, decimal entryQty, decimal entryCost)
    {
        if (entryQty <= 0)
            throw new ArgumentOutOfRangeException(nameof(entryQty), "An entry must be positive.");
        if (currentQty <= 0)
            return Round(entryCost);
        return Round((currentQty * currentCost + entryQty * entryCost) / (currentQty + entryQty));
    }
}

/// <summary>RN-05: first-expired, first-out lot allocation.</summary>
public static class FefoAllocator
{
    public sealed record LotStock(Guid LotId, string LotNumber, DateOnly? ExpirationDate, decimal Available);

    public sealed record Allocation(Guid LotId, decimal Quantity);

    /// <summary>
    /// Allocates <paramref name="quantity"/> from lots that are not expired on <paramref name="businessDate"/>,
    /// earliest expiration first; lots without expiration go last.
    /// Returns null when the usable stock (<paramref name="usable"/>) is not enough.
    /// </summary>
    public static IReadOnlyList<Allocation>? Allocate(
        IEnumerable<LotStock> lots, decimal quantity, DateOnly businessDate, out decimal usable)
    {
        if (quantity <= 0)
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity to allocate must be positive.");

        var candidates = lots
            .Where(l => l.Available > 0 && !(l.ExpirationDate < businessDate))
            .OrderBy(l => l.ExpirationDate is null)
            .ThenBy(l => l.ExpirationDate)
            .ThenBy(l => l.LotNumber, StringComparer.Ordinal)
            .ThenBy(l => l.LotId)
            .ToList();

        usable = candidates.Sum(l => l.Available);
        if (usable < quantity)
            return null;

        var allocations = new List<Allocation>();
        var pending = quantity;
        foreach (var lot in candidates)
        {
            var take = Math.Min(lot.Available, pending);
            allocations.Add(new Allocation(lot.LotId, take));
            pending -= take;
            if (pending == 0)
                break;
        }
        return allocations;
    }
}
