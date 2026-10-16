# Especificación Backend — SGO AR · Paníssimo API

> Lee primero `docs/specs/dominio.md`: define entidades, estados y reglas (RN-xx) que este documento implementa.
>
> **Punto de partida.** El repositorio es un **fork del SGO AR** con B-01..B-21 terminadas (autenticación, permisos, catálogos, motor de inventario, conteos, traspasos, recetas, OP, compras, pedidos de sucursal, tablero, fotos, requerimiento de MP, costos de receta y análisis de consumo). Este documento conserva la base técnica del SGO y define **solo las tareas nuevas, B-22 en adelante**. No reescribas lo heredado salvo donde una tarea lo indique.

## 1. Objetivo

API REST de los módulos de Organización, Catálogos, Inventario, Producción (con cierres parciales, plan e importación de Excel), Logística, **Ventas a terceros**, Compras y Seguridad para Paníssimo. La consume únicamente el frontend Angular del mismo dominio.

## 2. Stack [Heredado]

Todas las dependencias deben tener licencia libre (MIT, Apache-2.0, BSD o PostgreSQL). **Antes de agregar un paquete no listado, verifica su licencia en la versión exacta** y anótala en el resumen de la tarea.

| Uso | Paquete / tecnología | Licencia |
|---|---|---|
| Runtime | .NET 10 (LTS), ASP.NET Core Web API con controllers | MIT |
| ORM | `Microsoft.EntityFrameworkCore` + `Npgsql.EntityFrameworkCore.PostgreSQL` | MIT / PostgreSQL |
| Nombres snake_case | `EFCore.NamingConventions` | Apache-2.0 |
| Identidad / JWT | `Microsoft.AspNetCore.Identity.EntityFrameworkCore`, `Microsoft.AspNetCore.Authentication.JwtBearer` | MIT |
| Validación | `FluentValidation` + `FluentValidation.DependencyInjectionExtensions` | Apache-2.0 |
| Logging | `Serilog.AspNetCore`, `Serilog.Sinks.Console` | Apache-2.0 |
| OpenAPI | `Microsoft.AspNetCore.OpenApi` + `Scalar.AspNetCore` | MIT |
| CSV | `CsvHelper` | MS-PL / Apache-2.0 |
| **Excel [Nuevo]** | **`ClosedXML` 0.105.x** (lectura del Excel de OP y generación de la plantilla) | **MIT** (verificado 16/10/2026 en nuget.org, v0.105.1) |
| Pruebas | `xunit`, `NSubstitute`, `Testcontainers.PostgreSql`, `Microsoft.AspNetCore.Mvc.Testing` | Apache-2.0 / BSD / MIT |
| Base de datos | PostgreSQL 16 (DigitalOcean Managed en producción) | PostgreSQL |

**Nota de licencia de ClosedXML:** depende de `SixLabors.Fonts`, que usa la *Six Labors Split License*: es Apache-2.0 **solo como dependencia transitiva** (o para empresas con menos de USD 1M de ingresos). Paníssimo supera ese umbral, así que **nunca agregues una referencia directa a ningún paquete `SixLabors.*`** (ni `ImageSharp`). Si una versión futura de ClosedXML cambia esa dependencia o su licencia, revisar antes de actualizar.

**Prohibidos:** MediatR, AutoMapper, MassTransit v9+, FluentAssertions v8+, **EPPlus v5+**, QuestPDF, Duende IdentityServer, Telerik, DevExpress, Syncfusion, referencias directas a `SixLabors.*`.

## 3. Arquitectura [Heredado]

Monolito modular en 4 proyectos (`Sgo.Domain`, `Sgo.Application`, `Sgo.Infrastructure`, `Sgo.Api`) con una carpeta por módulo. Se agrega el módulo **`Sales`** en los cuatro proyectos.

- Un servicio de aplicación por agregado, sin mediador; mapeo manual `ToDto()`.
- Transiciones de estado dentro de la entidad; una transición inválida lanza `BusinessRuleException` (422).
- `SgoDbContext` directo desde los servicios; consultas complejas en clases `*Queries`.
- `IClock` e `ICurrentUser` para tiempo y usuario.
- **El inventario solo se mueve con `IInventoryPostingService`**, dentro de la transacción del caso de uso.

Servicios nuevos o cambiados:

