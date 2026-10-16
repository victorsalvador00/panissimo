using Sgo.Domain.Common;

namespace Sgo.Domain.Inventory;

public sealed record PostingItem(Guid Id, string Sku, string Name, bool TracksLots);

public sealed record PostingLot(Guid Id, Guid ItemId, string LotNumber, DateOnly? ExpirationDate)
{
    public bool IsExpired(DateOnly businessDate) => ExpirationDate < businessDate;
}

/// <summary>
/// Current state for a posting: every balance row of the involved (location, item) pairs, all lots, and costs.
/// The infrastructure loads it with row locks; unit tests build it in memory.
/// </summary>
public sealed class PostingState
{
    public required IReadOnlyDictionary<Guid, PostingItem> Items { get; init; }
    public required IReadOnlyDictionary<Guid, PostingLot> Lots { get; init; }
    public required List<StockBalance> Balances { get; init; }
    public required Dictionary<(Guid LocationId, Guid ItemId), ItemLocationCost> Costs { get; init; }
    public required DateTimeOffset OccurredAt { get; init; }
    public required DateOnly BusinessDate { get; init; }
    public Guid? UserId { get; init; }
}

public sealed record PostingResult(
    IReadOnlyList<InventoryMovement> Movements,
    IReadOnlyList<StockBalance> NewBalances,
    IReadOnlyList<ItemLocationCost> NewCosts);

/// <summary>
/// Pure core of the inventory engine (backend spec §5): applies requests in order over the given state.
/// RN-02 no negative stock (all shortages reported together) · RN-04 weighted average cost ·
/// RN-05 lots required/forbidden per item, FEFO for unspecified lots, no expired lots on dispatch/production/consumption.
/// </summary>
public static class InventoryPostingCalculator
{
    private sealed class Tally
    {
        public decimal Initial;
        public decimal Entries;
        public decimal Exits;
    }

    public static PostingResult Calculate(IReadOnlyList<MovementRequest> requests, PostingState state)
    {
        var movements = new List<InventoryMovement>();
        var newBalances = new List<StockBalance>();
        var newCosts = new List<ItemLocationCost>();
        var tallies = new Dictionary<StockBalance, Tally>(ReferenceEqualityComparer.Instance);
        var shortages = new List<StockShortage>();

        foreach (var request in requests)
        {
            var item = Validate(request, state);
            var cost = CostOf(request.LocationId, request.ItemId);
            var onHand = state.Balances.Where(b => b.LocationId == request.LocationId && b.ItemId == request.ItemId).Sum(b => b.Quantity);

            if (request.Quantity > 0)
            {
                var unitCost = request.UnitCost ?? cost.AverageCost;
                cost.Set(InventoryMath.AverageAfterEntry(onHand, cost.AverageCost, request.Quantity, unitCost));

                var balance = BalanceOf(request.LocationId, request.ItemId, request.LotId);
                TallyOf(balance).Entries += request.Quantity;
                balance.Add(request.Quantity);
                movements.Add(new InventoryMovement(movements.Count, state.OccurredAt, state.BusinessDate, request, request.LotId,
                    request.Quantity, InventoryMath.Round(unitCost), state.UserId));
                continue;
            }

            // Exits leave at the current average cost of the location (RN-04).
            var exitCost = cost.AverageCost;
            var requested = -request.Quantity;

            if (item.TracksLots && request.LotId is null)
            {
                var lots = state.Balances
                    .Where(b => b.LocationId == request.LocationId && b.ItemId == request.ItemId && b.LotId is not null)
                    .Select(b => (Balance: b, Lot: state.Lots[b.LotId!.Value]))
                    .ToList();
                var allocations = FefoAllocator.Allocate(
                    lots.Select(x => new FefoAllocator.LotStock(x.Lot.Id, x.Lot.LotNumber, x.Lot.ExpirationDate, x.Balance.Quantity)),
                    requested, state.BusinessDate, out var usable);

                if (allocations is null)
                {
                    shortages.Add(new StockShortage(item.Id, item.Sku, item.Name, null, requested, usable));
                    continue;
                }

                foreach (var allocation in allocations)
                {
                    var balance = lots.Single(x => x.Lot.Id == allocation.LotId).Balance;
                    TallyOf(balance).Exits += allocation.Quantity;
                    balance.Add(-allocation.Quantity);
                    movements.Add(new InventoryMovement(movements.Count, state.OccurredAt, state.BusinessDate, request, allocation.LotId,
                        -allocation.Quantity, exitCost, state.UserId));
                }
                continue;
            }

            if (request.LotId is { } lotId && state.Lots[lotId].IsExpired(state.BusinessDate) && request.Type.RejectsExpiredLots())
                throw new BusinessRuleException("lot_expired",
                    $"El lote {state.Lots[lotId].LotNumber} de {item.Sku} está vencido; no puede despacharse, consumirse ni usarse en producción. Dalo de baja con un ajuste.");

            var exitBalance = BalanceOf(request.LocationId, request.ItemId, request.LotId);
            TallyOf(exitBalance).Exits += requested;
            exitBalance.Add(request.Quantity);
            movements.Add(new InventoryMovement(movements.Count, state.OccurredAt, state.BusinessDate, request, request.LotId,
                request.Quantity, exitCost, state.UserId));
        }

        // RN-02: the resulting stock of every (location, item, lot) must be ≥ 0.
        foreach (var (balance, tally) in tallies.Where(t => t.Key.Quantity < 0))
        {
            var item = state.Items[balance.ItemId];
            shortages.Add(new StockShortage(item.Id, item.Sku, item.Name, balance.LotId, tally.Exits, tally.Initial + tally.Entries));
        }

        if (shortages.Count > 0)
            throw new InsufficientStockException(shortages);

        return new PostingResult(movements, newBalances, newCosts);

        ItemLocationCost CostOf(Guid locationId, Guid itemId)
        {
            if (!state.Costs.TryGetValue((locationId, itemId), out var cost))
            {
                cost = new ItemLocationCost(locationId, itemId);
                state.Costs[(locationId, itemId)] = cost;
                newCosts.Add(cost);
            }
            return cost;
        }

        StockBalance BalanceOf(Guid locationId, Guid itemId, Guid? lotId)
        {
            var balance = state.Balances.SingleOrDefault(b => b.LocationId == locationId && b.ItemId == itemId && b.LotId == lotId);
            if (balance is null)
            {
                balance = new StockBalance(locationId, itemId, lotId);
                state.Balances.Add(balance);
                newBalances.Add(balance);
            }
            return balance;
        }

        Tally TallyOf(StockBalance balance)
        {
            if (!tallies.TryGetValue(balance, out var tally))
                tallies[balance] = tally = new Tally { Initial = balance.Quantity };
            return tally;
        }
    }

