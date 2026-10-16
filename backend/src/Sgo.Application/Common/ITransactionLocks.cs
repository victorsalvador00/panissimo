namespace Sgo.Application.Common;

/// <summary>
/// Transaction-scoped locks for writers that would otherwise race to insert the same unique row
/// (a new lot, the preferred supplier of an item): the second one waits and then sees the first one's commit.
/// </summary>
public interface ITransactionLocks
{
    /// <summary>Waits for the lock on <paramref name="scope"/>/<paramref name="key"/> and holds it until the current transaction ends.</summary>
    /// <exception cref="InvalidOperationException">No transaction is open.</exception>
    Task AcquireAsync(string scope, string key, CancellationToken ct);
}

public static class TransactionLockScopes
{
    public const string Lot = "lot";
    public const string PreferredSupplier = "preferred-supplier";
}
