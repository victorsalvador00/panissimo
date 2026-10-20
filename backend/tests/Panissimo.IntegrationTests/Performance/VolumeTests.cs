using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using Npgsql;
using Panissimo.IntegrationTests.Infrastructure;
using Xunit.Abstractions;

namespace Panissimo.IntegrationTests.Performance;

/// <summary>Runs only with <c>PAN_PERF_VOLUME=1</c>: it loads a year of production (≈ 1 min) in its own container.</summary>
public sealed class VolumeFactAttribute : FactAttribute
{
    public VolumeFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("PAN_PERF_VOLUME") != "1")
            Skip = "Prueba de volumen: corre con PAN_PERF_VOLUME=1 (docs/rendimiento.md).";
    }
}

[CollectionDefinition(Name)]
public sealed class VolumeCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "volume";
}

/// <summary>
/// B-25 (backend §13): ~27,000 production orders and ~79,000 closes (Fixtures/volume.sql) in their own database. Measures
/// the kardex of the flour (~79,000 movements), the order list, the plan and the stock through the API (median of 7 after a
/// warm-up), then captures the real plans with auto_explain. Writes <c>volume-report.md</c> next to the test binaries; its
/// summary goes to docs/rendimiento.md.
/// </summary>
[Collection(VolumeCollection.Name)]
[Trait("Category", "Performance")]
public partial class VolumeTests(ApiFactory factory, ITestOutputHelper output)
{
    private const int Runs = 7;

    private sealed record Measure(string Name, string Url, int LimitMs);

