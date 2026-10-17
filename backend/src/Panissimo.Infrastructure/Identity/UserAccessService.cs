using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Primitives;
using Panissimo.Application.Security;
using Panissimo.Domain.Security;
using Panissimo.Infrastructure.Persistence;

namespace Panissimo.Infrastructure.Identity;

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

/// <summary>Effective permissions and locations of a user, cached 5 minutes (backend §9).</summary>
public sealed class UserAccessService(AppDbContext db, IMemoryCache cache, UserAccessCacheSignal signal) : IUserAccessService
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
        var locations = await db.Locations.AsNoTracking().Select(l => new { l.Id, l.ParentLocationId }).ToListAsync(ct);
        if (allLocations)
        {
            var every = locations.Select(l => l.Id).ToHashSet();
            return new UserAccess(user.Id, user.IsActive, permissions.ToHashSet(), true, every, every);
        }

        // B-26: a plant or branch brings its sub-warehouses; a sub-warehouse alone moves only its own stock but shows its
        // parent's documents.
        var assigned = await db.UserLocations.Where(ul => ul.UserId == userId).Select(ul => ul.LocationId).ToListAsync(ct);
        var parents = locations.Where(l => l.ParentLocationId is not null).ToDictionary(l => l.Id, l => l.ParentLocationId!.Value);
        var stock = new HashSet<Guid>();
        var visible = new HashSet<Guid>();
        foreach (var id in assigned)
        {
            stock.Add(id);
            visible.Add(id);
            if (parents.TryGetValue(id, out var parent))
            {
                visible.Add(parent);
                continue;
            }
            foreach (var child in parents.Where(p => p.Value == id).Select(p => p.Key))
            {
                stock.Add(child);
                visible.Add(child);
            }
        }
        return new UserAccess(user.Id, user.IsActive, permissions.ToHashSet(), false, visible, stock);
    }
}
