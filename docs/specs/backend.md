# Especificación Backend — SGO Paníssimo API

> Lee primero `docs/specs/dominio.md`: define entidades, estados y reglas (RN-xx) que este documento implementa.
>
> **Implementación desde cero, fase por fase.** El repositorio es nuevo. El SGO AR es la referencia funcional, pero no se copia su código: este documento describe todo lo necesario.

## 1. Objetivo

API REST de los módulos de Organización, Catálogos, Inventario, Producción (recetas, OP con cierres parciales y final, importación de Excel y plan), Logística, Ventas a terceros, Compras, Seguridad y Tablero de Paníssimo. La consume únicamente el frontend Angular del mismo dominio.

## 2. Stack

Todas las dependencias deben tener licencia libre (MIT, Apache-2.0, BSD o PostgreSQL). **Antes de agregar un paquete no listado, verifica su licencia en la versión exacta** y anótala en el resumen de la tarea.

| Uso | Paquete / tecnología | Licencia |
|---|---|---|
| Runtime | .NET 10 (LTS), ASP.NET Core Web API con controllers | MIT |
| ORM | `Microsoft.EntityFrameworkCore` + `Npgsql.EntityFrameworkCore.PostgreSQL` | MIT / PostgreSQL |
| Nombres snake_case | `EFCore.NamingConventions` | Apache-2.0 |
| Identidad | `Microsoft.AspNetCore.Identity.EntityFrameworkCore` | MIT |
| JWT | `Microsoft.AspNetCore.Authentication.JwtBearer` | MIT |
| Validación | `FluentValidation` + `FluentValidation.DependencyInjectionExtensions` | Apache-2.0 |
| Logging | `Serilog.AspNetCore`, `Serilog.Sinks.Console` | Apache-2.0 |
| OpenAPI | `Microsoft.AspNetCore.OpenApi` + `Scalar.AspNetCore` | MIT |
| CSV | `CsvHelper` | MS-PL / Apache-2.0 |
| Excel | `ClosedXML` 0.105.x (importación de OP y plantilla) | MIT (verificado el 16/10/2026, v0.105.1) |
| Pruebas | `xunit`, `NSubstitute`, `Testcontainers.PostgreSql`, `Microsoft.AspNetCore.Mvc.Testing` | Apache-2.0 / BSD / MIT |
| Base de datos | PostgreSQL 16 (DigitalOcean Managed en producción) | PostgreSQL |

**Nota sobre ClosedXML:** depende de `SixLabors.Fonts`, con *Six Labors Split License*: es Apache-2.0 **solo como dependencia transitiva** o para empresas con menos de USD 1M de ingresos. Paníssimo supera ese umbral: **nunca agregues una referencia directa a un paquete `SixLabors.*`** (tampoco `ImageSharp`). Revisa la licencia de ClosedXML y sus dependencias antes de actualizar de versión.

**Prohibidos:** MediatR, AutoMapper, MassTransit v9+, FluentAssertions v8+, EPPlus v5+, QuestPDF, Duende IdentityServer, Telerik, DevExpress, Syncfusion y referencias directas a `SixLabors.*`.

## 3. Arquitectura

**Monolito modular en 4 proyectos**, cada uno con una carpeta por módulo:

```
backend/
├── Panissimo.sln
├── src/
│   ├── Panissimo.Domain/          # Entidades, enums, reglas puras, excepciones de dominio
│   │   ├── Common/                # Entity, AuditableEntity, BusinessRuleException, DocType
│   │   ├── Organization/          # Location, ProductionArea
│   │   ├── Catalog/
│   │   ├── Inventory/
│   │   ├── Production/
│   │   ├── Logistics/
│   │   ├── Sales/
│   │   ├── Purchasing/
│   │   └── Security/
│   ├── Panissimo.Application/     # Servicios de caso de uso, DTOs, validadores, interfaces
│   │   ├── Common/                # PagedResult, ListQuery, ICurrentUser, ILocationScope, IClock, IUserDirectory
│   │   └── <Módulo>/              # <Entidad>Service, Dtos/, Validators/, Mapping, *Queries
│   ├── Panissimo.Infrastructure/  # EF Core, configuraciones, migraciones, Identity, folios, auditoría, Excel
│   │   ├── Persistence/
│   │   │   ├── AppDbContext.cs
│   │   │   ├── Configurations/<Módulo>/
│   │   │   ├── Interceptors/      # AuditInterceptor, TimestampsInterceptor
│   │   │   ├── Migrations/
│   │   │   └── Seed/
│   │   ├── Identity/
│   │   ├── Inventory/             # InventoryPostingService, LotAllocator, LotRegistry
│   │   └── Excel/                 # ClosedXmlOrderReader, plantilla
│   └── Panissimo.Api/             # Host, controllers, auth, middleware, Program.cs
│       ├── Controllers/<Módulo>/
│       ├── Auth/                  # PermissionPolicyProvider, RequirePermissionAttribute
│       └── Middleware/            # ExceptionHandler → ProblemDetails
└── tests/
    ├── Panissimo.UnitTests/
    └── Panissimo.IntegrationTests/
```

**Dependencias:** `Domain` no depende de nada; `Application` → `Domain`; `Infrastructure` → `Application` y `Domain`; `Api` → todos, solo para composición.

**Patrones:**
- Un servicio de aplicación por agregado (`PurchaseOrderService`, `ProductionOrderService`…), inyectado por interfaz. **Sin mediador.**
- Mapeo manual con métodos de extensión `ToDto()`.
- Las transiciones de estado viven en la entidad (`order.Release()`, `transfer.Dispatch(...)`); una transición inválida lanza `BusinessRuleException(code, mensaje)`.
- `AppDbContext` se usa directamente desde los servicios (sin repositorio genérico). Las consultas complejas van en clases `*Queries`.
- `IClock` e `ICurrentUser` para tiempo y usuario; `IUserDirectory` resuelve nombres de usuario en lote (una consulta por documento o página) para los campos `*ByName`.
- **El inventario solo se mueve con `IInventoryPostingService`** dentro de la transacción del caso de uso.

## 4. Persistencia