    [VolumeFact]
    public async Task Kardex_and_order_list_under_300_ms_and_plan_under_a_second_with_a_year_of_production()
    {
        var load = Stopwatch.StartNew();
        await ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "volume.sql")));
        load.Stop();

        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var flour = await ScalarAsync<Guid>("SELECT id FROM catalog.item WHERE sku = 'VOL-MP-01'");
        var counts = await ScalarAsync<string>("""
            SELECT format('%s OP, %s cierres, %s líneas de cierre, %s movimientos (%s de la harina)',
                (SELECT count(*) FROM production.production_order), (SELECT count(*) FROM production.production_close),
                (SELECT count(*) FROM production.production_close_line), (SELECT count(*) FROM inventory.inventory_movement),
                (SELECT count(*) FROM inventory.inventory_movement WHERE item_id = (SELECT id FROM catalog.item WHERE sku = 'VOL-MP-01')))
            """);
        var today = ApiFactory.Today;

        Measure[] measures =
        [
            new("Kardex de la harina, página 1", $"/api/v1/movements?locationId={plant}&itemId={flour}", 300),
            new("Kardex de la harina, página 100", $"/api/v1/movements?locationId={plant}&itemId={flour}&page=100", 300),
            new("Kardex de la planta (todos los artículos)", $"/api/v1/movements?locationId={plant}", 300),
            new("Lista de OP (pestaña por omisión)", $"/api/v1/production-orders?locationId={plant}", 300),
            new("Lista de OP del último mes", $"/api/v1/production-orders?locationId={plant}&tab=All&from={today.AddDays(-30):yyyy-MM-dd}&to={today:yyyy-MM-dd}", 300),
            new("Lista de OP, búsqueda por folio", $"/api/v1/production-orders?locationId={plant}&tab=All&q=VOL-OP-0135", 300),
            new("Plan de producción (7 días)", $"/api/v1/production-plan?locationId={plant}&from={today:yyyy-MM-dd}&to={today.AddDays(6):yyyy-MM-dd}", 1000),
            new("Existencias de la planta", $"/api/v1/stock?locationId={plant}", 300),
            new("Lista de cierres", $"/api/v1/production-closes?locationId={plant}", 300),
            new("Resumen de producción del año por fábrica", $"/api/v1/reports/production-summary?locationId={plant}&from={today.AddDays(-365):yyyy-MM-dd}&to={today:yyyy-MM-dd}&groupBy=Factory", 1000),
            new("Tablero de la planta", $"/api/v1/dashboard?locationId={plant}", 1000),
        ];

        var report = new StringBuilder()
            .AppendLine("# Prueba de volumen").AppendLine()
            .AppendLine($"- Datos: {counts}. Carga: {load.Elapsed.TotalSeconds:0} s.")
            .AppendLine($"- Tiempo por petición HTTP completa (TestServer, sin red), mediana y máximo de {Runs} tras un calentamiento.").AppendLine()
            .AppendLine("| Consulta | Mediana (ms) | Máx. (ms) | Límite (ms) |").AppendLine("|---|---:|---:|---:|");
        var failures = new List<string>();
        foreach (var m in measures)
        {
            (await admin.GetAsync(m.Url)).EnsureSuccessStatusCode(); // warm-up
            var times = new List<double>();
            for (var i = 0; i < Runs; i++)
            {
                var watch = Stopwatch.StartNew();
                (await admin.GetAsync(m.Url)).EnsureSuccessStatusCode();
                times.Add(watch.Elapsed.TotalMilliseconds);
            }
            times.Sort();
            var median = times[Runs / 2];
            report.AppendLine($"| {m.Name} | {median:0} | {times[^1]:0} | {m.LimitMs} |");
            if (median >= m.LimitMs)
                failures.Add($"{m.Name}: {median:0} ms (límite {m.LimitMs})");
        }

        // Real plans: auto_explain logs every statement of the next connections with EXPLAIN ANALYZE.
        report.AppendLine().AppendLine("## Planes (auto_explain)").AppendLine();
        await ExecuteAsync($"""
            ALTER DATABASE "{await ScalarAsync<string>("SELECT current_database()")}" SET session_preload_libraries = 'auto_explain';
            ALTER DATABASE "{await ScalarAsync<string>("SELECT current_database()")}" SET auto_explain.log_min_duration = 0;
            ALTER DATABASE "{await ScalarAsync<string>("SELECT current_database()")}" SET auto_explain.log_analyze = on;
            ALTER DATABASE "{await ScalarAsync<string>("SELECT current_database()")}" SET auto_explain.log_buffers = on;
            """);
        // The API's pooled connections predate the setting: close them so it reconnects (the first request after a
        // closed connection may fail; that run is discarded).
        await ExecuteAsync("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()");
        NpgsqlConnection.ClearAllPools();
        foreach (var m in measures)
            for (var attempt = 0; attempt < 3 && !(await admin.GetAsync(m.Url)).IsSuccessStatusCode; attempt++) { }
        var (_, before) = await factory.Postgres.GetLogsAsync();
        var offset = before.Length;
        foreach (var m in measures)
        {
            await ExecuteAsync($"SELECT 'VOLUME-MARK {m.Name}'");
            (await admin.GetAsync(m.Url)).EnsureSuccessStatusCode();
        }
        await ExecuteAsync("SELECT 'VOLUME-MARK fin'");
        var (_, logs) = await factory.Postgres.GetLogsAsync();
        report.AppendLine("```").AppendLine(Plans(logs[Math.Min(offset, logs.Length)..])).AppendLine("```");

        var path = Path.Combine(AppContext.BaseDirectory, "volume-report.md");
        await File.WriteAllTextAsync(path, report.ToString());
        output.WriteLine($"Reporte: {path}");
        output.WriteLine(report.ToString()[..Math.Min(report.Length, 4000)]);
        Assert.True(failures.Count == 0, string.Join("; ", failures));
    }

    /// <summary>The plans of the statements that took ≥ 5 ms, grouped under the measure that ran them.</summary>
    private static string Plans(string logs)
    {
        var text = new StringBuilder();
        foreach (Match entry in EntryPattern().Matches(logs))
        {
            var duration = double.Parse(entry.Groups["ms"].Value, System.Globalization.CultureInfo.InvariantCulture);
            var body = entry.Groups["body"].Value;
            if (MarkPattern().Match(body) is { Success: true } mark)
                text.AppendLine().AppendLine($"=== {mark.Groups["name"].Value} ===");
            else if (duration >= 5)
                text.AppendLine($"--- {duration:0.0} ms").AppendLine(body.Trim());
        }
        return text.ToString();
    }

    [GeneratedRegex(@"LOG:\s+duration: (?<ms>[0-9.]+) ms\s+plan:\n(?<body>(?:(?!\n\S*\s*\d{4}-\d{2}-\d{2} [\d:.]+ \w+ \[\d+\]).)*)", RegexOptions.Singleline)]
    private static partial Regex EntryPattern();

    [GeneratedRegex(@"VOLUME-MARK (?<name>[^']+)'")]
    private static partial Regex MarkPattern();

    private async Task ExecuteAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection) { CommandTimeout = 600 };
        await command.ExecuteNonQueryAsync();
    }

    private async Task<T> ScalarAsync<T>(string sql)
    {
        await using var connection = new NpgsqlConnection(factory.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        return (T)(await command.ExecuteScalarAsync())!;
    }
}
