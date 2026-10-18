using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Production;

/// <summary>A purchase receipt of an item: its weighted unit cost and business date.</summary>
public sealed record ReceiptCost(decimal UnitCost, DateOnly BusinessDate);

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
}
