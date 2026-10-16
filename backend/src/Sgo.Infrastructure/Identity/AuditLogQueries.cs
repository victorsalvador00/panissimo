using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Common;
using Sgo.Application.Security;
using Sgo.Infrastructure.Persistence;

namespace Sgo.Infrastructure.Identity;

public sealed class AuditLogQueries(SgoDbContext db) : IAuditLogQueries
{
    public async Task<PagedResult<AuditLogDto>> ListAsync(AuditLogQuery query, CancellationToken ct = default)
    {
        var logs = db.AuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.EntityType))
            logs = logs.Where(a => a.EntityType == query.EntityType);
        if (!string.IsNullOrWhiteSpace(query.EntityId))
        {
            // Rows with a composite key ("user|location", "role|permission") belong to the history of their first part.
            var compositePrefix = query.EntityId + "|";
            logs = logs.Where(a => a.EntityId == query.EntityId || a.EntityId.StartsWith(compositePrefix));
        }
        if (query.UserId is { } userId)
            logs = logs.Where(a => a.UserId == userId);
        if (query.From is { } from)
            logs = logs.Where(a => a.OccurredAt >= from);
        if (query.To is { } to)
            logs = logs.Where(a => a.OccurredAt <= to);

        var rows = from a in logs
                   join u in db.Users on a.UserId equals u.Id into users
                   from u in users.DefaultIfEmpty()
                   orderby a.OccurredAt descending, a.Id descending
                   select new { Log = a, UserName = u == null ? null : u.FullName };

        var page = await rows.ToPagedResultAsync(query, ct);
        return new PagedResult<AuditLogDto>(
            page.Items.Select(r => new AuditLogDto(r.Log.Id, r.Log.OccurredAt, r.Log.UserId, r.UserName, r.Log.Action.ToString(),
                r.Log.EntityType, r.Log.EntityId, JsonDocument.Parse(r.Log.ChangesJson).RootElement.Clone(), r.Log.IpAddress)).ToList(),
            page.Page, page.PageSize, page.Total);
    }
}
