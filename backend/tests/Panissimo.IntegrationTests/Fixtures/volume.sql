-- Volume data for the performance review (B-25, docs/rendimiento.md): one year of production at the plant.
--   300 finished goods (pza) with one recipe each; 40 raw materials (kg). VOL-MP-01 (flour) is in every recipe.
--   27,000 production orders over 368 days (360 back, 7 ahead): the past ones Completed with 3 closes (partial, partial,
--   final), the last 3 days InProgress with 1 close, the future ones Released or Draft.
--   ~79,000 closes with 3 consumption lines each and their kardex: 1 output + 3 consumptions per close (~316,000
--   movements; ~79,000 of them of the flour), plus one purchase receipt per raw material a year ago.
-- Run on a database already migrated and seeded (PLANTA, units). It never touches documents of other prefixes.
-- Manual use: psql -v ON_ERROR_STOP=1 -d <db> -f volume.sql

BEGIN;

CREATE TEMP TABLE vol_ctx ON COMMIT DROP AS
SELECT (SELECT id FROM org.location WHERE code = 'PLANTA') AS plant,
       (SELECT id FROM catalog.unit_of_measure WHERE code = 'kg') AS kg,
       (SELECT id FROM catalog.unit_of_measure WHERE code = 'pza') AS pza,
       gen_random_uuid() AS category,
       (now() AT TIME ZONE 'America/Mexico_City')::date AS today,
       (SELECT coalesce(max(sequence), 0) FROM inventory.inventory_movement) AS base_sequence;

INSERT INTO catalog.item_category (id, name, is_active, created_at)
SELECT category, 'Volumen ' || to_char(now(), 'YYYYMMDDHH24MISS'), true, now() FROM vol_ctx;

-- Items -------------------------------------------------------------------------------------------------------------

CREATE TEMP TABLE vol_material ON COMMIT DROP AS
SELECT n, gen_random_uuid() AS id, (10 + n % 30)::numeric AS cost FROM generate_series(1, 40) AS n;

INSERT INTO catalog.item (id, sku, name, type, category_id, base_uom_id, purchase_to_base_factor, tracks_lots,
                          storage_condition, tax_rate, production_multiple, is_active, created_at)
SELECT m.id, 'VOL-MP-' || lpad(m.n::text, 2, '0'),
       CASE m.n WHEN 1 THEN 'Harina volumen' ELSE 'Materia prima volumen ' || m.n END,
       'RawMaterial', c.category, c.kg, 1, false, 'Ambient', 0, 1, true, now()
FROM vol_material m, vol_ctx c;

CREATE TEMP TABLE vol_product ON COMMIT DROP AS
SELECT n, gen_random_uuid() AS id, gen_random_uuid() AS recipe_id,
       2 + n % 39 AS material_b, 2 + (n + 13) % 39 AS material_c
FROM generate_series(0, 299) AS n;

INSERT INTO catalog.item (id, sku, name, type, category_id, base_uom_id, purchase_to_base_factor, tracks_lots,
                          storage_condition, tax_rate, presentation, production_multiple, is_active, created_at)
SELECT p.id, 'VOL-PT-' || lpad(p.n::text, 3, '0'), 'Producto volumen ' || p.n,
       'FinishedGood', c.category, c.pza, 1, false, 'Ambient', 0, 'Bulk', 1, true, now()
FROM vol_product p, vol_ctx c;

-- Recipes: 100 pza = 5 kg of flour + 1 kg + 0.5 kg of two other materials.
INSERT INTO production.recipe (id, output_item_id, version_number, is_active, yield_qty, is_used, created_at)
SELECT recipe_id, id, 1, true, 100, true, now() FROM vol_product;

CREATE TEMP TABLE vol_recipe_line ON COMMIT DROP AS
SELECT p.n AS product, mt.id AS material_id, mt.cost, x.qty
FROM vol_product p
CROSS JOIN LATERAL (VALUES (1, 5.0), (p.material_b, 1.0), (p.material_c, 0.5)) AS x(material, qty)
JOIN vol_material mt ON mt.n = x.material;

INSERT INTO production.recipe_line (id, recipe_id, component_item_id, quantity, waste_pct)
SELECT gen_random_uuid(), p.recipe_id, l.material_id, l.qty, 0
FROM vol_recipe_line l JOIN vol_product p ON p.n = l.product;

