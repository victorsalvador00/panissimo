using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.UnitTests.Domain;

public class InventoryMathTests
{
    [Fact]
    public void Average_cost_weights_successive_entries()
    {
        var afterFirst = InventoryMath.AverageAfterEntry(0, 0, 10, 20);
        var afterSecond = InventoryMath.AverageAfterEntry(10, afterFirst, 30, 24);

        Assert.Equal(20m, afterFirst);
        Assert.Equal(23m, afterSecond); // (10×20 + 30×24) / 40
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void Entry_over_non_positive_stock_takes_the_entry_cost(decimal currentQty) =>
        Assert.Equal(18.5m, InventoryMath.AverageAfterEntry(currentQty, 99, 4, 18.5m));

    [Fact]
    public void Average_is_rounded_to_four_decimals() =>
        Assert.Equal(3.3333m, InventoryMath.AverageAfterEntry(1, 0, 2, 5));
}

public class FefoAllocatorTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);
    private static readonly DateTimeOffset Created = new(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);

    private static FefoAllocator.LotStock Lot(string number, DateOnly? expiration, decimal available, int createdDay = 1) =>
        new(Guid.NewGuid(), number, expiration, Created.AddDays(createdDay), available);

    [Fact]
    public void Earliest_expiration_first_and_lots_without_expiration_last()
    {
        var late = Lot("B", Today.AddDays(10), 5);
        var noDate = Lot("C", null, 5);
        var soon = Lot("A", Today.AddDays(2), 3);

        var allocations = FefoAllocator.Allocate([late, noDate, soon], 9, Today, out _)!;

        Assert.Equal([(soon.LotId, 3m), (late.LotId, 5m), (noDate.LotId, 1m)], allocations.Select(a => (a.LotId, a.Quantity)));
    }

    [Fact]
    public void Ties_are_broken_by_creation_date()
    {
        var newer = Lot("Z", Today.AddDays(3), 5, createdDay: 5);
        var older = Lot("Y", Today.AddDays(3), 5, createdDay: 2);

        var allocations = FefoAllocator.Allocate([newer, older], 6, Today, out _)!;

        Assert.Equal(older.LotId, allocations[0].LotId);
    }

    [Fact]
    public void Expired_lots_are_excluded_and_shortage_reports_usable_stock()
    {
        var expired = Lot("V", Today.AddDays(-1), 100);
        var good = Lot("G", Today, 4); // expires today: still usable

        Assert.Null(FefoAllocator.Allocate([expired, good], 5, Today, out var usable));
        Assert.Equal(4m, usable);
    }
}