    private static PostingItem Validate(MovementRequest request, PostingState state)
    {
        if (!state.Items.TryGetValue(request.ItemId, out var item))
            throw new BusinessRuleException("item_not_found", "El artículo no existe.");

        if (request.Quantity == 0)
            throw new BusinessRuleException("invalid_quantity", $"La cantidad de {item.Sku} no puede ser cero.");
        if (InventoryMath.Round(request.Quantity) != request.Quantity)
            throw new BusinessRuleException("invalid_quantity", $"La cantidad de {item.Sku} admite máximo {InventoryMath.Decimals} decimales.");
        if (request.Type.OnlyEntries() && request.Quantity < 0)
            throw new ArgumentException($"{request.Type} must be an entry (positive quantity).");
        if (request.Type.OnlyExits() && request.Quantity > 0)
            throw new ArgumentException($"{request.Type} must be an exit (negative quantity).");

        if (request.Quantity > 0 && request.Type.IsExternalEntry() && request.UnitCost is null)
            throw new ArgumentException($"{request.Type} requires a unit cost (RN-04).");
        if (request.UnitCost is < 0)
            throw new BusinessRuleException("invalid_unit_cost", $"El costo de {item.Sku} no puede ser negativo.");

        if (request.LotId is { } lotId)
        {
            if (!item.TracksLots)
                throw new BusinessRuleException("lot_not_allowed", $"El artículo {item.Sku} no maneja lotes.");
            if (!state.Lots.TryGetValue(lotId, out var lot) || lot.ItemId != item.Id)
                throw new BusinessRuleException("lot_mismatch", $"El lote indicado no pertenece al artículo {item.Sku}.");
        }
        else if (item.TracksLots && request.Quantity > 0)
        {
            throw new BusinessRuleException("lot_required", $"El artículo {item.Sku} maneja lotes: indica el lote de la entrada.");
        }

        return item;
    }
}
