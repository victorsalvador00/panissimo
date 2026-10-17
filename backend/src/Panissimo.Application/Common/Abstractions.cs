using Panissimo.Domain.Common;

namespace Panissimo.Application.Common;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}

public static class BusinessCalendar
{
    /// <summary>Dates are stored in UTC; the business date is computed in Mexico City (dominio §3).</summary>
    public static readonly TimeZoneInfo TimeZone = TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City");

    public static DateOnly ToBusinessDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, TimeZone).DateTime);

    public static DateOnly BusinessDate(this IClock clock) => ToBusinessDate(clock.UtcNow);
}

public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    string? IpAddress { get; }
}

public interface IFolioGenerator
{
    /// <summary>
    /// Returns the next folio for the document type (e.g. <c>OC-000001</c>).
    /// Backed by a Postgres sequence: numbers are unique but a rolled-back transaction leaves a gap.
    /// </summary>
    Task<string> NextAsync(DocType docType, CancellationToken ct = default);

    /// <summary><paramref name="count"/> folios in one round trip, in increasing order (imports, plan).</summary>
    Task<IReadOnlyList<string>> NextManyAsync(DocType docType, int count, CancellationToken ct = default);
}

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

/// <summary>
/// Full names of users for document DTOs (<c>createdByName</c>…). Users live in the Identity store,
/// so services look them up in one query per document or page instead of joining.
/// </summary>
public interface IUserDirectory
{
    Task<UserNames> GetNamesAsync(IEnumerable<Guid?> userIds, CancellationToken ct);
}

public sealed class UserNames(IReadOnlyDictionary<Guid, string> names)
{
    public static readonly UserNames Empty = new(new Dictionary<Guid, string>());

    /// <summary>The name, or null for a null id or a user that no longer exists.</summary>
    public string? Of(Guid? userId) => userId is { } id && names.TryGetValue(id, out var name) ? name : null;
}