- **Esquemas por módulo:** `org`, `catalog`, `inventory`, `production`, `logistics`, `sales`, `purchasing`, `security`, `audit`.
- **Nombres:** tablas y columnas en `snake_case` (`UseSnakeCaseNamingConvention()`).
- **Tipos:** cantidades y costos `numeric(18,4)`; montos de OC `numeric(18,2)` (redondeo por línea); fechas `timestamptz`; fechas de negocio `date`; enums como `text`.
- **Concurrencia optimista** en documentos y catálogos con la columna de sistema `xmin`. Los DTO de detalle exponen `version`; edición y cambios de estado reciben `version` y responden **409** si no coincide.
- **Folios:** una `SEQUENCE` por tipo de documento; `IFolioGenerator.NextAsync(DocType)` devuelve `OC-000001`. Índice único de `folio` por tabla.
- **Catálogos inactivos** no se filtran globalmente (deben verse en históricos). Los listados filtran activos por omisión; `?includeInactive=true` los incluye.
- **Auditoría:** `AuditInterceptor` (`SaveChangesInterceptor`) escribe en `audit.audit_log` los cambios de entidades marcadas con `[Audited]` (binarios solo por tamaño). `TimestampsInterceptor` llena `CreatedAt/By` y `UpdatedAt/By`. Ids compuestos (`userId|locationId`) para relaciones; `/audit-log?entityId=X` trae también `X|…`.
- **Candados transaccionales:** `ITransactionLocks` con `pg_advisory_xact_lock` para crear un lote nuevo por `(artículo, lote)` y para cambiar el proveedor preferido de un artículo. Una violación de índice único (`23505`) no prevista responde **409 `duplicate`**.
- **Índices mínimos:**
  - `inventory_movement(location_id, item_id, occurred_at)` y un índice cubriente para el saldo corrido del kardex.
  - `stock_balance(location_id, item_id, lot_id)` único (con `NULLS NOT DISTINCT`).
  - `lot(item_id, lot_number)` único y `lot(item_id, expiration_date)`.
  - `status` en tablas de documento.
  - `production_order(location_id, scheduled_date, status)`, `production_order(output_item_id, scheduled_date)`.
  - `production_close(production_order_id, sequence)` único.
  - `production_order_demand(demand_type, demand_line_id)`; `production_order_import(file_sha256)`.
  - `branch_order(supplying_location_id, required_date, status)`, `customer_order(supplying_location_id, required_date, status)`.
  - `supplier_item(item_id) WHERE is_preferred` único parcial; `supplier.tax_id` único parcial excepto genéricos.
  - Trazabilidad (B-28): `goods_receipt_line(lot_id)`, `production_close_line_lot(lot_id)`, `production_close(output_lot_id)`, `transfer_line(lot_id)` (cada lote despachado es una línea), `customer_shipment_line_lot(lot_id)` e `inventory_movement(lot_id, location_id) INCLUDE (type, quantity, occurred_at)`.
- **Migraciones:** nombre descriptivo por tarea (`AddCatalog`, `AddProductionCloses`…). **Nunca modificar una migración ya aplicada**; crear una nueva. En producción se aplican con un **bundle**, nunca al arrancar.
- **Semilla** (idempotente; en Development o con `--seed`):
  - Unidades de medida (`kg`, `g`, `l`, `ml`, `pza`, `caja`, `bulto`, `paq`).
  - Ubicaciones: `PLANTA` (Plant) y las sucursales de `deploy/seed/locations.csv` (`codigo,nombre,direccion`), D-01. Sin el archivo, solo `PLANTA`.
  - Áreas de producción (dominio §4.1).
  - Permisos y roles (dominio §6), identificados por `system_key`.
  - Usuario administrador con credenciales de variables de entorno.
  - `AppSetting` con sus valores por defecto (dominio §4.8).

## 5. Motor de inventario (núcleo crítico)

Todo movimiento pasa por un solo servicio:

```csharp
public interface IInventoryPostingService
{
    // Debe llamarse dentro de una transacción abierta por el servicio de aplicación.
    Task<IReadOnlyList<InventoryMovement>> PostAsync(IEnumerable<MovementRequest> requests, CancellationToken ct);
}

public sealed record MovementRequest(
    Guid LocationId, Guid ItemId, Guid? LotId, MovementType Type,
    decimal Quantity,            // con signo, unidad base
    decimal? UnitCost,           // requerido en entradas externas; null = promedio vigente
    string SourceDocType, Guid SourceDocId, string SourceDocFolio, string? Notes);
```

**Algoritmo:**

1. Agrupar las solicitudes y ordenarlas por `(LocationId, ItemId, LotId)` (evita deadlocks).
2. Bloquear las filas con `SELECT … FOR UPDATE` (SQL crudo con `FromSql`). Si la fila de `stock_balance` o `item_location_cost` no existe, crearla.
3. Validar RN-02: la existencia resultante debe ser ≥ 0. Acumular **todos** los faltantes y lanzar `InsufficientStockException(faltantes)`.
4. Calcular costos (RN-04): actualizar `item_location_cost` en las entradas; usar el promedio vigente en las salidas.
5. Insertar `InventoryMovement` y actualizar `StockBalance`.

**Lotes:**
- `ILotAllocator.AllocateAsync(locationId, itemId, qty, ct)` devuelve `[(LotId, Qty)]` por FEFO, excluye vencidos (RN-05) y lanza `InsufficientStockException` si no alcanza.
- `ILotRegistry.GetOrCreateAsync(itemId, lotNumber, expiration, sourceDoc)` toma el candado por `(artículo, lote)`, reutiliza el lote existente (rechaza una caducidad distinta) o lo crea. Exige transacción.

**Transacciones:** cada caso de uso que mueve inventario abre `BeginTransactionAsync(IsolationLevel.ReadCommitted)`, hace los cambios de documento más `PostAsync`, `SaveChangesAsync` y `CommitAsync`. Si algo falla, no queda nada registrado.

### 5.1 Cierre de producción (RN-61..RN-66)

En una transacción:

1. Cargar la OP con `SELECT … FOR UPDATE` y comparar `version` (409). Validar estado, tipo de cierre y RN-63 (tolerancia, cierre final sin producción previa, motivo de faltante) y RN-03b.
2. Por componente: consumo real (o teórico RN-11 sobre el `ProducedQty` del cierre). Lotes elegidos (deben sumar el consumo real; vencidos rechazados) o `ILotAllocator`.
3. `PostAsync` con las salidas `ProductionConsumption`.
4. `TotalCost` = Σ costos de las salidas; `UnitCost` = `TotalCost / ProducedQty`.
5. Si `ProducedQty > 0`: lote `{folio}-{nn}` con `ILotRegistry` (si el producto maneja lotes) y `PostAsync` con la entrada `ProductionOutput` a `UnitCost`.
6. Guardar `ProductionClose` (líneas, lotes y merma por línea); actualizar acumulados y estado de la OP.
7. `SaveChangesAsync` y `CommitAsync`.

### 5.2 Remisión (RN-81, RN-82)

Igual que el despacho de traspasos: bloquear remisión y pedido (`FOR UPDATE` + `version`), validar saldo y tolerancia, lotes elegidos o FEFO, `PostAsync` con `CustomerShipment` negativo al costo promedio vigente, actualizar `ShippedQty` y estado del pedido.

## 6. Plan de producción (RN-70, RN-71)

`ProductionPlanQueries.GetAsync(locationId, from, to, areaId?, q?)`:

1. **Candidatos:** `FinishedGood` y `SemiFinished` activos con demanda en el rango, mínimo configurado en la ubicación u OP abiertas.
2. **Demanda por (producto, día):** pedidos de sucursal (`Submitted`: solicitado; `Approved`: aprobado − despachado) y de cliente (`Confirmed`, `PartiallyShipped`: cantidad − remisionado) por `RequiredDate`; para `SemiFinished`, RN-11 sobre lo pendiente de OP abiertas que lo usan, por su `ScheduledDate`; reposición a stock en el primer día.
3. **Oferta:** existencia utilizable y pendiente de OP `Draft`/`Released`/`InProgress` (las de fecha anterior al rango cuentan en el primer día).
4. **Neto acumulado:** recorrer los días con `disponible = existencia`; cada día suma la oferta de OP de ese día y resta la demanda; si `disponible < 0`, `sugerido = ceilMultiple(−disponible, ProductionMultiple)` y `disponible += sugerido`.
5. Respuesta por renglón `(itemId, date)`: SKU, nombre, tipo, presentación, área, unidad, demanda desglosada (`branchOrders`, `customerOrders`, `stockReplenishment`, `parentOrders`), existencia, OP pendientes, `suggestedQty` y `demandLines: [{ type, lineId, folio, partyName, requiredDate, quantity }]`.
6. Filtros `q` (SKU o nombre) y `areaId`. Orden: fecha, área, SKU.

Las fuentes de demanda se implementan como `IDemandSource` (pedidos de sucursal, pedidos de cliente, OP padre), para agregarlas por fases. **Rendimiento:** 300 productos, 7 días, 500 líneas de pedido y 300 OP abiertas en < 1 s, con consultas agregadas (no una por producto) y cálculo en memoria.

`ProductionPlanService.GenerateAsync` (RN-71): renglones elegidos con cantidad → valida receta activa, RN-03b y alcance → una OP `Draft` por `(producto, fecha, área, turno)` con `Source = Plan` → reparte la cantidad entre las líneas de pedido del renglón por `RequiredDate` en `ProductionOrderDemand`. Todo o nada.

## 7. Importación de OP desde Excel (RN-90..RN-95)

- **Lectura:** `IExcelOrderReader` (implementación `ClosedXmlOrderReader`) abre el archivo en memoria (máx. 5 MB), toma la hoja `OP` o la primera, normaliza encabezados (minúsculas, sin acentos ni espacios) y devuelve filas crudas con su número de fila. Fechas: celda de fecha o texto `dd/mm/aaaa`. Usa el valor en caché de las fórmulas.
- **Validación:** `ProductionOrderImportService.ValidateAsync(stream, fileName)` resuelve SKU, áreas y ubicaciones en lote, aplica RN-90 y RN-03b, agrupa (RN-92) y calcula avisos (RN-93):

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

- **Alta:** `CreateAsync(stream, fileName, confirmWarnings, releaseOnImport)` revalida el mismo archivo (el servidor no guarda estado entre la vista previa y el alta). Errores → 400 con la misma estructura; avisos sin confirmar → 422 `import_warnings_not_confirmed`. Crea `ProductionOrderImport` y las OP en una transacción.
- **Plantilla:** `.xlsx` generado con ClosedXML: hoja `OP` (encabezados, formato de fecha, lista de validación en `turno`) y hoja `Instrucciones`.
- **Rendimiento:** 3,000 filas se validan en < 5 s y se importan en < 10 s.

## 8. API

### 8.1 Convenciones

- Prefijo `/api/v1`. Recursos en plural y `kebab-case`.
- Acciones de estado como `POST` sobre subrecurso: `/purchase-orders/{id}/submit`, `/approve`, `/cancel`.
- **Listados:** `GET ?page=1&pageSize=25&sort=folio:desc&q=texto&status=…&locationId=…` → `{ "items": [], "page": 1, "pageSize": 25, "total": 0 }`. `pageSize` máximo 100.
- **Detalle:** incluye `version`.
- **JSON** en `camelCase`, números estrictos (no se aceptan números entre comillas) y enums como texto; las mismas opciones JSON se usan en MVC y en el generador de OpenAPI. Todas las acciones documentan su respuesta exitosa con el tipo real.
- **Errores:** `ProblemDetails` (RFC 9457), `type` = `https://panissimo/errors/<codigo>`, mensajes en español. Los errores de *model binding* también en español, con claves `camelCase` (`lines[0].quantity`).

