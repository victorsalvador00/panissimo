using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Sgo.Application.Catalog;
using Sgo.Application.Common;
using Sgo.Application.Inventory;
using Sgo.IntegrationTests.Catalog;
using Sgo.IntegrationTests.Support;
using Xunit.Abstractions;

namespace Sgo.IntegrationTests.Inventory;

/// <summary>
/// B-17 acceptance: the kardex of an item with 100k movements answers in under 300 ms. Rows are inserted with SQL
/// (movements only; balances are not involved), for items of their own, so other tests are not affected.
/// Exclude with <c>dotnet test --filter "Category!=Performance"</c>.
/// </summary>
[Collection(ApiCollection.Name)]
[Trait("Category", "Performance")]
public class KardexPerformanceTests(SgoApiFactory factory, ITestOutputHelper output)
{
    private const int Movements = 100_000;
    private const int OtherItems = 50;
    private static readonly TimeSpan Limit = TimeSpan.FromMilliseconds(300);

    [Fact]
    public async Task Kardex_of_100k_movements_answers_in_under_300_ms()
    {
        var admin = await factory.CreateAuthenticatedClientAsync(SgoApiFactory.AdminEmail, SgoApiFactory.AdminPassword);
        var location = await factory.LocationIdAsync("SUC-10");
        var item = await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = false });
        var others = new List<ItemDto>();
        for (var i = 0; i < OtherItems; i++)
            others.Add(await admin.CreateItemAsync((await admin.NewItemRequestAsync()) with { TracksLots = false }));

        await InsertMovementsAsync(location, [item.Id], Movements);
        await InsertMovementsAsync(location, others.Select(o => o.Id).ToArray(), Movements); // a realistic table: 200k rows in the branch

        var byItem = $"/api/v1/movements?locationId={location}&itemId={item.Id}";
        var first = (await admin.GetJsonAsync<PagedResult<KardexEntryDto>>(byItem))!;
        Assert.Equal(Movements, first.Total);
        Assert.NotNull(first.Items[0].BalanceAfter);
        Assert.Equal(first.Items[0].BalanceAfter - first.Items[0].Quantity, first.Items[1].BalanceAfter); // running balance, newest first

        var from = Uri.EscapeDataString(DateTimeOffset.UtcNow.AddDays(-30).ToString("O"));
        var cases = new Dictionary<string, string>
        {
            ["kardex por artículo (con saldo)"] = byItem,
            ["kardex por artículo, página 200"] = byItem + "&page=200",
            ["kardex por ubicación"] = $"/api/v1/movements?locationId={location}",
            ["kardex por artículo y fecha"] = byItem + $"&from={from}",
            ["existencias de la ubicación"] = $"/api/v1/stock?locationId={location}",
            ["alertas de la ubicación"] = $"/api/v1/alerts?locationId={location}",
        };

        var failures = new List<string>();
        foreach (var (name, url) in cases)
        {
            var median = await MedianAsync(admin, url);
            output.WriteLine($"{name}: {median.TotalMilliseconds:0} ms");
            if (median > Limit)
                failures.Add($"{name}: {median.TotalMilliseconds:0} ms");
        }
        Assert.True(failures.Count == 0, $"Más de {Limit.TotalMilliseconds} ms: {string.Join("; ", failures)}");
    }

    /// <summary>Median of 5 timed requests after 2 warm-up calls.</summary>
    private static async Task<TimeSpan> MedianAsync(HttpClient client, string url)
    {
        for (var i = 0; i < 2; i++)
            (await client.GetAsync(url)).EnsureSuccessStatusCode();

        var times = new List<TimeSpan>();
        for (var i = 0; i < 5; i++)
        {
            var watch = Stopwatch.StartNew();
            var response = await client.GetAsync(url);
            await response.Content.ReadAsByteArrayAsync();
            watch.Stop();
            response.EnsureSuccessStatusCode();
            times.Add(watch.Elapsed);
        }
        return times.Order().ElementAt(times.Count / 2);
    }

    /// <summary>Alternating entries (+5) and exits (−3) over the last ~400 days, spread among the given items.</summary>
    private async Task InsertMovementsAsync(Guid locationId, Guid[] itemIds, int count)
    {
        await using var scope = factory.CreateScope();
        var db = SgoApiFactory.Db(scope);
        db.Database.SetCommandTimeout(TimeSpan.FromMinutes(2));
        await db.Database.ExecuteSqlAsync($"""
            INSERT INTO inventory.inventory_movement
                (id, occurred_at, business_date, location_id, item_id, lot_id, type, quantity, unit_cost, total_cost,
                 source_doc_type, source_doc_id, source_doc_folio, user_id, notes)
            SELECT gen_random_uuid(), at, (at AT TIME ZONE 'America/Mexico_City')::date, {locationId},
                   ({itemIds})[1 + (n % cardinality({itemIds}))], NULL, 'Adjustment',
                   CASE WHEN n % 2 = 0 THEN 5 ELSE -3 END, 10, CASE WHEN n % 2 = 0 THEN 50 ELSE -30 END,
                   'Adjustment', gen_random_uuid(), 'AJ-PERF', NULL, NULL
            FROM generate_series(1, {count}) AS n,
                 LATERAL (SELECT now() - make_interval(mins => ({count} - n) * 6) AS at) t
            ORDER BY n
            """);
        await db.Database.ExecuteSqlRawAsync("ANALYZE inventory.inventory_movement");
    }
}
