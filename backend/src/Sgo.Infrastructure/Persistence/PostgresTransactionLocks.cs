using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;

namespace Sgo.Infrastructure.Persistence;

/// <summary>
/// PostgreSQL advisory locks released at commit or rollback. The key is hashed to 64 bits: a collision only
/// serializes two unrelated writers, it never lets two conflicting ones through.
/// </summary>
public sealed class PostgresTransactionLocks(SgoDbContext db) : ITransactionLocks
{
    public async Task AcquireAsync(string scope, string key, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException($"The '{scope}' lock requires an open transaction.");

        var lockKey = $"{scope}:{key}";
        await db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0))", ct);
    }
}
