using Sgo.Domain.Common;

namespace Sgo.Application.Common;

public static class ConcurrencyExtensions
{
    /// <summary>
    /// Makes the next SaveChanges compare against the version the client sent.
    /// Fails fast with <see cref="ConcurrencyException"/> when it already differs from the loaded row;
    /// a concurrent write between load and save surfaces as a 409 as well.
    /// </summary>
    public static void EnsureVersion<TEntity>(this ISgoDbContext db, TEntity entity, uint expectedVersion)
        where TEntity : class, IVersioned
    {
        if (entity.Version != expectedVersion)
            throw new ConcurrencyException();
        db.Entry(entity).Property(e => e.Version).OriginalValue = expectedVersion;
    }
}