-- Orders ------------------------------------------------------------------------------------------------------------

CREATE TEMP TABLE vol_order ON COMMIT DROP AS
SELECT k, gen_random_uuid() AS id, p.n AS product, p.id AS item_id, p.recipe_id,
       c.today - 360 + (k % 368) AS scheduled_date,
       (100 * (1 + k % 5))::numeric AS planned_qty,
       CASE WHEN c.today - 360 + (k % 368) < c.today - 2 THEN 'Completed'
            WHEN c.today - 360 + (k % 368) <= c.today THEN 'InProgress'
            WHEN k % 2 = 0 THEN 'Released' ELSE 'Draft' END AS status
FROM generate_series(1, 27000) AS k
JOIN vol_product p ON p.n = k % 300
CROSS JOIN vol_ctx c;

CREATE TEMP TABLE vol_close ON COMMIT DROP AS
SELECT o.id AS order_id, s.seq, gen_random_uuid() AS id, o.product, o.item_id, o.scheduled_date,
       CASE WHEN o.status = 'Completed' THEN round(o.planned_qty / 3, 0) ELSE round(o.planned_qty / 2, 0) END AS produced_qty,
       CASE WHEN o.status = 'Completed' AND s.seq = 3 THEN 'Final' ELSE 'Partial' END AS kind
FROM vol_order o
CROSS JOIN LATERAL generate_series(1, CASE o.status WHEN 'Completed' THEN 3 WHEN 'InProgress' THEN 1 ELSE 0 END) AS s(seq);

CREATE TEMP TABLE vol_close_line ON COMMIT DROP AS
SELECT cl.id AS close_id, cl.order_id, cl.seq, cl.scheduled_date, l.material_id, l.cost,
       round(cl.produced_qty / 100 * l.qty, 4) AS qty
FROM vol_close cl JOIN vol_recipe_line l ON l.product = cl.product;

CREATE TEMP TABLE vol_close_cost ON COMMIT DROP AS
SELECT close_id, sum(qty * cost) AS total FROM vol_close_line GROUP BY close_id;

CREATE TEMP TABLE vol_consumed ON COMMIT DROP AS
SELECT order_id, material_id, sum(qty) AS qty FROM vol_close_line GROUP BY order_id, material_id;

INSERT INTO production.production_order (id, folio, location_id, recipe_id, output_item_id, planned_qty, scheduled_date,
    source, status, released_at, produced_qty, total_cost, unit_cost, close_count, completed_at, created_at)
SELECT o.id, 'VOL-OP-' || lpad(o.k::text, 6, '0'), c.plant, o.recipe_id, o.item_id, o.planned_qty, o.scheduled_date,
       'Manual', o.status, CASE WHEN o.status <> 'Draft' THEN o.scheduled_date - 1 + time '06:00' END,
       coalesce(t.produced, 0), coalesce(t.cost, 0), CASE WHEN t.produced > 0 THEN round(t.cost / t.produced, 4) ELSE 0 END,
       coalesce(t.closes, 0), CASE WHEN o.status = 'Completed' THEN o.scheduled_date + time '20:00' END,
       o.scheduled_date - 2 + time '12:00'
FROM vol_order o CROSS JOIN vol_ctx c
LEFT JOIN (SELECT cl.order_id, sum(cl.produced_qty) AS produced, sum(cc.total) AS cost, count(*) AS closes
           FROM vol_close cl JOIN vol_close_cost cc ON cc.close_id = cl.id GROUP BY cl.order_id) t ON t.order_id = o.id;

INSERT INTO production.production_order_line (id, production_order_id, component_item_id, theoretical_qty, actual_qty)
SELECT gen_random_uuid(), o.id, l.material_id, round(o.planned_qty / 100 * l.qty, 4), coalesce(x.qty, 0)
FROM vol_order o JOIN vol_recipe_line l ON l.product = o.product
LEFT JOIN vol_consumed x ON x.order_id = o.id AND x.material_id = l.material_id;

INSERT INTO production.production_close (id, folio, production_order_id, sequence, kind, business_date, produced_qty, total_cost,
    unit_cost, closed_at, created_at, exceeds_tolerance, output_location_id)
