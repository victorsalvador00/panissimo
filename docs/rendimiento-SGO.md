# Rendimiento (B-17)

Criterio de aceptación: **kardex de 100k movimientos en < 300 ms.**

## Cómo se mide

`backend/tests/Sgo.IntegrationTests/Inventory/KardexPerformanceTests.cs` (categoría `Performance`, corre con `dotnet test`):

- Inserta con SQL 100,000 movimientos de un artículo en SUC-10 y otros 100,000 repartidos entre 50 artículos de la misma sucursal. En total son 200k filas en la ubicación.
- Mide cada endpoint por HTTP, incluida la serialización: 2 llamadas de calentamiento y luego la mediana de 5.
- Falla si alguna mediana pasa de 300 ms.
- Para excluirla: `dotnet test --filter "Category!=Performance"`.

## Resultados (Postgres 16 en Testcontainers, laptop de desarrollo)

| Consulta | Antes | Después |
|---|---|---|
| Kardex por artículo, con saldo corrido (página 1) | 103 ms | **53 ms** |
| Kardex por artículo, página 200 | 105 ms | **54 ms** |
| Kardex por artículo y rango de fechas | 84 ms | **34 ms** |
| Kardex por ubicación | 29 ms | 29 ms |
| Existencias de la ubicación | 5 ms | 5 ms |
| Alertas de la ubicación | 6 ms | 6 ms |

## Hallazgos (`EXPLAIN (ANALYZE, BUFFERS)`)

1. **Saldo corrido del kardex.** Era una función de ventana (`SUM() OVER (ORDER BY sequence)`) sobre **todo** el historial del artículo en la ubicación, y luego se filtraban las 25 filas de la página.
   - Con 100k movimientos: `WindowAgg` sobre 100k filas, ordenamiento derramado a disco (`temp read/written`), **~120 ms** en BD. Además crece con el historial.
   - **Cambio:** el saldo del movimiento más reciente de la página se obtiene con un solo `SUM(quantity) WHERE sequence <= máx`. Los saldos de las demás filas se calculan restando solo los movimientos dentro del rango de secuencias de la página (`StockQueries.RunningBalancesAsync`).
   - El índice `(location_id, item_id, sequence) INCLUDE (quantity)` permite resolver ese `SUM` sin leer la tabla (index-only scan con el mapa de visibilidad al día, que mantiene autovacuum).
   - **Resultado:** ~30 ms en BD, sin derrame a disco.
2. **Kardex por ubicación (sin artículo).** Recorría hacia atrás el índice global de `sequence` filtrando por ubicación. Es rápido si la ubicación tiene movimientos recientes, pero se degrada en una ubicación con poca actividad.
   - **Cambio:** índice `(location_id, sequence)`, que va directo a los últimos movimientos de la ubicación.
3. **Conteo total del kardex (`total` de la paginación).** Es un `COUNT(*)` de las filas filtradas.
   - En los datos sintéticos el artículo es la mitad de la tabla y el planificador elige un seq scan (~60 ms). Con datos reales, un artículo es una fracción pequeña y se resuelve por índice.
   - Queda como punto a vigilar si una ubicación acumula millones de movimientos. La salida sería una paginación sin total ("cargar más").
4. **Índices del resto del esquema:**
   - Todas las llaves foráneas tienen índice (verificado contra `pg_constraint`).
   - Los listados de documentos filtran por `(ubicación, estado)`, que está indexado.
   - La bitácora tiene índices por entidad, usuario y fecha.
   - El orden por `created_at` no tiene índice; con el volumen esperado (miles de documentos al año) no hace falta.

Migración: `TuneKardexIndexes`.
