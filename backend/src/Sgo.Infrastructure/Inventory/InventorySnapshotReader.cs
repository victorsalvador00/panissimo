using Microsoft.EntityFrameworkCore;
using Sgo.Application.Inventory;
using Sgo.Domain.Inventory;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Inventory;

public sealed class InventorySnapshotReader(SgoDbContext db) : IInventorySnapshotReader
{
    private sealed class SnapshotRow
    {
        public Guid ItemId { get; init; }
        public Guid? LotId { get; init; }
        public decimal Quantity { get; init; }
    }

    public async Task<InventorySnapshot> TakeAsync(Guid locationId, Guid? categoryId, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("TakeAsync must run inside a transaction.");

        // FOR SHARE waits for postings that hold these rows (FOR UPDATE) and blocks new ones until the
        // snapshot commits, so the quantities and the last kardex sequence describe the same instant.
        var rows = await db.Database.SqlQuery<SnapshotRow>($"""
            SELECT b.item_id, b.lot_id, b.quantity
            FROM inventory.stock_balance b
            JOIN catalog.item i ON i.id = b.item_id
            WHERE b.location_id = {locationId}
              AND ({categoryId}::uuid IS NULL OR i.category_id = {categoryId}::uuid)
            ORDER BY b.item_id, b.lot_id NULLS FIRST
            FOR SHARE OF b
            """).ToListAsync(ct);

        var sequence = await db.InventoryMovements.MaxAsync(m => (long?)m.Sequence, ct) ?? 0;

        return new InventorySnapshot(sequence, rows.Where(r => r.Quantity != 0)
            .Select(r => new SnapshotLine(r.ItemId, r.LotId, r.Quantity)).ToList());
    }

    public async Task<decimal> QuantityAtAsync(Guid locationId, Guid itemId, Guid? lotId, long sequence, CancellationToken ct) =>
        await db.InventoryMovements
            .Where(m => m.LocationId == locationId && m.ItemId == itemId && m.LotId == lotId && m.Sequence <= sequence)
            .SumAsync(m => m.Quantity, ct);
}
