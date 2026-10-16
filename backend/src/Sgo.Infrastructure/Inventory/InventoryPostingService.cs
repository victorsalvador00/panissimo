using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Inventory;

/// <summary>
/// Backend spec §5. Locks every affected row with SELECT … FOR UPDATE in (location, item, lot) order,
/// then delegates the math to <see cref="InventoryPostingCalculator"/>. Does not save: the use case does.
/// </summary>
public sealed class InventoryPostingService(SgoDbContext db, IClock clock, ICurrentUser currentUser) : IInventoryPostingService
{
    public async Task<IReadOnlyList<InventoryMovement>> PostAsync(IEnumerable<MovementRequest> requests, CancellationToken ct)
    {
        var list = requests.ToList();
        if (list.Count == 0)
            return [];
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("IInventoryPostingService.PostAsync must run inside a transaction opened by the use case.");

        var items = await LoadItemsAsync(list, ct);
        var explicitLots = await LoadExplicitLotsAsync(list, items, ct);
        await EnsureLocationsExistAsync(list, ct);

        // 1. Make sure the rows exist (ON CONFLICT: concurrent creators do not collide), in a stable order.
        var pairs = list.Select(r => (r.LocationId, r.ItemId)).Distinct()
            .OrderBy(p => p.LocationId).ThenBy(p => p.ItemId).ToList();
        foreach (var (locationId, itemId) in pairs)
            await db.Database.ExecuteSqlAsync(
                $"INSERT INTO inventory.item_location_cost (location_id, item_id, average_cost) VALUES ({locationId}, {itemId}, 0) ON CONFLICT DO NOTHING", ct);

        var balanceKeys = list.Where(r => r.LotId is not null || !items[r.ItemId].TracksLots) // FEFO exits use existing lot rows
            .Select(r => (r.LocationId, r.ItemId, r.LotId)).Distinct()
            .OrderBy(k => k.LocationId).ThenBy(k => k.ItemId).ThenBy(k => k.LotId).ToList();
        foreach (var (locationId, itemId, lotId) in balanceKeys)
            await InsertBalanceIfMissingAsync(locationId, itemId, lotId, ct);

        // 2. Lock: costs first, then balances; both ordered, so two postings never wait on each other in a cycle.
        var locationIds = pairs.Select(p => p.LocationId).ToArray();
        var itemIds = pairs.Select(p => p.ItemId).ToArray();
        var costs = await db.ItemLocationCosts.FromSql($"""
            SELECT * FROM inventory.item_location_cost
            WHERE (location_id, item_id) IN (SELECT * FROM unnest({locationIds}, {itemIds}))
            ORDER BY location_id, item_id
            FOR UPDATE
            """).ToListAsync(ct);
        var balances = await db.StockBalances.FromSql($"""
            SELECT * FROM inventory.stock_balance
            WHERE (location_id, item_id) IN (SELECT * FROM unnest({locationIds}, {itemIds}))
            ORDER BY location_id, item_id, lot_id NULLS FIRST
            FOR UPDATE
            """).ToListAsync(ct);

        var lotIds = balances.Where(b => b.LotId is not null).Select(b => b.LotId!.Value).Except(explicitLots.Keys).ToList();
        var lots = new Dictionary<Guid, PostingLot>(explicitLots);
        foreach (var lot in await db.Lots.AsNoTracking().Where(l => lotIds.Contains(l.Id))
                     .Select(l => new PostingLot(l.Id, l.ItemId, l.LotNumber, l.ExpirationDate)).ToListAsync(ct))
            lots[lot.Id] = lot;

        // 3. Calculate (RN-02, RN-04, RN-05).
        var now = clock.UtcNow;
        var state = new PostingState
        {
            Items = items,
            Lots = lots,
            Balances = balances,
            Costs = costs.ToDictionary(c => (c.LocationId, c.ItemId)),
            OccurredAt = now,
            BusinessDate = BusinessCalendar.ToBusinessDate(now),
            UserId = currentUser.UserId,
        };

        PostingResult result;
        try
        {
            result = InventoryPostingCalculator.Calculate(list, state);
        }
        catch
        {
            // The calculator may have touched tracked rows before failing: never let them reach SaveChanges.
            foreach (var entry in db.ChangeTracker.Entries().Where(e => e.Entity is StockBalance or ItemLocationCost))
                entry.CurrentValues.SetValues(entry.OriginalValues);
            throw;
        }

        // 4. Stage the changes; the use case saves and commits.
        db.StockBalances.AddRange(result.NewBalances);
        db.ItemLocationCosts.AddRange(result.NewCosts);
        db.InventoryMovements.AddRange(result.Movements);
        return result.Movements;
    }

