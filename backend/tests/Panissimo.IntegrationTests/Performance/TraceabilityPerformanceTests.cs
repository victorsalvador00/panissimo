using System.Diagnostics;
using Npgsql;
using Panissimo.Application.Inventory.Traceability;
using Panissimo.IntegrationTests.Infrastructure;
using Xunit.Abstractions;

namespace Panissimo.IntegrationTests.Performance;

/// <summary>
/// trazabilidad §5.2: a flour lot consumed by 20 orders (40 closes, 40 finished lots) whose bread went out in 600
/// transfers: forward in under 1.5 s. 802 nodes: the spec estimated ≈ 1,500, but a lot has one stock node per location (not
/// one per transfer). The data is inserted with SQL (documents already posted).
/// </summary>
[Collection(ApiCollection.Name)]
public class TraceabilityPerformanceTests(ApiFactory factory, ITestOutputHelper output)
{
    [Fact]
    [Trait("Category", "Performance")]
    public async Task A_flour_lot_with_20_orders_and_600_transfers_traces_in_under_a_second_and_a_half()
    {
        var admin = await factory.LoginAsAdminAsync();
        var plant = await factory.LocationIdAsync("PLANTA");
        var suc1 = await factory.LocationIdAsync("SUC-01");
        var suc2 = await factory.LocationIdAsync("SUC-02");
        var flour = await factory.CreateItemAsync("HARPERF", tracksLots: true);
        var bread = await factory.CreateItemAsync("PANPERF", Domain.Catalog.ItemType.FinishedGood, "pza", tracksLots: true, shelfLifeDays: 2);
        var tag = Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        var flourLot = Guid.NewGuid();

        await using (var connection = new NpgsqlConnection(factory.ConnectionString))
        {
            await connection.OpenAsync();
            var sql = $"""
                BEGIN;
                CREATE TEMP TABLE p ON COMMIT DROP AS SELECT '{plant}'::uuid plant, '{suc1}'::uuid suc1, '{suc2}'::uuid suc2,
                    '{flour.Id}'::uuid flour, '{bread.Id}'::uuid bread, '{flourLot}'::uuid flot, gen_random_uuid() recipe,
                    (SELECT coalesce(max(sequence), 0) FROM inventory.inventory_movement) seq0;
                INSERT INTO inventory.lot (id, item_id, lot_number, expiration_date, created_from_doc_type, created_from_doc_id, created_at)
                SELECT flot, flour, 'PERF-{tag}', current_date + 60, 'Test', gen_random_uuid(), now() FROM p;
                INSERT INTO production.recipe (id, output_item_id, version_number, is_active, yield_qty, is_used, created_at)
                SELECT recipe, bread, 1, true, 100, true, now() FROM p;

                CREATE TEMP TABLE o ON COMMIT DROP AS SELECT k, gen_random_uuid() id FROM generate_series(1, 20) k;
                CREATE TEMP TABLE c ON COMMIT DROP AS SELECT o.k * 2 + s - 2 n, o.id order_id, s seq, gen_random_uuid() id, gen_random_uuid() line,
                    gen_random_uuid() lot FROM o CROSS JOIN generate_series(1, 2) s;
                INSERT INTO production.production_order (id, folio, location_id, recipe_id, output_item_id, planned_qty, scheduled_date, source, status,
                    produced_qty, total_cost, unit_cost, close_count, created_at)
                SELECT o.id, 'PERF-OP-{tag}-' || o.k, plant, recipe, bread, 600, current_date, 'Manual', 'Completed', 600, 60, 0.1, 2, now() FROM o, p;
                INSERT INTO inventory.lot (id, item_id, lot_number, expiration_date, created_from_doc_type, created_from_doc_id, created_at)
                SELECT c.lot, bread, 'PERF-{tag}-' || c.n, current_date + 2, 'ProductionClose', c.id, now() FROM c, p;
                INSERT INTO production.production_close (id, folio, production_order_id, sequence, kind, business_date, produced_qty, output_lot_id,
                    total_cost, unit_cost, closed_at, created_at, exceeds_tolerance, output_location_id)
                SELECT c.id, 'PERF-CP-{tag}-' || c.n, c.order_id, c.seq, CASE c.seq WHEN 2 THEN 'Final' ELSE 'Partial' END, current_date, 300, c.lot,
                    30, 0.1, now(), now(), false, plant FROM c, p;
                INSERT INTO production.production_close_line (id, production_close_id, component_item_id, theoretical_qty, actual_qty, unit_cost,
                    waste_qty, location_id)
                SELECT c.line, c.id, flour, 1, 1, 10, 0, plant FROM c, p;
                INSERT INTO production.production_close_line_lot (id, line_id, lot_id, quantity) SELECT gen_random_uuid(), c.line, flot, 1 FROM c, p;

                -- 15 transfers per finished lot, alternating branches: 600 in all.
                CREATE TEMP TABLE t ON COMMIT DROP AS SELECT c.n, c.lot, x, gen_random_uuid() id, CASE x % 2 WHEN 0 THEN suc1 ELSE suc2 END dest
                    FROM c CROSS JOIN generate_series(1, 15) x CROSS JOIN p;
                INSERT INTO logistics.transfer (id, folio, from_location_id, to_location_id, status, vehicle_description, driver_name, dispatched_at,
                    received_at, created_at, kind)
                SELECT t.id, 'PERF-TR-{tag}-' || t.n || '-' || t.x, plant, t.dest, 'Received', 'U-1', 'Chofer', now(), now(), now(), 'Standard' FROM t, p;
                INSERT INTO logistics.transfer_line (id, transfer_id, item_id, lot_id, shipped_qty, received_qty, unit_cost, from_stock_location_id,
                    to_stock_location_id)
                SELECT gen_random_uuid(), t.id, bread, t.lot, 20, 20, 0.1, plant, t.dest FROM t, p;

                CREATE TEMP TABLE m ON COMMIT DROP AS
                SELECT c.lot, plant loc, 'ProductionOutput' type, 300::numeric qty, 'PERF-CP' folio FROM c, p
                UNION ALL SELECT t.lot, plant, 'TransferOut', -20, 'PERF-TR' FROM t, p
                UNION ALL SELECT t.lot, t.dest, 'TransferIn', 20, 'PERF-TR' FROM t
                UNION ALL SELECT flot, plant, 'ProductionConsumption', -1, 'PERF-CP' FROM c, p;
                INSERT INTO inventory.inventory_movement (id, sequence, occurred_at, business_date, location_id, item_id, lot_id, type, quantity,
                    unit_cost, total_cost, source_doc_type, source_doc_id, source_doc_folio)
                OVERRIDING SYSTEM VALUE
                SELECT gen_random_uuid(), seq0 + row_number() OVER (), now(), current_date, m.loc,
                    CASE WHEN m.lot = flot THEN flour ELSE bread END, m.lot, m.type, m.qty, 0.1, m.qty * 0.1, 'Test', gen_random_uuid(), m.folio FROM m, p;
                SELECT setval(pg_get_serial_sequence('inventory.inventory_movement', 'sequence'), (SELECT max(sequence) FROM inventory.inventory_movement));
                INSERT INTO inventory.stock_balance (id, location_id, item_id, lot_id, quantity)
                SELECT gen_random_uuid(), m.loc, CASE WHEN m.lot = flot THEN flour ELSE bread END, m.lot, sum(m.qty) FROM m, p GROUP BY m.loc, m.lot, flot, flour, bread;
                COMMIT;
                ANALYZE;
                """;
            await using var command = new NpgsqlCommand(sql, connection) { CommandTimeout = 120 };
            await command.ExecuteNonQueryAsync();
        }

        var url = $"/api/v1/traceability/graph?sourceType=Lot&sourceId={flourLot}&direction=Forward";
        (await admin.GetAsync(url)).EnsureSuccessStatusCode(); // warm-up
        var watch = Stopwatch.StartNew();
        var graph = (await (await admin.GetAsync(url)).Content.ReadJsonAsync<TraceGraphDto>())!;
        watch.Stop();
        output.WriteLine($"Trazabilidad hacia adelante: {graph.Nodes.Count} nodos, {graph.Edges.Count} aristas en {watch.ElapsedMilliseconds} ms");

        // Plans of the level queries with the ids of this graph (docs/rendimiento.md).
        var lots = string.Join(",", graph.Nodes.Where(n => n.Type == TraceNodeType.Lot).Select(n => $"'{n.LotId}'"));
        await using (var connection = new NpgsqlConnection(factory.ConnectionString))
        {
            await connection.OpenAsync();
            // These tables are small here and a sequential scan is the right plan; without it the plan shows the index each
            // query uses once the tables grow (trazabilidad §3.2).
            await using (var noSeq = new NpgsqlCommand("SET enable_seqscan = off", connection))
                await noSeq.ExecuteNonQueryAsync();
            foreach (var (name, query) in new[]
            {
                ("close lots", $"SELECT * FROM production.production_close_line_lot WHERE lot_id = ANY(ARRAY['{flourLot}']::uuid[])"),
                ("closes by output", $"SELECT id FROM production.production_close WHERE output_lot_id = ANY(ARRAY[{lots}]::uuid[])"),
                ("transfer lines", $"SELECT * FROM logistics.transfer_line WHERE lot_id = ANY(ARRAY[{lots}]::uuid[])"),
                ("kardex", $"SELECT lot_id, location_id, type, quantity, occurred_at FROM inventory.inventory_movement WHERE lot_id = ANY(ARRAY[{lots}]::uuid[])"),
            })
            {
                await using var explain = new NpgsqlCommand($"EXPLAIN (ANALYZE, COSTS OFF) {query}", connection);
                await using var reader = await explain.ExecuteReaderAsync();
                var plan = new List<string>();
                while (await reader.ReadAsync())
                    plan.Add(reader.GetString(0));
                output.WriteLine($"PLAN {name}: {string.Join(" | ", plan)}");
            }
        }

        Assert.False(graph.Truncated);
        Assert.Equal(40, graph.Nodes.Count(n => n.Type == TraceNodeType.ProductionClose));
        Assert.Equal(600, graph.Nodes.Count(n => n.Type == TraceNodeType.Transfer));
        // Flour lot and its plant stock, 40 closes, 40 lots, their stock at the plant and at both branches, 600 transfers.
        Assert.Equal(1 + 1 + 40 + 40 + 40 + 80 + 600, graph.Nodes.Count);
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(1.5), $"La trazabilidad tardó {watch.ElapsedMilliseconds} ms con {graph.Nodes.Count} nodos");
    }
}
