# Rendimiento (B-25)

Revisión con un año de producción de la Planta, medida por la API y con los planes reales de Postgres. Criterio (backend §13): **kardex y lista de OP < 300 ms; plan < 1 s**. Se cumple con amplio margen.

## Cómo se mide

- Datos: `backend/tests/Panissimo.IntegrationTests/Fixtures/volume.sql` (también sirve a mano: `psql -v ON_ERROR_STOP=1 -d <bd> -f volume.sql` sobre una BD migrada y sembrada).
  - 300 productos terminados con su receta, 40 materias primas; la harina (`VOL-MP-01`) está en todas las recetas.
  - **27,000 OP** en 368 días (360 atrás, 7 adelante): las pasadas terminadas con 3 cierres; los últimos 3 días en proceso con 1; las futuras liberadas o en borrador.
  - **79,029 cierres** con 237,087 líneas de consumo y su kardex: **316,156 movimientos**, 79,030 de ellos de la harina.
- Prueba: `VolumeTests` (`Category=Performance`). Solo corre con la variable `PAN_PERF_VOLUME=1`, en su propio contenedor de Postgres 16 (la carga tarda ~20 s):

  ```bash
  cd backend
  PAN_PERF_VOLUME=1 dotnet test tests/Panissimo.IntegrationTests --filter "FullyQualifiedName~VolumeTests"
  ```

- Tiempo de la **petición HTTP completa** (autenticación, consultas, mapeo y JSON; TestServer, sin red), mediana de 7 después de un calentamiento. Falla si una mediana pasa su límite.
- Después activa `auto_explain` (`EXPLAIN ANALYZE, BUFFERS` de cada sentencia) y deja el reporte con los planes en `tests/Panissimo.IntegrationTests/bin/Debug/net10.0/volume-report.md`.
- Equipo de la medición: portátil de desarrollo con Windows 11 y Docker Desktop. En el Droplet los números cambian, pero el margen es grande.

## Resultados (2026-10-18)

| Consulta | Antes (ms) | Después (ms) | Límite (ms) |
|---|---:|---:|---:|
| Kardex de la harina (79,030 movimientos), página 1 | 46 | 39 | 300 |
| Kardex de la harina, página 100 | 48 | 42 | 300 |
| Kardex de toda la planta (316,156 movimientos) | 50 | 26 | 300 |
| Lista de OP (pestaña por omisión) | 12 | 12 | 300 |
| Lista de OP del último mes | 9 | 9 | 300 |
| Lista de OP, búsqueda por folio | 27 | 26 | 300 |
| Plan de producción (7 días) | 25 | 24 | 1000 |
| Existencias de la planta | 9 | 8 | 300 |
| Lista de cierres | 97 | 28 | 300 |
| Resumen de producción del año por área (hoy por fábrica) | 656 | 94 | 1000 |
| Tablero de la planta | 33 | 33 | 1000 |

## Hallazgos y cambios

