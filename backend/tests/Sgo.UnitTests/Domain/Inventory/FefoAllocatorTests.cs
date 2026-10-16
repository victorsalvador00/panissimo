using Sgo.Domain.Inventory;
using static Sgo.Domain.Inventory.FefoAllocator;

namespace Sgo.UnitTests.Domain.Inventory;

public class FefoAllocatorTests
{
    private static readonly DateOnly Today = new(2026, 9, 23);

    [Fact]
    public void Ties_on_expiration_are_broken_by_lot_number()
    {
        var b = new LotStock(Guid.NewGuid(), "B", Today.AddDays(1), 2);
        var a = new LotStock(Guid.NewGuid(), "A", Today.AddDays(1), 2);

        var allocation = Allocate([b, a], 3, Today, out _)!;

        Assert.Equal([(a.LotId, 2m), (b.LotId, 1m)], allocation.Select(x => (x.LotId, x.Quantity)));
    }

    [Fact]
    public void Lots_without_stock_are_ignored_and_usable_is_reported()
    {
        var empty = new LotStock(Guid.NewGuid(), "A", Today, 0);
        var expired = new LotStock(Guid.NewGuid(), "B", Today.AddDays(-1), 10);
        var ok = new LotStock(Guid.NewGuid(), "C", Today.AddDays(9), 3);

        Assert.Null(Allocate([empty, expired, ok], 4, Today, out var usable));
        Assert.Equal(3m, usable);
    }

    [Fact]
    public void Average_after_entry_formula() =>
        Assert.Equal(12.5m, InventoryMath.AverageAfterEntry(10, 10, 10, 15));

    [Fact]
    public void Average_with_negative_previous_stock_takes_entry_cost() =>
        Assert.Equal(15m, InventoryMath.AverageAfterEntry(-3, 10, 10, 15));
}
