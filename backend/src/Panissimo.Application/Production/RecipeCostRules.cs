using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Production;

/// <summary>A purchase receipt of an item: its weighted unit cost and business date.</summary>
public sealed record ReceiptCost(decimal UnitCost, DateOnly BusinessDate);

/// <summary>RN-51: a component whose cost rose, with its last two receipt costs.</summary>
public sealed record CostIncreaseDto(Guid ItemId, string Sku, string Name, decimal PreviousCost, decimal LastCost, decimal IncreasePct,
    DateOnly ReceivedOn);

public static class RecipeCostRules
{
    /// <summary>RN-51: an increase only counts while the receipt that raised the cost is this recent.</summary>
    public const int IncreaseWindowDays = 30;

    /// <summary>
    /// RN-51: a component "rose" if its last receipt cost exceeds the previous one by at least <paramref name="alertPct"/> and
    /// that last receipt is at most 30 days old. Returns the increase in percent, or null.
    /// </summary>
    public static decimal? Increase(ReceiptCost? last, ReceiptCost? previous, decimal alertPct, DateOnly today)
    {
        if (last is null || previous is null || previous.UnitCost <= 0)
            return null;
        if (last.BusinessDate < today.AddDays(-IncreaseWindowDays))
            return null;
        var pct = Math.Round((last.UnitCost - previous.UnitCost) / previous.UnitCost * 100, 2, MidpointRounding.AwayFromZero);
        return pct > 0 && pct >= alertPct ? pct : null;
    }

    /// <summary>Weighted unit cost of a receipt's movements of one item (lots of the same receipt).</summary>
    public static decimal UnitCost(decimal totalCost, decimal quantity) =>
        quantity == 0 ? 0 : InventoryMath.Round(totalCost / quantity);

    /// <summary>
    /// RN-51: items whose last purchase receipt (≤ 30 days old) cost at least <paramref name="alertPct"/> more than the previous
    /// receipt. A receipt with several lots counts once, at its weighted cost.
    /// </summary>
    public static async Task<Dictionary<Guid, CostIncreaseDto>> IncreasesAsync(IAppDbContext db, decimal alertPct, DateOnly today,
        CancellationToken ct)
    {
        var since = today.AddDays(-IncreaseWindowDays);
        var candidates = db.InventoryMovements
            .Where(m => m.Type == MovementType.PurchaseReceipt && m.BusinessDate >= since)
            .Select(m => m.ItemId).Distinct();
        var receipts = await db.InventoryMovements.AsNoTracking()
            .Where(m => m.Type == MovementType.PurchaseReceipt && candidates.Contains(m.ItemId))
            .GroupBy(m => new { m.ItemId, m.SourceDocId })
            .Select(g => new { g.Key.ItemId, Sequence = g.Max(m => m.Sequence), Date = g.Max(m => m.BusinessDate),
                Total = g.Sum(m => m.TotalCost), Quantity = g.Sum(m => m.Quantity) })
            .ToListAsync(ct);
        var risen = new Dictionary<Guid, (ReceiptCost Last, ReceiptCost Previous, decimal Pct)>();
        foreach (var item in receipts.GroupBy(r => r.ItemId))
        {
            var lastTwo = item.OrderByDescending(r => r.Sequence)
                .Select(r => new ReceiptCost(UnitCost(r.Total, r.Quantity), r.Date)).Take(2).ToList();
            if (lastTwo.Count < 2)
                continue;
            if (Increase(lastTwo[0], lastTwo[1], alertPct, today) is { } pct)
                risen[item.Key] = (lastTwo[0], lastTwo[1], pct);
        }
        if (risen.Count == 0)
            return [];

        var ids = risen.Keys.ToList();
        var names = await db.Items.AsNoTracking().Where(i => ids.Contains(i.Id)).Select(i => new { i.Id, i.Sku, i.Name }).ToListAsync(ct);
        return names.ToDictionary(n => n.Id, n => new CostIncreaseDto(n.Id, n.Sku, n.Name, risen[n.Id].Previous.UnitCost,
            risen[n.Id].Last.UnitCost, risen[n.Id].Pct, risen[n.Id].Last.BusinessDate));
    }
}
