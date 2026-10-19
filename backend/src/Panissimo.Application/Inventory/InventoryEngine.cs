using Panissimo.Domain.Common;
using Panissimo.Domain.Inventory;

namespace Panissimo.Application.Inventory;

/// <summary>
/// The only way to move inventory (RN-01, CLAUDE.md rule 2). Must be called inside a transaction opened
/// by the use case, which then calls SaveChanges and Commit. On any error nothing must be committed.
/// </summary>
public interface IInventoryPostingService
{
    /// <exception cref="InsufficientStockException">RN-02, with every shortage.</exception>
    /// <exception cref="BusinessRuleException">RN-03b, RN-05 lot rules and invalid quantities.</exception>
    Task<IReadOnlyList<InventoryMovement>> PostAsync(IEnumerable<MovementRequest> requests, CancellationToken ct);

    /// <summary>
    /// Locks the (location, item) rows a posting would lock, in the same order, so a use case that reserves stock
    /// (RN-110) reads and holds it without racing a concurrent exit. Inside the use case's transaction.
    /// </summary>
    Task LockAsync(IEnumerable<(Guid LocationId, Guid ItemId)> pairs, CancellationToken ct);
}

public sealed record LotAllocation(Guid LotId, decimal Quantity);

public interface ILotAllocator
{
    /// <summary>
    /// FEFO preview (RN-05) of <paramref name="quantity"/> (positive, base unit) without locking.
    /// Excludes expired lots; throws <see cref="InsufficientStockException"/> if the usable stock is not enough.
    /// </summary>
    Task<IReadOnlyList<LotAllocation>> AllocateAsync(Guid locationId, Guid itemId, decimal quantity, CancellationToken ct);
}

public interface ILotRegistry
{
    /// <summary>
    /// Returns the lot <paramref name="lotNumber"/> of the item, creating it (not saved yet) if new. Takes the
    /// (item, lot) transaction lock, so it requires an open transaction. RN-05: a null expiration means "the existing
    /// lot's" or, for a new lot, business date + ShelfLifeDays (none if the item has no shelf life). An existing lot
    /// with a different captured expiration is an error.
    /// </summary>
    Task<Lot> GetOrCreateAsync(Guid itemId, string lotNumber, DateOnly? expirationDate,
        string sourceDocType, Guid sourceDocId, CancellationToken ct);
}