| Servicio | Módulo | Responsabilidad |
|---|---|---|
| `ProductionAreaService` | Production | CRUD de áreas |
| `ProductionOrderService` **[Cambia]** | Production | Alta, edición, liberar, cancelar, **cierre parcial y final** |
| `ProductionPlanQueries` / `ProductionPlanService` | Production | Plan de demanda neta (RN-70) y generación de OP (RN-71) |
| `ProductionOrderImportService` | Production | Plantilla, validación y alta desde Excel (RN-90..RN-95) |
| `IExcelOrderReader` / `ClosedXmlOrderReader` | Application / Infrastructure | Lee el `.xlsx` a filas crudas; la validación de negocio vive en el servicio |
| `CustomerService` | Sales | Clientes, puntos de entrega y artículos de cliente |
| `CustomerOrderService` | Sales | Pedidos de cliente (RN-80, RN-82) |
| `CustomerShipmentService` | Sales | Remisiones (RN-81, RN-82) |
| `ProductionReportQueries` | Production | Resumen de producción por área, producto y día |

## 4. Persistencia

- **Esquemas:** `org`, `catalog`, `inventory`, `production`, `logistics`, **`sales` [Nuevo]**, `purchasing`, `security`, `audit`.
- **Tipos, concurrencia (`xmin` → `version`), folios por `SEQUENCE`, auditoría con `[Audited]` e interceptores:** igual que el SGO.
- **Tablas nuevas:**

| Esquema | Tabla | Notas |
|---|---|---|
| `production` | `production_area` | `code` único |
| `production` | `production_close`, `production_close_line`, `production_close_line_lot` | `(production_order_id, sequence)` único; `folio` único |
| `production` | `production_order_demand` | Índice por `(demand_type, demand_line_id)` |
| `production` | `production_order_import` | Índice por `file_sha256` |
| `sales` | `customer`, `customer_delivery_point`, `customer_item` | `customer.code` único; `customer_item(customer_id, item_id)` único |
| `sales` | `customer_order`, `customer_order_line` | `status`, `required_date` indexados |
| `sales` | `customer_shipment`, `customer_shipment_line`, `customer_shipment_line_lot` | |

- **Columnas nuevas:** `catalog.item` (`presentation`, `bulk_item_id`, `units_per_package`, `production_area_id`, `production_multiple`, `unit_weight_grams`); `production.production_order` (`production_area_id`, `shift`, `source`, `import_id`, `total_cost`, `shortfall_reason`, `shortfall_notes`).
- **Columnas que se eliminan:** `production.production_order.output_lot_id` y la tabla `production_order_line_lot` (su información pasa a los cierres). Como la base de Paníssimo arranca vacía, la migración solo las elimina; no migra datos.
- **Índices nuevos:** `production_order(location_id, scheduled_date, status)`, `production_order(output_item_id, scheduled_date)`, `customer_order(supplying_location_id, required_date, status)`.
- **Semilla** (idempotente, en Development o con `--seed`):
  - Unidades de medida (incluye `pza`, `kg`, `g`, `l`, `ml`, `caja`, `bulto`, `paq`).
  - Ubicaciones: `PLANTA` (Factory) y las sucursales de `deploy/seed/locations.csv` (`codigo,nombre,direccion`), D-01. Sin el archivo, solo `PLANTA`.
  - Áreas de producción (dominio §4.1).
  - Roles y permisos (dominio §6).
  - Usuario administrador desde variables de entorno.
  - `AppSetting` con los valores por defecto, incluidos los nuevos (dominio §4.8).
- **Migraciones:** nombres descriptivos; nunca editar una migración aplicada. Para el fork se **conservan** las migraciones del SGO y se agregan las nuevas encima.

## 5. Motor de inventario [Heredado]

`IInventoryPostingService.PostAsync`, `ILotAllocator` (FEFO sin vencidos), `ILotRegistry` (con candado por artículo y lote) y la transacción por caso de uso **no cambian**. Se agrega `MovementType.CustomerShipment` al enum y a los filtros del kardex.

**Cierre de producción (RN-61..RN-64), dentro de una transacción `ReadCommitted`:**

