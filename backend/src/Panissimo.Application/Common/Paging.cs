using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Panissimo.Domain.Common;
using Panissimo.Domain.Organization;

namespace Panissimo.Application.Common;

/// <summary>Common list parameters: <c>?page=1&amp;pageSize=25&amp;sort=folio:desc&amp;q=texto</c> (backend §8.1).</summary>
public record PageQuery
{
    public const int MaxPageSize = 100;

    private readonly int _page = 1;
    private readonly int _pageSize = 25;

    public int Page { get => _page; init => _page = value < 1 ? 1 : value; }
    public int PageSize { get => _pageSize; init => _pageSize = Math.Clamp(value, 1, MaxPageSize); }
    public string? Sort { get; init; }
    public string? Q { get; init; }

    public int Skip => (Page - 1) * PageSize;
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

/// <summary>Body of state-change actions (activate, submit, cancel…): the version the client last saw.</summary>
public sealed record VersionRequest(uint Version);

public static class QueryableExtensions
{
    /// <summary>
    /// Applies <c>sort=field:asc|desc</c> from a whitelist of sortable columns.
    /// Unknown fields are rejected with a 400 instead of being silently ignored.
    /// </summary>
    public static IQueryable<T> ApplySort<T>(
        this IQueryable<T> query,
        string? sort,
        IReadOnlyDictionary<string, Expression<Func<T, object?>>> columns,
        string defaultSort)
    {
        var spec = string.IsNullOrWhiteSpace(sort) ? defaultSort : sort;
        var parts = spec.Split(':', 2, StringSplitOptions.TrimEntries);
        var descending = parts.Length == 2 && parts[1].Equals("desc", StringComparison.OrdinalIgnoreCase);

        var column = columns.FirstOrDefault(c => c.Key.Equals(parts[0], StringComparison.OrdinalIgnoreCase)).Value
                     ?? throw new RequestValidationException(new Dictionary<string, string[]>
                     {
                         ["sort"] = [$"No se puede ordenar por '{parts[0]}'. Opciones: {string.Join(", ", columns.Keys)}."],
                     });

        return descending ? query.OrderByDescending(column) : query.OrderBy(column);
    }

    public static async Task<PagedResult<T>> ToPagedResultAsync<T>(this IQueryable<T> query, PageQuery page, CancellationToken ct)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip(page.Skip).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, page.Page, page.PageSize, total);
    }

    /// <summary>Pages over entities and maps the page in memory (reuses <c>ToDto()</c>).</summary>
    public static async Task<PagedResult<TDto>> ToPagedResultAsync<T, TDto>(
        this IQueryable<T> query, PageQuery page, Func<T, TDto> map, CancellationToken ct)
    {
        var result = await query.ToPagedResultAsync(page, ct);
        return new PagedResult<TDto>(result.Items.Select(map).ToList(), result.Page, result.PageSize, result.Total);
    }

    /// <summary>Normalized search text for case-insensitive <c>x.ToLower().Contains(term)</c>.</summary>
    public static string? SearchTerm(this PageQuery page) =>
        string.IsNullOrWhiteSpace(page.Q) ? null : page.Q.Trim().ToLowerInvariant();
}

public static class DbContextExtensions
{
    /// <summary>
    /// Makes the next SaveChanges compare against the version the client sent.
    /// Fails fast with <see cref="ConcurrencyException"/> when it already differs from the loaded row;
    /// a concurrent write between load and save surfaces as a 409 as well.
    /// </summary>
    public static void EnsureVersion<TEntity>(this IAppDbContext db, TEntity entity, uint expectedVersion)
        where TEntity : class, IVersioned
    {
        if (entity.Version != expectedVersion)
            throw new ConcurrencyException();
        db.Entry(entity).Property(e => e.Version).OriginalValue = expectedVersion;
    }

    /// <summary>A numeric setting; falls back to its default when the row is missing.</summary>
    public static async Task<decimal> GetSettingAsync(this IAppDbContext db, string key, CancellationToken ct)
    {
        var value = await db.AppSettings.AsNoTracking().Where(s => s.Key == key).Select(s => s.Value).SingleOrDefaultAsync(ct);
        return value is null
            ? (SettingDefinitions.Find(key) ?? throw new ArgumentException($"Unknown setting '{key}'.")).Default
            : decimal.Parse(value, CultureInfo.InvariantCulture);
    }
}
