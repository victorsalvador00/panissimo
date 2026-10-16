using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.UnitTests.Domain.Inventory;

/// <summary>RN-02, RN-04 and RN-05 on the pure posting core (B-06 acceptance criterion).</summary>
public class InventoryPostingCalculatorTests
{
    private static readonly DateOnly Today = new(2026, 9, 23);
    private static readonly Guid Location = Guid.NewGuid();
    private static readonly PostingItem Flour = new(Guid.NewGuid(), "HAR-001", "Harina", TracksLots: false);
    private static readonly PostingItem Milk = new(Guid.NewGuid(), "LEC-001", "Leche", TracksLots: true);

    private readonly Dictionary<Guid, PostingLot> _lots = [];
    private readonly List<StockBalance> _balances = [];
    private readonly Dictionary<(Guid, Guid), ItemLocationCost> _costs = [];

    private PostingState State(DateOnly? today = null) => new()
    {
        Items = new Dictionary<Guid, PostingItem> { [Flour.Id] = Flour, [Milk.Id] = Milk },
        Lots = _lots,
        Balances = _balances,
        Costs = _costs,
        OccurredAt = DateTimeOffset.UtcNow,
        BusinessDate = today ?? Today,
    };

    private PostingLot AddLot(string number, DateOnly? expiration)
    {
        var lot = new PostingLot(Guid.NewGuid(), Milk.Id, number, expiration);
        _lots[lot.Id] = lot;
        return lot;
    }

    private static MovementRequest Req(PostingItem item, decimal qty, MovementType type, decimal? cost = null, Guid? lot = null) =>
        new(Location, item.Id, lot, type, qty, cost, "TEST", Guid.NewGuid(), "T-000001", null);

    private PostingResult Post(params MovementRequest[] requests) => InventoryPostingCalculator.Calculate(requests, State());

    private decimal OnHand(PostingItem item, Guid? lot = null) =>
        _balances.Where(b => b.ItemId == item.Id && (lot is null || b.LotId == lot)).Sum(b => b.Quantity);

    private decimal Average(PostingItem item) => _costs[(Location, item.Id)].AverageCost;

    // ---------- RN-04: weighted average cost ----------

    [Fact]
    public void RN04_successive_entries_recompute_the_weighted_average()
    {
        Post(Req(Flour, 10, MovementType.PurchaseReceipt, cost: 20));
        Post(Req(Flour, 30, MovementType.PurchaseReceipt, cost: 24));

        // (10 × 20 + 30 × 24) / 40 = 23
        Assert.Equal(23m, Average(Flour));
        Assert.Equal(40m, OnHand(Flour));
    }

    [Fact]
    public void RN04_average_is_rounded_to_four_decimals()
    {
        Post(Req(Flour, 3, MovementType.PurchaseReceipt, cost: 10));
        Post(Req(Flour, 1, MovementType.PurchaseReceipt, cost: 11));
        Post(Req(Flour, 2, MovementType.PurchaseReceipt, cost: 10));

        // (4 × 10.25 + 2 × 10) / 6 = 10.1666…
        Assert.Equal(10.1667m, Average(Flour));
    }

    [Fact]
    public void RN04_entry_with_zero_stock_takes_the_entry_cost()
    {
        Post(Req(Flour, 10, MovementType.PurchaseReceipt, cost: 20));
        Post(Req(Flour, -10, MovementType.Consumption));

        Post(Req(Flour, 5, MovementType.PurchaseReceipt, cost: 35));

        Assert.Equal(35m, Average(Flour));
    }

    [Fact]
    public void RN04_exits_leave_at_the_current_average_and_do_not_change_it()
    {
        Post(Req(Flour, 10, MovementType.PurchaseReceipt, cost: 20));
        Post(Req(Flour, 10, MovementType.PurchaseReceipt, cost: 30));

        var exit = Assert.Single(Post(Req(Flour, -4, MovementType.TransferOut)).Movements);

        Assert.Equal(25m, exit.UnitCost);
        Assert.Equal(-100m, exit.TotalCost);
        Assert.Equal(25m, Average(Flour));
    }