1. Cargar la OP con `SELECT … FOR UPDATE` y comparar `version` (409 si difiere). Validar estado (`Released` o `InProgress`), tipo de cierre y RN-63 (tolerancia, cierre final sin producción previa, motivo de faltante).
2. Para cada componente: consumo real (o teórico por omisión, RN-11 sobre `ProducedQty` del cierre). Lotes elegidos (deben sumar el consumo real) o `ILotAllocator` (FEFO).
3. `PostAsync` con las salidas `ProductionConsumption` (costo promedio vigente).
4. `TotalCost` = Σ costos de las salidas; `UnitCost` = `TotalCost / ProducedQty`.
5. Si `ProducedQty > 0`: crear el lote (`ILotRegistry`, número `{folio}-{nn}`, caducidad RN-62) y `PostAsync` con la entrada `ProductionOutput` a `UnitCost`.
6. Guardar `ProductionClose` con sus líneas y lotes; actualizar acumulados de la OP (`ProducedQty`, `TotalCost`, `UnitCost`, `ActualQty` por línea) y su estado.
7. `SaveChangesAsync` y `CommitAsync`. Si algo falla, no queda nada.

**Remisión (RN-81):** igual que el despacho de traspasos: lotes elegidos o FEFO, `PostAsync` con `CustomerShipment` negativo, costo promedio vigente como `UnitCost`, actualización de `ShippedQty` del pedido bajo `FOR UPDATE` del pedido.

## 6. Plan de producción (RN-70)

`ProductionPlanQueries.GetAsync(locationId, from, to, areaId?, q?)`:

1. **Productos candidatos:** `FinishedGood` e `Intermediate` activos que tengan demanda en el rango, mínimo configurado en la ubicación u OP abiertas.
2. **Demanda por (producto, día):** pedidos de sucursal (`Submitted`: solicitado; `Approved`: aprobado − despachado) y pedidos de cliente (`Confirmed`, `PartiallyShipped`: cantidad − remisionado) por `RequiredDate`; para `Intermediate`, el requerimiento RN-11 de lo pendiente de producir de OP abiertas que lo usan, por su `ScheduledDate`; reposición a stock (`MaxQty − proyectado` si proyectado < `MinQty`) en el primer día.
3. **Oferta:** existencia utilizable de la ubicación (sin lotes vencidos) y pendiente de producir de OP `Draft`/`Released`/`InProgress` (fechas previas al rango cuentan en el primer día).
4. **Neto por día, acumulado:** recorrer los días en orden con `disponible = existencia`; cada día suma la oferta de OP de ese día, resta la demanda y, si queda negativo, `porProducir = ceilMultiple(−disponible, ProductionMultiple)` y `disponible += porProducir`.
5. Respuesta por renglón `(itemId, date)`: SKU, nombre, tipo, presentación, área, unidad, demanda desglosada (`branchOrders`, `customerOrders`, `stockReplenishment`, `parentOrders`), existencia, OP pendientes, `suggestedQty` y la lista de líneas de pedido que la originan (`demandLines: [{ type, lineId, folio, requiredDate, quantity }]`).
6. Con `q`, filtrar por SKU o nombre; con `areaId`, por área del producto. Ordenar por fecha, área y SKU.

**Rendimiento:** con 300 productos, 7 días, 500 líneas de pedido y 300 OP abiertas, la consulta responde en < 1 s. Se resuelve con 4–5 consultas agregadas (no una por producto) y el cálculo en memoria.

`ProductionPlanService.GenerateAsync` (RN-71): recibe renglones elegidos con cantidad; valida receta activa, cantidad (> 0, RN-03b) y alcance; crea una OP `Draft` por `(producto, fecha, área, turno)` con `Source = Plan`; reparte la cantidad entre las líneas de pedido del renglón (por `RequiredDate`) en `ProductionOrderDemand`. Todo o nada.

## 7. Importación de OP desde Excel (RN-90..RN-95)