SELECT cl.id, 'VOL-CP-' || lpad(row_number() OVER (ORDER BY cl.scheduled_date, cl.order_id, cl.seq)::text, 6, '0'),
       cl.order_id, cl.seq, cl.kind, cl.scheduled_date, cl.produced_qty, cc.total, round(cc.total / cl.produced_qty, 4),
       cl.scheduled_date + time '08:00' + cl.seq * interval '3 hours', now(), false, c.plant
FROM vol_close cl JOIN vol_close_cost cc ON cc.close_id = cl.id CROSS JOIN vol_ctx c;

INSERT INTO production.production_close_line (id, production_close_id, component_item_id, theoretical_qty, actual_qty, unit_cost,
    waste_qty, location_id)
SELECT gen_random_uuid(), l.close_id, l.material_id, l.qty, l.qty, l.cost, 0, c.plant FROM vol_close_line l CROSS JOIN vol_ctx c;

-- Kardex ------------------------------------------------------------------------------------------------------------

CREATE TEMP TABLE vol_movement ON COMMIT DROP AS
-- One purchase per raw material a year ago, enough for the whole year.
SELECT c.today - 365 + time '07:00' AS occurred_at, c.today - 365 AS business_date, m.id AS item_id, 'PurchaseReceipt' AS type,
       coalesce(x.qty, 0) + 1000 AS quantity, m.cost AS unit_cost,
       'Test' AS doc_type, gen_random_uuid() AS doc_id, 'VOL-REC-' || lpad(m.n::text, 2, '0') AS folio
FROM vol_material m CROSS JOIN vol_ctx c
LEFT JOIN (SELECT material_id, sum(qty) AS qty FROM vol_consumed GROUP BY material_id) x ON x.material_id = m.id
UNION ALL
SELECT cl.scheduled_date + time '08:00' + cl.seq * interval '3 hours', cl.scheduled_date, l.material_id, 'ProductionConsumption',
       -l.qty, l.cost, 'ProductionClose', cl.id, 'VOL-CP'
FROM vol_close cl JOIN vol_close_line l ON l.close_id = cl.id
UNION ALL
SELECT cl.scheduled_date + time '08:00' + cl.seq * interval '3 hours' + interval '1 second', cl.scheduled_date, cl.item_id,
       'ProductionOutput', cl.produced_qty, round(cc.total / cl.produced_qty, 4), 'ProductionClose', cl.id, 'VOL-CP'
FROM vol_close cl JOIN vol_close_cost cc ON cc.close_id = cl.id;

INSERT INTO inventory.inventory_movement (id, sequence, occurred_at, business_date, location_id, item_id, type, quantity, unit_cost,
    total_cost, source_doc_type, source_doc_id, source_doc_folio)
OVERRIDING SYSTEM VALUE -- sequence is an identity: numbered here in chronological order, then the identity moves past it
SELECT gen_random_uuid(), c.base_sequence + row_number() OVER (ORDER BY m.occurred_at, m.type DESC, m.item_id), m.occurred_at,
       m.business_date, c.plant, m.item_id, m.type, m.quantity, m.unit_cost, round(m.quantity * m.unit_cost, 4), m.doc_type, m.doc_id,
       m.folio
FROM vol_movement m CROSS JOIN vol_ctx c;

SELECT setval(pg_get_serial_sequence('inventory.inventory_movement', 'sequence'), (SELECT max(sequence) FROM inventory.inventory_movement));

-- Balances and costs as the posting service would leave them (products leave at their average cost; raw materials keep theirs).
INSERT INTO inventory.stock_balance (id, location_id, item_id, lot_id, quantity)
SELECT gen_random_uuid(), c.plant, m.item_id, NULL, sum(m.quantity)
FROM vol_movement m CROSS JOIN vol_ctx c GROUP BY c.plant, m.item_id;

INSERT INTO inventory.item_location_cost (location_id, item_id, average_cost)
SELECT c.plant, m.item_id, round(sum(m.quantity * m.unit_cost) / nullif(sum(m.quantity), 0), 4)
FROM vol_movement m CROSS JOIN vol_ctx c WHERE m.quantity > 0 GROUP BY c.plant, m.item_id;

COMMIT;

ANALYZE;
