using Microsoft.EntityFrameworkCore;
using Panissimo.Application.Common;
using Panissimo.Domain.Common;

namespace Panissimo.Infrastructure.Persistence;

public sealed class FolioGenerator(AppDbContext db) : IFolioGenerator
{
    public async Task<string> NextAsync(DocType docType, CancellationToken ct = default)
    {
        var definition = Folio.Definitions[docType];
        // Schema and sequence names come from a fixed internal table, never from user input.
        var sql = $"SELECT nextval('\"{definition.Schema}\".\"{definition.SequenceName}\"') AS \"Value\"";
        var number = await db.Database.SqlQueryRaw<long>(sql).SingleAsync(ct);
        return Folio.Format(docType, number);
    }

    public async Task<IReadOnlyList<string>> NextManyAsync(DocType docType, int count, CancellationToken ct = default)
    {
        if (count <= 0)
            return [];
        var definition = Folio.Definitions[docType];
        var sql = $"SELECT nextval('\"{definition.Schema}\".\"{definition.SequenceName}\"') AS \"Value\" FROM generate_series(1, {count})";
        var numbers = await db.Database.SqlQueryRaw<long>(sql).ToListAsync(ct);
        return numbers.Order().Select(n => Folio.Format(docType, n)).ToList();
    }
}

/// <summary>
/// PostgreSQL advisory locks released at commit or rollback. The key is hashed to 64 bits: a collision only
/// serializes two unrelated writers, it never lets two conflicting ones through.
/// </summary>
public sealed class PostgresTransactionLocks(AppDbContext db) : ITransactionLocks
{
    public async Task AcquireAsync(string scope, string key, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException($"The '{scope}' lock requires an open transaction.");

        var lockKey = $"{scope}:{key}";
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
    }
}

public sealed class UserDirectory(AppDbContext db) : IUserDirectory
{
    public async Task<UserNames> GetNamesAsync(IEnumerable<Guid?> userIds, CancellationToken ct)
    {
        var ids = userIds.OfType<Guid>().Distinct().ToList();
        if (ids.Count == 0)
            return UserNames.Empty;

        var names = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        return new UserNames(names);
    }
}