| Situación | HTTP | Extensiones |
|---|---|---|
| Validación | 400 | `errors: { campo: [mensajes] }` |
| No autenticado | 401 | |
| Sin permiso o fuera de alcance | 403 | |
| No encontrado | 404 | |
| Concurrencia | 409 | `code: "concurrency"` |
| Duplicado | 409 | `code: "duplicate"` |
| Existencia insuficiente | 409 | `code: "insufficient_stock"`, `shortages: [{ itemId, sku, name, lotId, lotNumber, requested, available }]` |
| Regla de negocio | 422 | `code: "<regla>"` (ej. `po_not_approved`, `production_overrun`) |

### 8.2 Endpoints

Todos requieren autenticación excepto `auth`. Entre corchetes, el permiso requerido. "Cualquiera de" se indica con `o`.

**Auth y usuario actual**

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → `{ accessToken, expiresIn }` y cookie de refresh |
| POST | `/auth/refresh` | — (cookie) | Rota el refresh token y devuelve un access token nuevo |
| POST | `/auth/logout` | autenticado | Revoca el refresh token |
| GET | `/me` | autenticado | Usuario, permisos efectivos y ubicaciones |
| POST | `/me/change-password` | autenticado | Cierra las demás sesiones |

**Organización y catálogos**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/locations`, `/locations/{id}` | [locations.view] / [locations.manage] |
| GET | `/locations/lookup` — ubicaciones activas (id, código, nombre, tipo) | [locations.view] o [logistics.view] o [sales.view] o [security.users.manage] |
| GET / POST / PUT | `/production-areas`, `/production-areas/{id}` | [production.view] o [catalog.view] / [production.areas.manage] |
| GET / POST / PUT | `/units-of-measure` | [catalog.view] / [catalog.manage] |
| GET / POST / PUT | `/item-categories` | [catalog.view] o [inventory.view] / [catalog.manage] |
| GET / POST / PUT | `/items`, `/items/{id}` — filtros `type`, `presentation`, `categoryId`, `areaId`, `includeInactive` | [catalog.view] / [catalog.manage] |
| GET / PUT | `/items/{id}/location-settings` | [catalog.view] / [catalog.manage] |
| GET | `/items/lookup?q&type&presentation&areaId&id&limit` (≤ 50) | [catalog.view] o [inventory.view] o [logistics.view] o [production.view] o [purchasing.view] o [sales.view] |
| GET | `/items/{id}/photo?size=thumbnail\|full` — con `ETag` (304) | los de `/items/lookup` |
| PUT / DELETE | `/items/{id}/photo` — multipart `image` y `thumbnail` | [catalog.manage] |
| POST | `/imports/items` (CSV) — errores por fila; con errores no importa nada | [catalog.manage] |

**Inventario**

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/stock?locationId&itemId&categoryId&type&belowMin=true` | [inventory.view] |
| GET | `/stock/{locationId}/{itemId}/lots` | [inventory.view] |
| GET | `/movements?locationId&itemId&type&from&to` — kardex paginado con saldo corrido | [inventory.view] |
| GET | `/alerts?locationId` — bajo mínimo y lotes por caducar | [inventory.view] |
| GET / POST | `/adjustments`, `/adjustments/{id}` | [inventory.view] / [inventory.adjust] |
| GET / POST / PUT | `/physical-counts`, `/physical-counts/{id}` — PUT guarda líneas contadas (autoguardado con `version`) | [inventory.view] / [inventory.count] |
| POST | `/physical-counts/{id}/start`, `/close`, `/cancel`, `/lines` (agregar artículo) | [inventory.count] |
| GET / POST | `/consumptions`, `/consumptions/{id}` | [inventory.view] / [inventory.consumption] |
| POST | `/imports/initial-stock` (CSV) | [inventory.adjust] |
| GET | `/consumption-analysis?locationId&weeks&q` (RN-52) | [inventory.view] |
| GET | `/traceability/graph?sourceType&sourceId&direction&maxDepth` (RN-100..RN-109; `trazabilidad.md` §5.3) | [inventory.traceability] |
| GET | `/traceability/lots/lookup?q&itemId&limit` — lotes por número, SKU o nombre (≤ 50) | [inventory.traceability] |
| GET | `/traceability/sources/lookup?q` — entradas por folio `OC-`, `OP-`, `TR-`, `RM-` o número de lote | [inventory.traceability] |

**Producción**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/recipes`, `/recipes/{id}` — PUT sobre receta usada crea versión N+1 | [production.view] / [production.recipes.manage] |
| POST | `/recipes/{id}/activate`, `/deactivate` | [production.recipes.manage] |
| GET | `/recipes/{id}/explode?qty&locationId` (RN-12) | [production.view] |
| GET | `/recipes/{id}/costs?locationId` (RN-51) | [production.view] |
| GET / POST / PUT | `/production-orders`, `/production-orders/{id}` — filtros `status`, `from`, `to`, `areaId`, `shift`, `source`, `importId`; la lista trae `producedQty`, `progressPct`, `closeCount` | [production.view] / [production.orders.manage] |
| POST | `/production-orders/{id}/release`, `/cancel` | [production.orders.manage] |
| GET | `/production-orders/{id}/close-preview?qty` — teórico por componente, existencia y costo estimado | [production.view] |
| GET | `/production-orders/{id}/closes` | [production.view] |
| POST | `/production-orders/{id}/closes` — `{ version, kind: "Partial"\|"Final", producedQty, shift?, notes?, shortfallReason?, shortfallNotes?, lines: [{ componentItemId, actualQty, lots?: [{ lotId, qty }] }] }` → `201` con el cierre y la OP | [production.orders.close] |
| GET | `/production-closes?locationId&from&to&areaId&itemId`, `/production-closes/{id}` | [production.view] |
| GET | `/production-orders/{id}/demands` | [production.view] |
| GET | `/production-plan?locationId&from&to&areaId&q` (RN-70) | [production.view] |
| POST | `/production-plan/generate` — `{ locationId, lines: [{ itemId, date, areaId?, shift?, quantity, demandLineIds? }] }` | [production.orders.manage] |
| GET | `/production-order-imports/template` | [production.orders.import] |
| POST | `/production-order-imports/validate` — multipart `file` | [production.orders.import] |
| POST | `/production-order-imports` — multipart `file`, `confirmWarnings`, `releaseOnImport` | [production.orders.import]; liberar exige [production.orders.manage] |
| GET | `/production-order-imports`, `/production-order-imports/{id}` | [production.view] |
| GET | `/material-requirements?locationId&to` (RN-50) | [purchasing.view] o [production.view] |
| GET | `/reports/production-summary?locationId&from&to&groupBy=area\|item\|day` (RN-53) | [production.view] |

**Logística**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/branch-orders`, `/branch-orders/{id}` | [logistics.view] / [logistics.orders.create] |
| POST | `/branch-orders/{id}/submit`, `/cancel` | [logistics.orders.create] |
| POST | `/branch-orders/{id}/approve` — `{ version, lines: [{ lineId, approvedQty }] }` | [logistics.orders.approve] |
| POST | `/branch-orders/{id}/reject` — `{ version, reason }` | [logistics.orders.approve] |
| GET | `/branch-orders/suggestion?locationId` | [logistics.orders.create] |
| GET / POST / PUT | `/transfers`, `/transfers/{id}` — filtros `tab`, `received=true` | [logistics.view] / [logistics.transfers.dispatch] |
| POST | `/transfers/{id}/dispatch` — `{ version, vehicleDescription, driverName, lines?: [{ lineId, lots: [{ lotId, qty }] }] }` | [logistics.transfers.dispatch] |
| POST | `/transfers/{id}/receive` — `{ version, lines: [{ lineId, receivedQty, discrepancyReason?, discrepancyNotes? }] }` | [logistics.transfers.receive] |
| POST | `/transfers/{id}/cancel` | [logistics.transfers.dispatch] |

