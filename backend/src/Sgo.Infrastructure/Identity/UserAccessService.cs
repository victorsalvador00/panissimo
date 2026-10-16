using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;
using Sgo.Application.Security;
using Sgo.Domain.Security;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

/// <summary>Lets <see cref="IUserAccessService.InvalidateAll"/> evict every cached entry at once.</summary>
public sealed class UserAccessCacheSignal
{
    private CancellationTokenSource _source = new();

    public IChangeToken Token => new CancellationChangeToken(_source.Token);

    public void Reset()
    {
        var previous = Interlocked.Exchange(ref _source, new CancellationTokenSource());
        previous.Cancel();
        previous.Dispose();
    }
}

public sealed class UserAccessService(SgoDbContext db, IMemoryCache cache, UserAccessCacheSignal signal) : IUserAccessService
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);

    private static string Key(Guid userId) => $"user-access:{userId}";

    public async Task<UserAccess?> GetAsync(Guid userId, CancellationToken ct = default)
    {
        if (cache.TryGetValue(Key(userId), out UserAccess? cached))
            return cached;

        var access = await LoadAsync(userId, ct);
        if (access is not null)
        {
            using var entry = cache.CreateEntry(Key(userId));
            entry.Value = access;
            entry.AbsoluteExpirationRelativeToNow = Ttl;
            entry.AddExpirationToken(signal.Token);
        }
        return access;
    }

    public void Invalidate(Guid userId) => cache.Remove(Key(userId));

    public void InvalidateAll() => signal.Reset();

    private async Task<UserAccess?> LoadAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.Id, u.IsActive })
            .SingleOrDefaultAsync(ct);
        if (user is null)
            return null;

        var permissions = await db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Join(db.RolePermissions, ur => ur.RoleId, rp => rp.RoleId, (_, rp) => rp.PermissionCode)
            .Distinct()
            .ToListAsync(ct);

        var allLocations = permissions.Contains(Permissions.LocationsAll);
        var locationIds = allLocations
            ? await db.Locations.Select(l => l.Id).ToListAsync(ct)
            : await db.UserLocations.Where(ul => ul.UserId == userId).Select(ul => ul.LocationId).ToListAsync(ct);

        return new UserAccess(user.Id, user.IsActive, permissions.ToHashSet(), allLocations, locationIds.ToHashSet());
    }
}