public class InventoryPostingCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);
    private static readonly Guid Plant = Guid.NewGuid();
    private static readonly Guid Branch = Guid.NewGuid();

    private static readonly PostingItem Flour = new(Guid.NewGuid(), "HAR", "Harina", TracksLots: false, WholeQuantities: false);
    private static readonly PostingItem Bread = new(Guid.NewGuid(), "BOMBA", "Bomba", TracksLots: true, WholeQuantities: true);

    private static PostingState State(IEnumerable<PostingLot>? lots = null, IEnumerable<StockBalance>? balances = null) => new()
    {
        Items = new Dictionary<Guid, PostingItem> { [Flour.Id] = Flour, [Bread.Id] = Bread },
        Lots = (lots ?? []).ToDictionary(l => l.Id),
        Balances = [.. balances ?? []],
        Costs = [],
        OccurredAt = new DateTimeOffset(2026, 10, 16, 18, 0, 0, TimeSpan.Zero),
        BusinessDate = Today,
    };

    private static MovementRequest Request(PostingItem item, MovementType type, decimal qty, decimal? cost = null, Guid? lotId = null, Guid? location = null) =>
        new(location ?? Plant, item.Id, lotId, type, qty, cost, "Test", Guid.NewGuid(), "T-1", null);

    private static PostingLot NewLot(string number, DateOnly? expiration) =>
        new(Guid.NewGuid(), Bread.Id, number, expiration, DateTimeOffset.UnixEpoch);

    [Fact]
    public void Entries_update_the_average_and_exits_leave_at_it()
    {
        var state = State();

        var result = InventoryPostingCalculator.Calculate(
        [
            Request(Flour, MovementType.PurchaseReceipt, 10, 20),
            Request(Flour, MovementType.PurchaseReceipt, 30, 24),
            Request(Flour, MovementType.ProductionConsumption, -15),
        ], state);

        Assert.Equal(23m, state.Costs[(Plant, Flour.Id)].AverageCost);
        var exit = result.Movements[2];
        Assert.Equal((-15m, 23m, -345m), (exit.Quantity, exit.UnitCost, exit.TotalCost));
        Assert.Equal(25m, state.Balances.Single().Quantity);
    }

    [Fact]
    public void Every_shortage_is_reported_and_nothing_is_returned()
    {
        var state = State();

        var error = Assert.Throws<InsufficientStockException>(() => InventoryPostingCalculator.Calculate(
        [
            Request(Flour, MovementType.Adjustment, 5, 10),
            Request(Flour, MovementType.Waste, -8),
            Request(Bread, MovementType.TransferOut, -3),
        ], state));

        Assert.Equal(2, error.Shortages.Count);
        Assert.Contains(error.Shortages, s => s is { Sku: "HAR", Requested: 8m, Available: 5m });
        Assert.Contains(error.Shortages, s => s is { Sku: "BOMBA", Requested: 3m, Available: 0m });
    }

    [Fact]
    public void Exits_without_lot_follow_fefo_and_produce_one_movement_per_lot()
    {
        var soon = NewLot("OP-1-01", Today.AddDays(1));
        var later = NewLot("OP-1-02", Today.AddDays(3));
        var state = State([soon, later]);
        InventoryPostingCalculator.Calculate(
        [
            Request(Bread, MovementType.ProductionOutput, 10, 2, later.Id),
            Request(Bread, MovementType.ProductionOutput, 4, 2, soon.Id),
        ], state);

        var result = InventoryPostingCalculator.Calculate([Request(Bread, MovementType.CustomerShipment, -6)], state);

        Assert.Equal([(soon.Id, -4m), (later.Id, -2m)], result.Movements.Select(m => (m.LotId!.Value, m.Quantity)));
    }

    [Theory]
    [InlineData(MovementType.TransferOut, true)]
    [InlineData(MovementType.CustomerShipment, true)]
    [InlineData(MovementType.ProductionConsumption, true)]
    [InlineData(MovementType.Consumption, true)]
    [InlineData(MovementType.Waste, false)]
    [InlineData(MovementType.Adjustment, false)]
    public void Expired_lots_are_rejected_only_on_dispatch_shipment_production_and_consumption(MovementType type, bool rejected)
    {
        var expired = NewLot("VIEJO", Today.AddDays(-1));
        var state = State([expired]);
        InventoryPostingCalculator.Calculate([Request(Bread, MovementType.Adjustment, 5, 1, expired.Id)], state);

        var post = () => InventoryPostingCalculator.Calculate([Request(Bread, type, -2, lotId: expired.Id)], state);

        if (rejected)
            Assert.Equal("lot_expired", Assert.Throws<BusinessRuleException>(post).Code);
        else
            Assert.Single(post().Movements);
    }

    [Fact]
    public void Lot_tracked_entries_need_a_lot_and_other_items_reject_one()
    {
        var lot = NewLot("L1", null);
        var state = State([lot]);

        Assert.Equal("lot_required", Assert.Throws<BusinessRuleException>(() =>
            InventoryPostingCalculator.Calculate([Request(Bread, MovementType.Adjustment, 5, 1)], state)).Code);
        Assert.Equal("lot_not_allowed", Assert.Throws<BusinessRuleException>(() =>
            InventoryPostingCalculator.Calculate([Request(Flour, MovementType.Adjustment, 5, 1, lot.Id)], state)).Code);
    }

    [Fact]
    public void Pieces_must_be_whole()
    {
        var lot = NewLot("L1", null);

        var error = Assert.Throws<BusinessRuleException>(() =>
            InventoryPostingCalculator.Calculate([Request(Bread, MovementType.ProductionOutput, 2.5m, 1, lot.Id)], State([lot])));

        Assert.Equal("whole_quantity_required", error.Code);
    }

    [Fact]
    public void Costs_are_kept_per_location()
    {
        var state = State();

        InventoryPostingCalculator.Calculate(
        [
            Request(Flour, MovementType.PurchaseReceipt, 10, 20),
            Request(Flour, MovementType.TransferOut, -4),
            Request(Flour, MovementType.TransferIn, 4, 20, location: Branch),
            Request(Flour, MovementType.PurchaseReceipt, 10, 40),
        ], state);

        Assert.Equal(32.5m, state.Costs[(Plant, Flour.Id)].AverageCost); // (6×20 + 10×40) / 16
        Assert.Equal(20m, state.Costs[(Branch, Flour.Id)].AverageCost);
    }
}
