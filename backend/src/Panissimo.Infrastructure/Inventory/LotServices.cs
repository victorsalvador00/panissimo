using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Application.Inventory;
using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;
using Panissimo.Domain.Purchasing;
using Panissimo.Infrastructure.Persistence;

namespace Panissimo.Infrastructure.Inventory;

public sealed class LotAllocator(AppDbContext db, IClock clock) : ILotAllocator
{
    public async Task<IReadOnlyList<LotAllocation>> AllocateAsync(Guid locationId, Guid itemId, decimal quantity, CancellationToken ct)
    {
        var item = await db.Items.AsNoTracking().Where(i => i.Id == itemId)
                       .Select(i => new { i.Id, i.Sku, i.Name }).SingleOrDefaultAsync(ct)
                   ?? throw new NotFoundException("el artículo", itemId);

        var lots = await (from b in db.StockBalances.AsNoTracking()
                          join l in db.Lots on b.LotId equals l.Id
                          where b.LocationId == locationId && b.ItemId == itemId && b.Quantity > 0
                          select new FefoAllocator.LotStock(l.Id, l.LotNumber, l.ExpirationDate, l.CreatedAt, b.Quantity))
            .ToListAsync(ct);

        var allocations = FefoAllocator.Allocate(lots, quantity, clock.BusinessDate(), out var usable)
                          ?? throw new InsufficientStockException([new StockShortage(item.Id, item.Sku, item.Name, null, null, quantity, usable)]);

        return allocations.Select(a => new LotAllocation(a.LotId, a.Quantity)).ToList();
    }
}

/// <remarks>
/// Two documents that bring the same new lot at the same time (two receipts, for example) would both miss it and the
/// second insert would break the unique (item, lot number) index. The lock makes the second one wait for the first
/// commit and then reuse the lot.
/// </remarks>
public sealed class LotRegistry(AppDbContext db, IClock clock, ITransactionLocks locks) : ILotRegistry
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
            lot = new Lot(itemId, number, await NewLotExpirationAsync(itemId, expirationDate, ct), sourceDocType, sourceDocId, clock.UtcNow);
            db.Lots.Add(lot);
            return lot;
        }

        // RN-05: without a captured expiration, an existing lot keeps its own.
        if (expirationDate is not null && lot.ExpirationDate != expirationDate)
            throw new BusinessRuleException("lot_expiration_mismatch",
                $"El lote {number} ya existe con caducidad {lot.ExpirationDate:dd/MM/yyyy}; no puede registrarse con otra fecha.");
        return lot;
    }

    public async Task<Lot> CreateNextAsync(Guid itemId, string prefix, DateOnly? expirationDate, string sourceDocType, Guid sourceDocId, CancellationToken ct)
    {
        await locks.AcquireAsync(TransactionLockScopes.Lot, $"{itemId}:{prefix}", ct);
        // The lots of this document not saved yet count too: two lines of the same item get 01 and 02.
        var existing = await db.Lots.Where(l => l.ItemId == itemId && l.LotNumber.StartsWith(prefix)).Select(l => l.LotNumber).ToListAsync(ct);
        existing.AddRange(db.Lots.Local.Where(l => l.ItemId == itemId && l.LotNumber.StartsWith(prefix, StringComparison.Ordinal)).Select(l => l.LotNumber));

        var lot = new Lot(itemId, PurchaseLotNumber.Next(prefix, existing), await NewLotExpirationAsync(itemId, expirationDate, ct),
            sourceDocType, sourceDocId, clock.UtcNow);
        db.Lots.Add(lot);
        return lot;
    }

    /// <summary>RN-05: without a captured expiration, a new lot expires ShelfLifeDays after the business date.</summary>
    private async Task<DateOnly?> NewLotExpirationAsync(Guid itemId, DateOnly? expirationDate, CancellationToken ct) =>
        expirationDate is null
        && await db.Items.Where(i => i.Id == itemId).Select(i => i.ShelfLifeDays).SingleOrDefaultAsync(ct) is { } shelfLife
            ? clock.BusinessDate().AddDays(shelfLife)
            : expirationDate;
}