- **Lectura:** `ClosedXmlOrderReader` abre el archivo en memoria (máx. **5 MB**), toma la hoja `OP` o la primera, mapea encabezados normalizados (minúsculas, sin acentos ni espacios) y devuelve filas crudas con su número de fila de Excel. Fechas: celda de fecha de Excel o texto `dd/mm/aaaa`. No evalúa fórmulas externas; usa el valor en caché de la celda.
- **Validación:** `ProductionOrderImportService.ValidateAsync(stream, fileName)` resuelve SKU, áreas y ubicaciones con consultas en lote (no una por fila), aplica RN-90 y RN-03b, agrupa (RN-92) y calcula avisos (RN-93). Devuelve:

  ```json
  {
    "fileSha256": "…", "rowCount": 284, "orderCount": 271,
    "errors": [{ "row": 12, "column": "sku", "message": "El SKU 'BOM-01' no existe o no está activo." }],
    "warnings": [{ "code": "duplicate_file", "message": "Este archivo ya se importó el 14/10/2026 (IMP-000003)." },
                 { "code": "existing_order", "row": 30, "message": "Ya existe la OP OP-000812 de BOMBAS para el 17/10/2026, turno Noche." }],
    "orders": [{ "rows": [5, 9], "scheduledDate": "2026-10-17", "itemId": "…", "sku": "…", "name": "…",
                 "areaName": "Bizcocho Día", "shift": "Night", "quantity": 3200, "uom": "pza", "recipeVersion": 3 }]
  }
  ```

- **Alta:** `CreateAsync(stream, fileName, confirmWarnings, releaseOnImport)` vuelve a validar el mismo archivo (el servidor no guarda estado entre la vista previa y el alta). Si hay errores → 400 con la misma estructura; si hay avisos y `confirmWarnings = false` → 422 `import_warnings_not_confirmed`. Crea `ProductionOrderImport` y las OP en una transacción. Con `releaseOnImport` las crea en `Released`.
- **Plantilla:** `GET /production-order-imports/template` genera con ClosedXML un `.xlsx` con la hoja `OP` (encabezados, formato de fecha, validación de lista en `turno`) y una hoja `Instrucciones`.
- **Rendimiento:** 3,000 filas se validan en < 5 s y se importan en < 10 s.

## 8. API

### 8.1 Convenciones [Heredado]

Prefijo `/api/v1`, recursos en plural y `kebab-case`, acciones de estado como `POST` sobre subrecurso, listados paginados (`page`, `pageSize` ≤ 100, `sort`, `q`, filtros), `version` en los detalles, JSON `camelCase` con enums como texto, errores `ProblemDetails` en español:

| Situación | HTTP | Extensiones |
|---|---|---|
| Validación | 400 | `errors: { campo: [mensajes] }` |
| No autenticado | 401 | |
| Sin permiso o fuera de alcance | 403 | |
| No encontrado | 404 | |
| Concurrencia | 409 | `code: "concurrency"` |
| Existencia insuficiente | 409 | `code: "insufficient_stock"`, `shortages` |
| Regla de negocio | 422 | `code: "<regla>"` |

Códigos 422 nuevos: `production_overrun`, `production_shortfall_reason_required`, `production_order_has_closes`, `production_final_close_empty`, `recipe_not_found`, `import_warnings_not_confirmed`, `customer_order_not_confirmed`, `customer_shipment_exceeds_order`, `item_presentation_not_allowed`.

### 8.2 Endpoints heredados

Todos los del SGO (auth, `/me`, ubicaciones, unidades, categorías, artículos, lookup, fotos, existencias, kardex, alertas, ajustes, conteos, consumos, existencias iniciales, recetas, explosión, pedidos de sucursal, traspasos, proveedores, requisiciones, OC, recepciones, usuarios, roles, permisos, bitácora, settings, tablero, requerimiento de MP, costos de receta y análisis de consumo) siguen igual, salvo:

- `POST /production-orders/{id}/complete` **se elimina** (lo reemplaza `/closes`).
- `GET /items` y `GET /items/lookup` aceptan `presentation=Bulk|Packaged`, `type=Supply` y `areaId`. Los DTO de artículo incluyen los campos nuevos.
- `POST /imports/items` (CSV) agrega las columnas `presentacion`, `sku_granel`, `piezas_por_paquete`, `area`, `multiplo_op` y `gramaje_g` (opcionales) y acepta el tipo `insumo`.
- `GET /production-orders` acepta `areaId`, `shift`, `source`, `importId` y `status=InProgress`; el DTO de lista trae `producedQty`, `progressPct` y `closeCount`.
- `GET /movements?type=CustomerShipment` y el enlace al documento `RM`.
- `/branch-orders` valida RN-80/D-05: una sucursal no pide `Packaged` ni `Intermediate` (422 `item_presentation_not_allowed`).

### 8.3 Endpoints nuevos

Entre corchetes, el permiso requerido.