    [Fact]
    public void RN04_adjustment_entry_without_cost_uses_the_current_average()
    {
        Post(Req(Flour, 10, MovementType.PurchaseReceipt, cost: 20));

        var entry = Assert.Single(Post(Req(Flour, 2, MovementType.Adjustment)).Movements);

        Assert.Equal(20m, entry.UnitCost);
        Assert.Equal(20m, Average(Flour));
    }

    [Fact]
    public void RN04_external_entries_require_a_unit_cost() =>
        Assert.Throws<ArgumentException>(() => Post(Req(Flour, 1, MovementType.PurchaseReceipt)));

    // ---------- RN-02: no negative stock ----------

    [Fact]
    public void RN02_exit_beyond_stock_is_rejected_with_the_shortage()
    {
        Post(Req(Flour, 4, MovementType.PurchaseReceipt, cost: 10));

        var ex = Assert.Throws<InsufficientStockException>(() => Post(Req(Flour, -6, MovementType.Consumption)));

        var shortage = Assert.Single(ex.Shortages);
        Assert.Equal((Flour.Id, "HAR-001", 6m, 4m), (shortage.ItemId, shortage.Sku, shortage.Requested, shortage.Available));
    }

    [Fact]
    public void RN02_all_shortages_are_reported_together()
    {
        var lot = AddLot("L1", Today.AddDays(5));
        Post(Req(Flour, 1, MovementType.PurchaseReceipt, cost: 10));
        Post(Req(Milk, 2, MovementType.PurchaseReceipt, cost: 15, lot: lot.Id));

        var ex = Assert.Throws<InsufficientStockException>(() => Post(
            Req(Flour, -3, MovementType.Consumption),
            Req(Milk, -5, MovementType.Consumption)));

        Assert.Equal(2, ex.Shortages.Count);
        Assert.Contains(ex.Shortages, s => s.ItemId == Flour.Id && s.Requested == 3 && s.Available == 1);
        Assert.Contains(ex.Shortages, s => s.ItemId == Milk.Id && s.Requested == 5 && s.Available == 2);
    }

    [Fact]
    public void RN02_is_checked_on_the_resulting_stock_of_the_whole_posting()
    {
        // A count adjustment that removes and re-adds within the same posting never leaves negative stock.
        var result = Post(
            Req(Flour, 5, MovementType.Adjustment),
            Req(Flour, -5, MovementType.Adjustment));

        Assert.Equal(2, result.Movements.Count);
        Assert.Equal(0m, OnHand(Flour));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(0.00001)]
    public void Quantities_must_be_non_zero_with_four_decimals_at_most(decimal qty) =>
        Assert.Throws<BusinessRuleException>(() => Post(Req(Flour, qty, MovementType.Adjustment)));

    // ---------- RN-05: lots and FEFO ----------

    [Fact]
    public void RN05_entries_of_lot_items_require_a_lot()
    {
        var ex = Assert.Throws<BusinessRuleException>(() => Post(Req(Milk, 5, MovementType.PurchaseReceipt, cost: 10)));
        Assert.Equal("lot_required", ex.Code);
    }

    [Fact]
    public void RN05_items_without_lot_control_reject_a_lot()
    {
        var lot = AddLot("L1", null);
        var ex = Assert.Throws<BusinessRuleException>(() => Post(Req(Flour, 5, MovementType.PurchaseReceipt, cost: 10, lot: lot.Id)));
        Assert.Equal("lot_not_allowed", ex.Code);
    }

    [Fact]
    public void RN05_exit_without_lot_is_allocated_first_expired_first_out()
    {
        var late = AddLot("TARDE", Today.AddDays(20));
        var noExpiry = AddLot("SIN-CAD", null);
        var early = AddLot("PRONTO", Today.AddDays(2));
        Post(Req(Milk, 5, MovementType.PurchaseReceipt, 10, late.Id),
             Req(Milk, 5, MovementType.PurchaseReceipt, 10, noExpiry.Id),
             Req(Milk, 5, MovementType.PurchaseReceipt, 10, early.Id));

        var movements = Post(Req(Milk, -12, MovementType.TransferOut)).Movements;

        Assert.Equal([(early.Id, -5m), (late.Id, -5m), (noExpiry.Id, -2m)], movements.Select(m => (m.LotId!.Value, m.Quantity)));
        Assert.Equal(3m, OnHand(Milk, noExpiry.Id));
    }

