using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Sgo.Domain.Common;

namespace Sgo.Application.Common;

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
