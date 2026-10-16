using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

public sealed class UserDirectory(SgoDbContext db) : IUserDirectory
{
    public async Task<UserNames> GetNamesAsync(IEnumerable<Guid?> userIds, CancellationToken ct)
    {
        var ids = userIds.OfType<Guid>().Distinct().ToList();
        if (ids.Count == 0)
            return new UserNames(new Dictionary<Guid, string>());

        var names = await db.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.FullName, ct);
        return new UserNames(names);
    }
}