    [Fact]
    public void RN05_fefo_skips_expired_lots_but_uses_one_expiring_today()
    {
        var expired = AddLot("VENCIDO", Today.AddDays(-1));
        var today = AddLot("HOY", Today);
        Post(Req(Milk, 5, MovementType.Adjustment, lot: expired.Id),
             Req(Milk, 5, MovementType.Adjustment, lot: today.Id));

        var movement = Assert.Single(Post(Req(Milk, -3, MovementType.Consumption)).Movements);

        Assert.Equal(today.Id, movement.LotId);
        Assert.Equal(5m, OnHand(Milk, expired.Id));
    }

    [Fact]
    public void RN05_fefo_without_enough_usable_stock_reports_the_shortage()
    {
        var expired = AddLot("VENCIDO", Today.AddDays(-3));
        var valid = AddLot("VIGENTE", Today.AddDays(3));
        Post(Req(Milk, 10, MovementType.Adjustment, lot: expired.Id),
             Req(Milk, 4, MovementType.Adjustment, lot: valid.Id));

        var ex = Assert.Throws<InsufficientStockException>(() => Post(Req(Milk, -6, MovementType.TransferOut)));

        var shortage = Assert.Single(ex.Shortages);
        Assert.Null(shortage.LotId);
        Assert.Equal((6m, 4m), (shortage.Requested, shortage.Available));
        Assert.Equal(4m, OnHand(Milk, valid.Id)); // a failed allocation applies nothing
    }

    [Theory]
    [InlineData(MovementType.TransferOut)]
    [InlineData(MovementType.ProductionConsumption)]
    [InlineData(MovementType.Consumption)]
    public void RN05_expired_lot_cannot_be_dispatched_used_in_production_or_consumed(MovementType type)
    {
        var expired = AddLot("VENCIDO", Today.AddDays(-1));
        Post(Req(Milk, 5, MovementType.Adjustment, lot: expired.Id));

        var ex = Assert.Throws<BusinessRuleException>(() => Post(Req(Milk, -1, type, lot: expired.Id)));
        Assert.Equal("lot_expired", ex.Code);
    }

    [Theory]
    [InlineData(MovementType.Adjustment)]
    [InlineData(MovementType.Waste)]
    [InlineData(MovementType.PhysicalCountAdjustment)]
    public void RN05_expired_lot_can_be_written_off(MovementType type)
    {
        var expired = AddLot("VENCIDO", Today.AddDays(-1));
        Post(Req(Milk, 5, MovementType.Adjustment, lot: expired.Id));

        Post(Req(Milk, -5, type, lot: expired.Id));

        Assert.Equal(0m, OnHand(Milk, expired.Id));
    }

    [Fact]
    public void Movement_ids_increase_in_posting_order_so_the_database_keeps_that_order()
    {
        var movements = Post(Enumerable.Range(1, 20).Select(i => Req(Flour, i, MovementType.Adjustment)).ToArray()).Movements;

        Assert.Equal(movements.Select(m => m.Id), movements.Select(m => m.Id).Order());
        Assert.Equal(Enumerable.Range(1, 20).Select(i => (decimal)i), movements.Select(m => m.Quantity));
    }

    [Fact]
    public void Lot_must_belong_to_the_item()
    {
        var otherItemLot = new PostingLot(Guid.NewGuid(), Guid.NewGuid(), "AJENO", null);
        _lots[otherItemLot.Id] = otherItemLot;

        var ex = Assert.Throws<BusinessRuleException>(() => Post(Req(Milk, 1, MovementType.Adjustment, lot: otherItemLot.Id)));
        Assert.Equal("lot_mismatch", ex.Code);
    }
}