1. **Lista de cierres (97 → 28 ms).** Ordena por `closed_at` desc; sin índice, Postgres unía los 79,000 cierres con sus OP y los ordenaba para quedarse con 25 (`Sort … top-N heapsort` sobre `Merge Join`). Nuevo índice `ix_production_close_closed_at` (migración `AddCloseListIndex`): la consulta de la página bajó de 77 ms a menos de 5 ms (ya no aparece entre las sentencias de ≥ 5 ms del reporte). Queda el conteo del total, un recorrido de los cierres de ~7 ms.
2. **Resumen de producción del año (656 → 94 ms; una corrida llegó a 5.8 s).** La merma se calculaba con una subconsulta por cierre (79,000 ejecuciones) y luego se traían los 79,000 cierres a .NET para agruparlos. Ahora el agrupamiento (área, producto o día, más la unidad) se hace en la BD con tres consultas agregadas: planeado, producido y merma. La merma en pesos se redondea por renglón del resumen y no por cierre; la diferencia máxima es de diezmilésimas de peso.
3. **Conteo del kardex (50 → 26 ms en toda la planta).** El total de la paginación contaba sobre la consulta ya unida con ubicación, artículo, unidad y lote. Esas uniones son referencias obligatorias (el lote, opcional), así que no cambian el total; ahora se cuenta solo sobre los movimientos filtrados. El conteo de **toda** la planta sigue creciendo con la historia (un recorrido del índice), pero a un tercio del costo. El kardex de **un artículo**, que es como se consulta normalmente, cuenta con el índice `(item_id, type, business_date)` (~12 ms para 79,000 movimientos). El saldo corrido de la página es un `SUM` hasta su movimiento más nuevo: con estos datos recién cargados Postgres prefiere el mismo índice y lee la historia del artículo (~12 ms), en vez del índice cubriente `(location_id, item_id, sequence) INCLUDE (quantity)`, que conviene cuando el mapa de visibilidad está al día (autovacuum). Crece con la historia, pero despacio: la página 100 cuesta lo mismo que la 1.
4. **Sin cambios:** la lista de OP usa `(location_id, scheduled_date, status)`; el plan solo lee las OP abiertas del rango y los pedidos; las existencias leen `stock_balance`. Los índices mínimos de backend §4 ya existían todos.

## Planes de referencia (resumidos)

- Kardex de la harina, total: `Bitmap Index Scan on ix_inventory_movement_item_id_type_business_date` (79,030 filas, 1.1 ms) → `Bitmap Heap Scan` → `Aggregate`, ~14 ms con `log_analyze`.
- Kardex, saldo de la página: el mismo `Bitmap Index Scan` (76,555 filas) → `SUM`, ~12 ms.
- Lista de cierres: la página ya no aparece entre las sentencias de ≥ 5 ms; el conteo es `Seq Scan production_close ⋈ Seq Scan production_order` (~7 ms).
- Resumen del año: `HashAggregate` sobre `Seq Scan production_order` (26,489 filas, 15 ms) y sobre `production_close ⋈ production_order` (79,029 filas). La merma solo lee las líneas con `waste_qty <> 0`.

## Cuándo volver a medir

- Al tocar el kardex, la lista de OP o de cierres, el plan o el resumen.
- Si la operación real supera ~3 años de historia en la BD: el conteo del kardex de toda la planta es el primero que crece. La opción es no contar el total en esa vista, que se pagina por secuencia.

## Trazabilidad de lotes (B-28)

`TraceabilityPerformanceTests` (`Category=Performance`, corre en la suite normal): un lote de harina consumido por **20 OP** (40 cierres, 40 lotes terminados) cuyo pan salió en **600 traspasos**, insertado con SQL. Hacia adelante: **802 nodos y 1,320 aristas en ~200 ms** (límite 1.5 s).

- El spec estimaba ≈ 1,500 nodos para esos datos. Son 802 porque un lote tiene un nodo de existencia por ubicación, no uno por traspaso: lote de harina y su existencia, 40 cierres, 40 lotes, su existencia en planta y en las dos sucursales, y 600 traspasos.
- Consultas por nivel y en lote: una por tipo de liga con `lot_id = ANY(@ids)`, nunca una por nodo. Una prueba unitaria verifica que 30 cierres de un mismo lote se resuelven en menos de 20 consultas.
- **Planes:** en la BD de prueba las tablas son chicas y Postgres escoge `Seq Scan` (0.02–0.2 ms), que es lo correcto a ese tamaño. Con `enable_seqscan = off` la prueba imprime el índice que cada consulta usa al crecer las tablas (trazabilidad §3.2):
  - lotes consumidos por cierre: `Index Scan using ix_production_close_line_lot_lot_id`;
  - cierres por lote producido: `Index Scan using ix_production_close_output_lot_id`;
  - líneas de traspaso por lote: `Bitmap Index Scan on ix_transfer_line_lot_id`;
  - kardex de los lotes: `Bitmap Index Scan on ix_inventory_movement_lot_id_location_id` (índice nuevo de B-28, con `type`, `quantity` y `occurred_at` incluidos).