    private async Task<Dictionary<Guid, PostingItem>> LoadItemsAsync(List<MovementRequest> list, CancellationToken ct)
    {
        var ids = list.Select(r => r.ItemId).Distinct().ToList();
        var items = await db.Items.AsNoTracking().Where(i => ids.Contains(i.Id))
            .Select(i => new PostingItem(i.Id, i.Sku, i.Name, i.TracksLots))
            .ToDictionaryAsync(i => i.Id, ct);
        if (items.Count != ids.Count)
            throw new BusinessRuleException("item_not_found", "Uno o más artículos no existen.");
        return items;
    }

    private async Task<Dictionary<Guid, PostingLot>> LoadExplicitLotsAsync(
        List<MovementRequest> list, Dictionary<Guid, PostingItem> items, CancellationToken ct)
    {
        var ids = list.Where(r => r.LotId is not null).Select(r => r.LotId!.Value).Distinct().ToList();
        var lots = await db.Lots.AsNoTracking().Where(l => ids.Contains(l.Id))
            .Select(l => new PostingLot(l.Id, l.ItemId, l.LotNumber, l.ExpirationDate))
            .ToDictionaryAsync(l => l.Id, ct);

        // Lots created in this same unit of work (e.g. a receipt) are not in the database yet.
        foreach (var local in db.Lots.Local.Where(l => ids.Contains(l.Id) && !lots.ContainsKey(l.Id)))
            lots[local.Id] = new PostingLot(local.Id, local.ItemId, local.LotNumber, local.ExpirationDate);

        foreach (var request in list.Where(r => r.LotId is not null))
        {
            var item = items[request.ItemId];
            if (!item.TracksLots)
                throw new BusinessRuleException("lot_not_allowed", $"El artículo {item.Sku} no maneja lotes.");
            if (!lots.TryGetValue(request.LotId!.Value, out var lot) || lot.ItemId != item.Id)
                throw new BusinessRuleException("lot_mismatch", $"El lote indicado no pertenece al artículo {item.Sku}.");
        }
        return lots;
    }

    private async Task EnsureLocationsExistAsync(List<MovementRequest> list, CancellationToken ct)
    {
        var ids = list.Select(r => r.LocationId).Distinct().ToList();
        if (await db.Locations.CountAsync(l => ids.Contains(l.Id), ct) != ids.Count)
            throw new BusinessRuleException("location_not_found", "Una o más ubicaciones no existen.");
    }

    private async Task InsertBalanceIfMissingAsync(Guid locationId, Guid itemId, Guid? lotId, CancellationToken ct)
    {
        // A lot created in this unit of work must be saved first so the foreign key holds.
        if (lotId is { } id && db.Lots.Local.Any(l => l.Id == id) && db.Entry(db.Lots.Local.First(l => l.Id == id)).State == EntityState.Added)
            await db.SaveChangesAsync(ct);

        await db.Database.ExecuteSqlRawAsync(
            """
            INSERT INTO inventory.stock_balance (id, location_id, item_id, lot_id, quantity)
            VALUES (@id, @location, @item, @lot, 0)
            ON CONFLICT (location_id, item_id, lot_id) DO NOTHING
            """,
            [
                new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = Guid.CreateVersion7() },
                new NpgsqlParameter("location", NpgsqlDbType.Uuid) { Value = locationId },
                new NpgsqlParameter("item", NpgsqlDbType.Uuid) { Value = itemId },
                new NpgsqlParameter("lot", NpgsqlDbType.Uuid) { Value = (object?)lotId ?? DBNull.Value },
            ],
            ct);
    }
}