**Producción**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/production-areas`, `/production-areas/{id}` | [production.view] / [production.areas.manage] |
| GET | `/production-orders/{id}/closes` — cierres de la OP con líneas y lotes | [production.view] |
| POST | `/production-orders/{id}/closes` — `{ version, kind: "Partial"\|"Final", producedQty, shift?, notes?, shortfallReason?, shortfallNotes?, lines: [{ componentItemId, actualQty, lots?: [{ lotId, qty }] }] }` → `201` con el cierre y la OP actualizada | [production.orders.complete] |
| GET | `/production-orders/{id}/close-preview?qty=` — teórico por componente para `qty`, existencia y costo estimado | [production.view] |
| GET | `/production-closes?locationId&from&to&areaId&itemId` — lista de cierres (para reportes y kardex) | [production.view] |
| GET | `/production-closes/{id}` | [production.view] |
| GET | `/production-plan?locationId&from&to&areaId&q` — RN-70 | [production.view] |
| POST | `/production-plan/generate` — `{ locationId, lines: [{ itemId, date, areaId?, shift?, quantity, demandLineIds? }] }` → OP creadas | [production.orders.manage] |
| GET | `/production-orders/{id}/demands` — pedidos que atiende la OP y su avance | [production.view] |
| GET | `/production-order-imports/template` — plantilla `.xlsx` | [production.orders.import] |
| POST | `/production-order-imports/validate` — `multipart/form-data` (`file`) → vista previa con errores y avisos | [production.orders.import] |
| POST | `/production-order-imports` — `multipart/form-data` (`file`, `confirmWarnings`, `releaseOnImport`) → `201` con el folio y las OP | [production.orders.import]; liberar exige también [production.orders.manage] |
| GET | `/production-order-imports`, `/production-order-imports/{id}` | [production.view] |
| GET | `/reports/production-summary?locationId&from&to&groupBy=area\|item\|day` — producido, planeado, % de cumplimiento, costo y merma | [production.view] |

**Ventas a terceros**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/customers`, `/customers/{id}` | [sales.view] / [sales.customers.manage] |
| GET / POST / PUT | `/customers/{id}/delivery-points`, `/customers/{id}/delivery-points/{pointId}` | [sales.view] / [sales.customers.manage] |
| GET / POST / PUT | `/customers/{id}/items` | [sales.view] / [sales.customers.manage] |
| GET | `/customers/lookup?q&limit` | [sales.view] |
| GET / POST / PUT | `/customer-orders`, `/customer-orders/{id}` — PUT solo en `Draft` | [sales.view] / [sales.orders.manage] |
| POST | `/customer-orders/{id}/confirm`, `/cancel`, `/close` (`close` con `{ version, reason }`) | [sales.orders.manage] |
| GET | `/customer-orders/{id}/shipments` | [sales.view] |
| POST | `/customer-orders/{id}/shipments` — crea la remisión en `Draft` con el saldo (o `{ lines: [{ orderLineId, quantity }] }`) | [sales.shipments.dispatch] |
| GET / PUT | `/customer-shipments`, `/customer-shipments/{id}` — PUT solo en `Draft` | [sales.view] / [sales.shipments.dispatch] |
| POST | `/customer-shipments/{id}/dispatch` — `{ version, vehicleDescription, driverName, receivedByName?, lines?: [{ lineId, lots: [{ lotId, qty }] }] }` | [sales.shipments.dispatch] |
| POST | `/customer-shipments/{id}/cancel` (solo `Draft`) | [sales.shipments.dispatch] |

**Tablero [Cambia]**: `GET /dashboard` agrega los bloques `productionInProgress` (OP en proceso y su avance, [production.view]), `productionToday` (OP del día por área: planeado vs producido, [production.view]), `customerOrdersDue` (pedidos de cliente confirmados con fecha hoy o vencida, [sales.view]) y `customerShipmentsToDispatch` (remisiones en borrador, [sales.shipments.dispatch]).

## 9. Seguridad [Heredado]

Identity, JWT de 15 min, refresh rotativo con ventana de gracia de 30 s, `[RequirePermission]` dinámico con caché de 5 min, `ILocationScope`, rate limiting en login y `UseForwardedHeaders`. Reglas de alcance nuevas:

- OP, cierres, plan e importación: alcance sobre la ubicación de la OP (la Planta).
- Pedidos de cliente y remisiones: alcance sobre `SupplyingLocationId` / `FromLocationId`.
- Los clientes son un catálogo global (no tienen ubicación).

## 10. Validación, errores, logging y configuración [Heredado]

FluentValidation por DTO; `IExceptionHandler` → `ProblemDetails`; Serilog JSON; health checks `/health/live` y `/health/ready`; variables `SGO__…` (ver `.env.example`). Nueva variable opcional `SGO__Seed__LocationsCsv` (ruta del CSV de sucursales, default `deploy/seed/locations.csv`). El límite de subida de archivos de importación es de 5 MB (`RequestSizeLimit` en el endpoint, no global).

## 11. Pruebas

Se conservan todas las del SGO (ajustando las de OP al nuevo flujo). Nuevas obligatorias:

**Unitarias**
- Máquina de estados de la OP: todas las transiciones válidas e inválidas (incluye cancelar con cierres → 422, cierre en `Draft` → 422, cierre después de `Completed` → 422).
- RN-63: tolerancia de sobreproducción (límite exacto y uno arriba), motivo obligatorio con faltante, cierre final en 0 con y sin cierres previos.
- RN-62: número de lote y caducidad por cierre; producto sin lotes.
- RN-03b: cantidades fraccionarias en `pza` rechazadas.
- RN-70: neto acumulado por día (existencia cubre primero el día próximo, OP de fecha posterior no cubre días anteriores, redondeo al múltiplo, reposición a stock, demanda de semiterminado desde OP padre).
- RN-90..RN-93: encabezados con acentos y mayúsculas, fechas en texto y de Excel, fecha pasada, SKU inexistente, tipo inválido, sin receta, cantidad decimal en `pza`, agrupación, archivo duplicado, OP existente.
- Máquinas de estado de pedido de cliente y remisión; RN-82 con tolerancia.

**Integración (Testcontainers)**
- OP con **dos cierres parciales y un cierre final**: kardex con salidas y entradas por cierre, tres lotes con su caducidad, costos por cierre y acumulado, merma por cierre, estado final `Completed`.
- Cierre con existencia insuficiente: 409 con `shortages` y sin movimientos parciales; la OP no cambia.
- Dos cierres simultáneos de la misma OP: uno 201 y otro 409.
- Plan → generar OP → la OP aparece como "cubierto" en el plan siguiente y ligada a los pedidos.
- Importación: archivo con errores (400, nada creado); archivo válido (OP creadas, agrupadas y ligadas a `IMP`); mismo archivo otra vez sin confirmar (422) y confirmado (201).
- Pedido de cliente → confirmar → remisión parcial → remisión final → pedido `Shipped`; kardex con `CustomerShipment`; lote vencido rechazado.
- Seguridad: Supervisor de producción puede cerrar pero no crear OP; Ventas a clientes no puede despachar; 403 por ubicación fuera de alcance.

## 12. Contenedores y despliegue [Heredado]

Igual que el SGO: `backend/Dockerfile` multi-stage con bundle de migraciones (`linux-x64` o `linux-arm64`), `deploy/docker-compose.yml` (api + web Caddy + migrate), Postgres administrado de DigitalOcean en producción y overlay `docker-compose.demo.yml` para la demo en Oracle Cloud Free. El nombre del sitio y los textos cambian en B-22.

## 13. Plan de implementación (tareas para Claude Code)

Cada tarea deja el código compilando, con pruebas en verde y la migración creada si aplica. Una tarea por sesión, empezando en modo plan. **Antes de empezar una tarea, revisa en `dominio.md` §8 que sus decisiones abiertas estén confirmadas.**