**Ventas a terceros**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/customers`, `/customers/{id}` | [sales.view] / [sales.customers.manage] |
| GET | `/customers/lookup?q&limit` | [sales.view] |
| GET / POST / PUT | `/customers/{id}/delivery-points`, `/customers/{id}/delivery-points/{pointId}` | [sales.view] / [sales.customers.manage] |
| GET / POST / PUT | `/customers/{id}/items` | [sales.view] / [sales.customers.manage] |
| GET / POST / PUT | `/customer-orders`, `/customer-orders/{id}` — PUT solo en `Draft` | [sales.view] / [sales.orders.manage] |
| POST | `/customer-orders/{id}/confirm`, `/cancel`, `/close` (`{ version, reason }`) | [sales.orders.manage] |
| GET / POST | `/customer-orders/{id}/shipments` — POST crea la remisión `Draft` con el saldo | [sales.view] / [sales.shipments.dispatch] |
| GET / PUT | `/customer-shipments`, `/customer-shipments/{id}` — PUT solo en `Draft` | [sales.view] / [sales.shipments.dispatch] |
| POST | `/customer-shipments/{id}/dispatch` — `{ version, vehicleDescription, driverName, receivedByName?, lines?: [{ lineId, lots: [{ lotId, qty }] }] }` | [sales.shipments.dispatch] |
| POST | `/customer-shipments/{id}/cancel` | [sales.shipments.dispatch] |

**Compras**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/suppliers`, `/suppliers/{id}`, `/suppliers/{id}/items` | [purchasing.view] / [purchasing.suppliers.manage] |
| GET | `/suppliers/lookup?q`, `/items/{id}/supplier-offers` | [purchasing.view] |
| GET / POST / PUT | `/requisitions`, `/requisitions/{id}` | [purchasing.view] / [purchasing.requisitions.manage] |
| POST | `/requisitions/{id}/submit`, `/cancel` | [purchasing.requisitions.manage] |
| POST | `/requisitions/{id}/approve`, `/reject` | [purchasing.po.approve] |
| POST | `/requisitions/convert` — `{ requisitionIds }` | [purchasing.po.manage] |
| POST | `/requisitions/suggested` — crea la requisición sugerida de RN-50 | [purchasing.requisitions.manage] |
| GET / POST / PUT | `/purchase-orders`, `/purchase-orders/{id}` — filtro `pendingReceipt=true` | [purchasing.view] / [purchasing.po.manage] |
| POST | `/purchase-orders/{id}/submit`, `/cancel`, `/close` | [purchasing.po.manage] |
| POST | `/purchase-orders/{id}/approve`, `/reject` | [purchasing.po.approve] |
| GET / POST | `/goods-receipts`, `/goods-receipts/{id}` — POST `{ purchaseOrderId, poVersion, supplierInvoiceNumber?, lines: [{ poLineId, quantity, lotNumber?, expirationDate? }] }` | [purchasing.view] / [purchasing.receive] |

