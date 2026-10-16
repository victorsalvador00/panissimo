using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.Domain.Common;
using Sgo.Domain.Inventory;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Inventory;

public sealed class LotAllocator(SgoDbContext db, IClock clock) : ILotAllocator
{
    public async Task<IReadOnlyList<LotAllocation>> AllocateAsync(Guid locationId, Guid itemId, decimal quantity, CancellationToken ct)
    {
        var item = await db.Items.AsNoTracking().Where(i => i.Id == itemId)
                       .Select(i => new { i.Id, i.Sku, i.Name }).SingleOrDefaultAsync(ct)
                   ?? throw new NotFoundException("el artículo", itemId);

        var lots = await (from b in db.StockBalances.AsNoTracking()
                          join l in db.Lots on b.LotId equals l.Id
                          where b.LocationId == locationId && b.ItemId == itemId && b.Quantity > 0
                          select new FefoAllocator.LotStock(l.Id, l.LotNumber, l.ExpirationDate, b.Quantity))
            .ToListAsync(ct);

        var allocations = FefoAllocator.Allocate(lots, quantity, clock.BusinessDate(), out var usable)
                          ?? throw new InsufficientStockException([new StockShortage(item.Id, item.Sku, item.Name, null, quantity, usable)]);

        return allocations.Select(a => new LotAllocation(a.LotId, a.Quantity)).ToList();
    }
}

/// <remarks>
/// Two documents that bring the same new lot at the same time (two receipts of different POs, for example) would
/// both miss it and the second insert would break the unique (item, lot number) index. The lock makes the second
/// one wait for the first commit and then reuse the lot.
/// </remarks>
public sealed class LotRegistry(SgoDbContext db, IClock clock, ITransactionLocks locks) : ILotRegistry
{
    public async Task<Lot> GetOrCreateAsync(Guid itemId, string lotNumber, DateOnly? expirationDate,
        string sourceDocType, Guid sourceDocId, CancellationToken ct)
    {
        var number = lotNumber.Trim();
        var lot = db.Lots.Local.FirstOrDefault(l => l.ItemId == itemId && l.LotNumber == number);
        if (lot is null)
        {
            await locks.AcquireAsync(TransactionLockScopes.Lot, $"{itemId}:{number}", ct);
            lot = await db.Lots.SingleOrDefaultAsync(l => l.ItemId == itemId && l.LotNumber == number, ct);
        }

        if (lot is null)
        {
            lot = new Lot(itemId, number, expirationDate, sourceDocType, sourceDocId, clock.UtcNow);
            db.Lots.Add(lot);
            return lot;
        }

        if (lot.ExpirationDate != expirationDate)
            throw new BusinessRuleException("lot_expiration_mismatch",
                $"El lote {number} ya existe con caducidad {lot.ExpirationDate:dd/MM/yyyy}; no puede registrarse con otra fecha.");
        return lot;
    }
}