**Fase 0: adaptación del fork**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-22 | Adaptar el fork: nombre "SGO AR · Paníssimo" en OpenAPI y textos, `CLAUDE.md` y `docs/AVANCE.md` nuevos, semilla de ubicaciones (`PLANTA` + CSV), quitar `Commissary` de la semilla y de los derivados, roles del dominio §6 y permisos nuevos (vacíos de función hasta sus tareas), settings nuevos. Ajustar las pruebas heredadas que asumían `FAB`/`COM`/`SUC-01..10` | D-01, D-10 | Base limpia con `--seed` crea la Planta, las sucursales del CSV, 10 roles y el admin; `dotnet test` en verde |
| B-23 | Catálogos: tipo `Supply`, `Presentation`, `BulkItemId`, `UnitsPerPackage`, `ProductionAreaId`, `ProductionMultiple`, `UnitWeightGrams`; CRUD de `/production-areas`; reglas de validación (presentación obligatoria en terminados, granel no apunta a otro, `BulkItemId` debe ser `Bulk` activo); CSV de artículos con columnas nuevas; filtros en `/items` y `/items/lookup`; recetas aceptan `Supply` como componente; pedidos de sucursal rechazan `Packaged`/`Intermediate`. Migración `AddPanissimoCatalog` | D-05 | Integración: alta de `TRENZA` (granel) y `TRENZA EMBOLSADA` ligada; CSV con errores por fila en las columnas nuevas; pedido de sucursal con empaquetado → 422 |

**Fase 1: producción**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-24 | **OP con cierres parciales y final** (RN-60..RN-66): estado `InProgress`, `ProductionClose` y sus líneas y lotes, área y turno en la OP, `close-preview`, `/closes`, `/production-closes`, eliminar `/complete` y `output_lot_id`, ajustar `GET /production-orders` y el kardex. Migración `AddProductionCloses` | D-02, D-03 | Integración: 2 parciales + final con kardex, lotes, costos y merma correctos; 409 por faltantes sin movimientos parciales; cierres concurrentes 201/409; cancelar con cierres → 422 |
| B-25 | **Plan de producción** (RN-70..RN-73): `GET /production-plan`, `POST /production-plan/generate`, `ProductionOrderDemand`, `GET /production-orders/{id}/demands`; RN-50 cuenta OP `InProgress` por lo pendiente. La demanda de pedidos de cliente se deja como interfaz (`IDemandSource`) y la conecta B-26. Migración `AddProductionDemand` | D-04 | Integración: pedidos de sucursal y mín/máx → plan con neto acumulado y múltiplo → generar → OP ligadas y plan cubierto; semiterminado "por producir" desde la OP padre; < 1 s con el volumen de §6 |
| B-28 | **Importación de OP desde Excel** (RN-90..RN-95) con ClosedXML: plantilla, validar, importar, listado de importaciones. Migración `AddProductionOrderImports` | D-07 | Integración con archivos `.xlsx` de prueba en `tests/Fixtures/`: errores por fila, agrupación, avisos y confirmación, liberar al importar; 3,000 filas en < 10 s |

**Fase 2: ventas a terceros**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-26 | **Clientes y pedidos de cliente** (RN-80, RN-82 sin remisiones): `/customers` con puntos de entrega y artículos, `/customer-orders` con confirmar, cancelar y cerrar; los pedidos confirmados aparecen en el plan. Migración `AddSales` | D-06, D-09 | Integración: alta de cliente con 2 puntos de entrega; pedido con artículo a granel → 422; pedido confirmado suma demanda en `/production-plan` |
| B-27 | **Remisiones** (RN-81, RN-82): crear desde pedido, editar borrador, despachar con lotes o FEFO, cancelar borrador; `MovementType.CustomerShipment`; avance y estados del pedido. Migración `AddCustomerShipments` | D-09 | Integración: pedido → remisión parcial → final → `Shipped`; kardex y existencia de la Planta correctos; sobre-remisión → 422; lote vencido rechazado |

**Fase 3: tablero, reportes y endurecimiento**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-29 | Tablero con los bloques nuevos y `GET /reports/production-summary` (por área, producto o día: planeado, producido, % de cumplimiento, costo, merma de producción en $) | — | Cada bloque respeta permisos; el resumen por área de un mes de prueba cuadra con la suma de los cierres |
| B-30 | Endurecimiento: índices nuevos, `EXPLAIN` del plan, de la lista de OP y del kardex con 300 OP diarias durante 90 días (~27,000 OP y ~80,000 cierres de prueba), revisión de licencias de todos los paquetes, `.env.example` y `deploy/README.md` actualizados | — | Plan < 1 s, lista de OP < 300 ms, kardex < 300 ms; resultados en `docs/rendimiento.md` |

**Orden sugerido:** B-22 → B-23 → B-24 → B-25 → B-26 → B-27 → B-28 → B-29 → B-30. B-26 puede adelantarse a B-25 si Paníssimo prioriza los pedidos de cliente; B-28 solo depende de B-24.