**Seguridad, configuración y tablero**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/users`, `/users/{id}`; POST `/users/{id}/reset-password`, `/activate`, `/deactivate` | [security.users.manage] |
| GET / POST / PUT | `/roles`, `/roles/{id}` | [security.roles.manage]; la lista (GET `/roles`) también con [security.users.manage] para asignar roles |
| GET | `/permissions` | [security.roles.manage] |
| GET | `/audit-log?entityType&entityId&userId&from&to` | [security.audit.view] |
| GET / PUT | `/settings` — lista tipada (clave, etiqueta, tipo, límites, decimales, valor, `version`); PUT parcial con `version` por parámetro | [settings.manage] |
| GET | `/dashboard?locationId` — bloques según permisos (null sin permiso) | autenticado |

**Bloques del tablero:** `lowStock`, `expiringLots` ([inventory.view]); `transfersToReceive` / `transfersToDispatch` ([logistics.view]); `branchOrdersToApprove` ([logistics.orders.approve]); `branchOrdersInProgress` ([logistics.orders.create]); `purchaseOrdersToApprove` ([purchasing.po.approve]); `productionToday` (OP del día por área: planeado vs producido) y `productionInProgress` ([production.view]); `recipesWithCostIncreases` ([production.view]); `customerOrdersDue` ([sales.view]); `customerShipmentsToDispatch` ([sales.shipments.dispatch]); `lowStockByLocation` (solo con [locations.all]). Sin `locationId` suma las ubicaciones del alcance.

## 9. Seguridad

- **Autenticación:**
  - ASP.NET Core Identity. Contraseña: mínimo 10 caracteres, con mayúscula, minúscula y número. Bloqueo según RN-42.
  - **Access token JWT** de 15 minutos (HS256; clave de ≥ 32 bytes desde variable de entorno).
  - **Refresh token** opaco de 7 días, guardado hasheado en `security.refresh_token`, en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, **rotado en cada uso**. Reutilizar un token ya rotado revoca la familia, salvo dentro de una **ventana de gracia de 30 s** (dos pestañas o doble recarga): ahí se emite un token hermano.
  - El administrador restablece contraseñas capturando una temporal; cambiar la contraseña cierra las sesiones.
- **Autorización:** `[RequirePermission("a", "b")]` (basta uno) con `IAuthorizationPolicyProvider` dinámico. Permisos efectivos en `IMemoryCache` (5 min; se invalidan al editar roles o usuarios); no se meten al JWT.
- **Alcance (RN-40):** `ILocationScope` expone `AllowedLocationIds` y `EnsureAccess(locationId)`. Todas las consultas filtran por ubicaciones permitidas. Despachar un traspaso exige el origen y recibirlo el destino; aprobar un pedido exige el origen; OP, cierres, plan, importación y remisiones exigen la Planta. Clientes y proveedores son catálogos globales.
- **Anti-escalamiento (RN-43)** en usuarios y roles.
- **Rate limiting:** `/auth/login` 10 req/min por IP (`RateLimiting:LoginPermitLimit`; el compose de desarrollo lo sube a 60 para las E2E).
- **Proxy:** detrás de Caddy con `UseForwardedHeaders`. Sin CORS (mismo origen).
- **Archivos:** límite por endpoint (`RequestSizeLimit`): 5 MB para Excel, 2 MB para CSV, 400 KB para fotos.

## 10. Validación, errores, logging y configuración

- Un validador FluentValidation por request DTO, ejecutado por un filtro global. Las reglas que requieren BD van en el servicio.
- `IExceptionHandler` global mapea excepciones según §8.1; las no controladas responden 500 con `traceId` y sin detalles.
- Serilog en consola (JSON compacto en producción), `UseSerilogRequestLogging`, enriquecido con `UserId`, `TraceId` y ruta. **Nunca** registrar contraseñas ni tokens.
- Health checks `/health/live` y `/health/ready` (verifica la BD).
- `appsettings.json` más variables de entorno con prefijo `PAN__`:

| Variable | Descripción |
|---|---|
| `PAN__ConnectionStrings__Default` | Conexión Postgres (`sslmode=require` en producción) |
| `PAN__Jwt__Key`, `PAN__Jwt__Issuer`, `PAN__Jwt__Audience` | Firma del JWT |
| `PAN__Seed__AdminEmail` / `PAN__Seed__AdminPassword` | Solo para la primera semilla |
| `PAN__Seed__LocationsCsv` | CSV de sucursales (default `deploy/seed/locations.csv`) |
| `PAN__RateLimiting__LoginPermitLimit` | Default 10 |
| `ASPNETCORE_ENVIRONMENT` | `Development` / `Production` |

Los secretos nunca se versionan; `.env.example` lista todas las variables.

## 11. Pruebas

**Unitarias (`Panissimo.UnitTests`)**, obligatorias:
- Costo promedio (RN-04): entradas sucesivas, entrada con existencia ≤ 0, salida al costo vigente.
- FEFO (RN-05): varios lotes, sin caducidad al final, exclusión de vencidos, insuficiencia.
- Máquinas de estado de **cada** documento: transiciones válidas y todas las inválidas lanzan `BusinessRuleException`.
- RN-03b: cantidades fraccionarias en `pza`.
- Recetas: consumo teórico (RN-11), versionado (RN-10).
- Cierres: RN-62 (lote y caducidad), RN-63 (tolerancia en el límite y uno arriba, motivo de faltante, cierre final en 0 con y sin cierres previos), RN-64 (costos), RN-13 (merma por cierre).
- Plan (RN-70): neto acumulado por día, OP de fecha posterior no cubre días anteriores, múltiplo, reposición a stock, demanda de semiterminado.
- Importación (RN-90..RN-93): encabezados con acentos, fechas de texto y de Excel, fecha pasada, SKU inexistente, tipo inválido, sin receta, decimal en `pza`, agrupación, archivo duplicado, OP existente.
- OC: aprobación por umbral (RN-31), tolerancia de recepción (RN-32), redondeo de totales; RFC (RN-35).
- Pedidos: sugerido por mín/máx (RN-20), RN-24, RN-82 con tolerancia.
- Análisis de consumo (RN-52) y costo de receta (RN-51).

**Integración (`Panissimo.IntegrationTests`)**, con Testcontainers y `WebApplicationFactory`:
- Seguridad: login, refresh con rotación y ventana de gracia, 401, 403 por permiso, 403 por ubicación, anti-escalamiento.
- Existencia insuficiente: 409 con `shortages` y **sin** movimientos parciales.
- Conteo: cierre genera ajustes por la diferencia contra el snapshot.
- Traspaso: despacho y recepción con faltante; dos despachos simultáneos → uno 200 y otro 409.
- OP con **dos cierres parciales y un cierre final**: kardex, tres lotes con su caducidad, costos por cierre y acumulado, merma, `Completed`; cierres concurrentes 201/409; cancelar con cierres → 422.
- Importación: archivo con errores (400, nada creado), válido (OP agrupadas ligadas a `IMP`), duplicado sin confirmar (422) y confirmado (201).
- Compra completa: requisición → OC → aprobación → recepción parcial con lote → final → kardex y costo.
- Pedido de sucursal → aprobación → traspaso → despacho → recepción → `Fulfilled`.
- Pedido de cliente → confirmar → remisión parcial → final → `Shipped`; lote vencido rechazado.
- Plan → generar OP → la OP cubre el plan siguiente y queda ligada a los pedidos.
- Trazabilidad (B-28): escenario de `trazabilidad.md` §9 por API: hacia atrás desde lo recibido en una sucursal (las dos OC de harina con las cantidades de los lotes del cierre), hacia adelante desde la harina más antigua (llega a dos sucursales y no a la tercera), resumen con existencia por ubicación y pérdida en tránsito, componente sin lote, semiterminado en dos niveles hasta el cliente, 403 sin permiso, alcance sin filtrar (RN-109), costos ocultos sin `production.view`, bitácora y semilla de D-11.
- Rendimiento (`Category=Performance`): kardex de 100,000 movimientos < 300 ms; plan < 1 s; importación de 3,000 filas < 10 s; trazabilidad de un lote con 20 OP, 40 lotes terminados y 600 traspasos < 1.5 s.

**Criterio:** `dotnet test` en verde antes de cerrar cualquier tarea. Los archivos de prueba (`.csv`, `.xlsx`) viven en `tests/Fixtures/`.

## 12. Contenedores y despliegue

- **`backend/Dockerfile`** multi-stage: `mcr.microsoft.com/dotnet/sdk:10.0` para compilar y `aspnet:10.0` para ejecutar, usuario no root, puerto 8080. Un target `migrator` genera el **bundle de migraciones** para `linux-x64` o `linux-arm64` según `TARGETARCH`.
- **`deploy/docker-compose.yml`** (Droplet de DigitalOcean): `api`, `web` (Caddy: HTTPS automático, SPA, proxy de `/api` y `/health`, página de mantenimiento si falta el build) y `migrate` (perfil `tools`). Base de datos: Postgres administrado de DigitalOcean. Imágenes construidas en el servidor.
- **`deploy/docker-compose.dev.yml`** (local): `postgres:16` más la API con `dotnet watch` y servicio de respaldos diarios.
- **`deploy/docker-compose.demo.yml`** (overlay para Oracle Cloud Free): Postgres en contenedor y respaldos diarios.
- **`deploy/README.md`:** `docker compose build` → `docker compose run --rm migrate` → `docker compose run --rm api --seed` (solo la primera vez) → `docker compose up -d`.

## 13. Plan de implementación (tareas para Claude Code)

Cada tarea deja el código compilando, con pruebas en verde y la migración creada si aplica. **Una tarea por sesión, empezando en modo plan.** Antes de empezar, revisa en `dominio.md` §8 que sus decisiones abiertas estén confirmadas. El backend avanza una fase antes que el frontend, para generar los tipos desde una API real.

**Fase 1: base, seguridad, catálogos e inventario**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-01 | Solución y proyectos, referencias, `Program.cs`, Serilog, ProblemDetails, opciones JSON compartidas, health checks, OpenAPI + Scalar, Dockerfile y compose de desarrollo; `CLAUDE.md` (estructura, comandos, convenciones, reglas estrictas, flujo por tarea y definición de terminado) y `docs/AVANCE.md` (bitácora por tarea) | — | `docker compose -f deploy/docker-compose.dev.yml up` levanta la API y `/health/ready` responde 200 |
| B-02 | `AppDbContext`, convenciones, interceptores de timestamps y auditoría, `IFolioGenerator`, `ITransactionLocks`, `IUserDirectory`, `AppSetting`, semilla base (unidades, `PLANTA` + CSV de sucursales, áreas, permisos, roles, admin, parámetros). Migración `InitialCreate` | D-01 | La migración se aplica en una BD limpia; la semilla es idempotente |
| B-03 | Identity, login, refresh rotativo con ventana de gracia, logout, `/me`, cambio de contraseña, `[RequirePermission]` dinámico, `ILocationScope`, rate limit | — | Integración: login, refresh, reutilización, 401, 403 por permiso y por ubicación |
| B-04 | Usuarios, roles (matriz de permisos y anti-escalamiento), permisos, bitácora, ubicaciones (`/locations`, `/locations/lookup`) y `/settings` | D-10 | El admin crea un usuario con rol y ubicaciones; ese usuario solo ve lo permitido |
| B-05 | Catálogos: unidades, categorías, áreas de producción, artículos con todos sus campos (tipo, presentación, `BulkItemId`, área, múltiplo, gramaje), mín/máx por ubicación, `/items/lookup` e importación CSV de artículos (`sku,nombre,tipo,categoria,unidad_base,unidad_compra,factor_compra,maneja_lotes,vida_util_dias,almacenamiento,iva,presentacion,sku_granel,piezas_por_paquete,area,multiplo_op,gramaje_g`; SKU existente se actualiza; categoría o área inexistente = error) | D-05 | CSV con errores devuelve errores por fila sin importar nada; un empaquetado se liga a su granel |
| B-06 | Motor de inventario: `InventoryPostingService`, `LotAllocator`, `LotRegistry`, costo promedio | — | Unitarias de RN-02, RN-04 y RN-05; integración de concurrencia de lotes |
| B-07 | Existencias (con lotes), kardex con saldo corrido, alertas, ajustes por motivo, existencias iniciales por CSV (`ubicacion,sku,cantidad,costo_unitario,lote,caducidad`) | — | Ajuste negativo sin existencia → 409 `insufficient_stock` |
| B-08 | Conteo físico (snapshot, autoguardado con `version`, agregar líneas, cierre) y consumo de sucursal | — | El cierre genera ajustes por diferencia contra el snapshot |
| B-09 | Traspasos directos: crear, editar borrador, despachar (lotes o FEFO), recibir con discrepancias, cancelar; rutas especiales (RN-25) | — | Flujo de traspaso y concurrencia en integración |

**Fase 2: producción**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-10 | Recetas versionadas (componentes `RawMaterial`, `Supply`, `SemiFinished`), activar/desactivar y explosión con disponibilidad | — | Editar una receta usada crea la versión N+1 |
| B-11 | Órdenes de producción: alta, edición, liberar, cancelar, área, turno, origen; listado con avance | — | Máquina de estados completa en unitarias; OP con receta inactiva → 422 |
| B-12 | **Cierres parciales y final** (§5.1): `close-preview`, `/closes`, `/production-closes`, lotes por cierre, costos y merma | D-02, D-03 | Integración: 2 parciales + final con kardex, lotes, costos y merma; faltantes sin movimientos parciales; cierres concurrentes 201/409 |
| B-13 | **Importación de OP desde Excel** (§7): plantilla, validar, importar, historial | D-07 | Integración con `.xlsx` de prueba; 3,000 filas en < 10 s |

**Fase 3: compras**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-14 | Proveedores (RFC, RN-35) y artículos de proveedor con preferido único; `/items/{id}/supplier-offers` | — | Marcar preferido desmarca el anterior, también en paralelo |
| B-15 | Requisiciones y conversión a OC (RN-34) | — | Varias requisiciones se convierten en OC agrupadas por proveedor y entrega |
| B-16 | Órdenes de compra (aprobación por umbral, rechazo, cancelación, cierre) y recepciones (parciales, lotes, tolerancia, factura) | — | Flujo completo de compra en integración; recepciones simultáneas 201/409 |

**Fase 4: pedidos, ventas y planeación**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-17 | Pedidos de sucursal: sugerido por mín/máx, enviar, aprobar (crea traspaso), rechazar, cancelar, RN-24 | D-05 | Pedido → traspaso → despacho → recepción → `Fulfilled`; empaquetado → 422 |
| B-18 | Clientes, puntos de entrega, artículos de cliente y pedidos de cliente (RN-80, RN-82 sin remisiones) | D-05, D-06, D-09 | Pedido con granel → 422; confirmar y cancelar según RN-80 |
| B-19 | Remisiones (§5.2): crear desde pedido, editar borrador, despachar, cancelar, cierre con saldo del pedido | D-09 | Pedido → remisión parcial → final → `Shipped`; sobre-remisión → 422 |
| B-20 | **Plan de producción** (§6) con las tres fuentes de demanda, generación de OP y `ProductionOrderDemand` | D-04 | Pedidos de sucursal y de cliente y mín/máx → plan → generar → OP ligadas y plan cubierto; < 1 s |
| B-27 | **Retrabajo por decisiones** (dominio §8, 2026-10-17): D-03 tolerancia informativa con marca en el cierre; D-05 sucursales y clientes piden granel y empaquetado; D-07 código de la Matriz por artículo y en la importación; D-08 devolución de cliente con parte en merma y motivo; motivo al cerrar OC con saldo; código de cliente editable; requisición con artículo repetido y nota obligatoria | D-03, D-05, D-07, D-08 | Cierre sobre tolerancia → 201 marcado; pedido de cliente con granel y de sucursal con empaquetado → 201; importación por código de Matriz; devolución con merma deja entrada y merma en kardex |
| B-26a | **Subalmacenes: modelo y alcance** (D-01, RN-44, RN-40): `Location.Type = Warehouse` hija de planta o sucursal; CRUD en `/locations` (`parentLocationId`); el motor rechaza movimientos en una ubicación con subalmacenes; alcance por subalmacén (`ILocationScope.EnsureStockAccess`); existencias y kardex por subalmacén o sumados por ubicación; semilla con los 4 subalmacenes de la planta | D-01 | Movimiento a PLANTA con subalmacenes → 422; usuario de un solo subalmacén no mueve otro → 403; existencia de PLANTA = suma de subalmacenes |
| B-26b | **Vale interno** (RN-47): `Transfer.Kind = Internal`, folio `VI`, entre subalmacenes de la misma ubicación, con envío y recepción; permiso `inventory.internal_transfers` | D-01 | Vale MP → semiterminados: tránsito, recepción con diferencia, kardex de ambos subalmacenes; ruta entre ubicaciones distintas → 422 |
| B-26c | **Procesos eligen subalmacén** (RN-45): subalmacén en encabezado + por línea en recepción de compra, cierre de OP (consumo y producto), despacho y recepción de traspasos, despacho de remisiones; ajustes, conteos, consumo y devoluciones sobre subalmacén | D-01 | Recepción de harina a MP y bolsas a Insumos en un documento; cierre consume de MP y de Semiterminados y deja en Terminado; traspaso sale de Terminado y entra a un subalmacén de la sucursal |
| B-26d | **Totales por ubicación** (RN-46): plan, sugerido de pedidos, existencia en origen, disponibilidad de OP y alertas suman subalmacenes | D-01 | Plan y sugerido iguales con la existencia repartida en varios subalmacenes; pruebas existentes en verde |
| B-21 | Requerimiento de materia prima (RN-50) y requisición sugerida | D-04 | Faltante con mínimo y en camino, redondeo a unidades de compra, semiterminado "por producir" |

**Fase 5: tablero, análisis y puesta en producción**

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-22 | Tablero (todos los bloques de §8.2) y resumen de producción (RN-53) | — | Cada bloque respeta permisos; el resumen por área cuadra con la suma de los cierres |
| B-23 | Costo de receta por versión y alzas de insumos (RN-51); análisis de consumo (RN-52) | — | Integración con historial de 8 semanas y dos versiones de receta |
| B-24 | Fotos de artículos (`ItemPhoto`): GET/PUT/DELETE, `photoRevision` en los DTO de artículo | — | Carga, reemplazo, borrado, 304 con `ETag`, tipo y tamaño inválidos, permisos |
| B-25 | Endurecimiento y despliegue: índices, `EXPLAIN` de kardex, existencias, lista de OP y plan con ~27,000 OP y ~80,000 cierres de prueba; bundle de migraciones; compose de producción y demo; `deploy/README.md`; revisión de licencias | — | Kardex y lista de OP < 300 ms, plan < 1 s; resultados en `docs/rendimiento.md` |

**Ampliación: trazabilidad de lotes** (requerimiento agregado por el usuario el 2026-10-17; spec `trazabilidad.md`)

| ID | Tarea | Decisiones | Criterio de aceptación |
|---|---|---|---|
| B-28 | Trazabilidad de lotes: índices, verificaciones de `trazabilidad.md` §3.3, permiso `inventory.traceability` (semilla de D-11 solo la primera vez), `/traceability/*` con los campos de `trazabilidad-ui.md` §8, pruebas | D-11 | `trazabilidad.md` §5.6 |

**Entregables por fase** (para facturación y aceptación con el cliente): Fase 1 = usuarios, catálogos, inventario y traspasos; Fase 2 = producción con cierres e importación; Fase 3 = compras; Fase 4 = pedidos, ventas a terceros y plan; Fase 5 = tablero, análisis y producción.
