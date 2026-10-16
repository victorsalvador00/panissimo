using Sgo.Domain.Common;
using Sgo.Domain.Inventory;

namespace Sgo.Application.Inventory;

/// <summary>
/// The only way to move inventory (RN-01, CLAUDE.md rule 2). Must be called inside a transaction opened
/// by the use case, which then calls SaveChanges and Commit. On any error nothing must be committed.
/// </summary>
public interface IInventoryPostingService
{
    /// <exception cref="InsufficientStockException">RN-02, with every shortage.</exception>
    /// <exception cref="BusinessRuleException">RN-05 lot rules and invalid quantities.</exception>
    Task<IReadOnlyList<InventoryMovement>> PostAsync(IEnumerable<MovementRequest> requests, CancellationToken ct);
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
    /// Returns the lot <paramref name="lotNumber"/> of the item, creating it (not saved yet) if new.
    /// An existing lot with a different expiration date is an error.
    /// </summary>
    Task<Lot> GetOrCreateAsync(Guid itemId, string lotNumber, DateOnly? expirationDate,
        string sourceDocType, Guid sourceDocId, CancellationToken ct);
}
