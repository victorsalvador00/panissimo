# Especificación Backend — SGO AR API

> Lee primero `docs/specs/dominio.md`: define entidades, estados y reglas (RN-xx) que este documento implementa.

## 1. Objetivo

API REST que implementa los módulos de Organización, Catálogos, Inventario, Producción, Logística, Compras y Seguridad del SGO AR. La consume únicamente el frontend Angular del mismo dominio.

## 2. Stack

Todas las dependencias deben tener licencia libre (MIT, Apache-2.0, BSD o PostgreSQL). **Antes de agregar un paquete no listado, verifica su licencia en la versión exacta.**

| Uso | Paquete / tecnología | Licencia |
|---|---|---|
| Runtime | .NET 10 (LTS), ASP.NET Core Web API con controllers | MIT |
| ORM | `Microsoft.EntityFrameworkCore` + `Npgsql.EntityFrameworkCore.PostgreSQL` | MIT / PostgreSQL |
| Nombres snake_case | `EFCore.NamingConventions` | Apache-2.0 |
| Identidad | `Microsoft.AspNetCore.Identity.EntityFrameworkCore` | MIT |
| JWT | `Microsoft.AspNetCore.Authentication.JwtBearer` | MIT |
| Validación | `FluentValidation` + `FluentValidation.DependencyInjectionExtensions` | Apache-2.0 |
| Logging | `Serilog.AspNetCore`, `Serilog.Sinks.Console` | Apache-2.0 |
| OpenAPI | `Microsoft.AspNetCore.OpenApi` + `Scalar.AspNetCore` (UI) | MIT |
| CSV (importación de catálogos) | `CsvHelper` | MS-PL / Apache-2.0 |
| Pruebas | `xunit`, `NSubstitute`, `Testcontainers.PostgreSql`, `Microsoft.AspNetCore.Mvc.Testing` | Apache-2.0 / BSD / MIT |
| Base de datos | PostgreSQL 16+ (DigitalOcean Managed en producción) | PostgreSQL |

**Prohibidos** (licencia comercial en versiones actuales o innecesarios): MediatR, AutoMapper, MassTransit v9+, FluentAssertions v8+, EPPlus v5+, QuestPDF (sin revisar su umbral de ingresos), Duende IdentityServer, Telerik, DevExpress y Syncfusion.

## 3. Arquitectura

**Monolito modular en 4 proyectos.** Cada proyecto se organiza en una carpeta por módulo.

```
backend/
├── Sgo.sln
├── src/
│   ├── Sgo.Domain/            # Entidades, enums, value objects, reglas puras, excepciones de dominio
│   │   ├── Common/            # Entity, AuditableEntity, DomainException, Folio
│   │   ├── Organization/
│   │   ├── Catalog/
│   │   ├── Inventory/
│   │   ├── Production/
│   │   ├── Logistics/
│   │   ├── Purchasing/
│   │   └── Security/
│   ├── Sgo.Application/       # Servicios de caso de uso, DTOs, validadores, interfaces
│   │   ├── Common/            # PagedResult, PageQuery, ICurrentUser, ILocationScope, IClock
│   │   └── <Módulo>/          # <Entidad>Service, Dtos/, Validators/, Mapping (extension methods)
│   ├── Sgo.Infrastructure/    # EF Core, configuraciones, migraciones, Identity, folios, auditoría
│   │   ├── Persistence/
│   │   │   ├── SgoDbContext.cs
│   │   │   ├── Configurations/<Módulo>/
│   │   │   ├── Interceptors/  # AuditInterceptor, TimestampsInterceptor
│   │   │   ├── Migrations/
│   │   │   └── Seed/
│   │   ├── Identity/
│   │   └── Inventory/         # InventoryPostingService (implementación)
│   └── Sgo.Api/               # Host, controllers, auth, middleware, Program.cs
│       ├── Controllers/<Módulo>/
│       ├── Auth/              # PermissionPolicyProvider, RequirePermissionAttribute
│       └── Middleware/        # ExceptionHandler → ProblemDetails
└── tests/
    ├── Sgo.UnitTests/
    └── Sgo.IntegrationTests/
```

**Reglas de dependencia:**
- `Domain` no depende de nada.
- `Application` depende de `Domain`.
- `Infrastructure` depende de `Application` y `Domain`.
- `Api` depende de todos, solo para composición.

**Patrones:**
- Un servicio de aplicación por agregado (`PurchaseOrderService`, `TransferService`…), inyectado por interfaz. No usar mediador.
- Mapeo manual con métodos de extensión `ToDto()` / `ToEntity()`.
- Las transiciones de estado viven en la entidad (`purchaseOrder.Submit(threshold)`, `transfer.Dispatch(...)`). Si la transición es inválida, la entidad lanza `BusinessRuleException`.
- `SgoDbContext` se usa directamente desde los servicios (sin repositorio genérico). Las consultas complejas van en clases `*Queries`.
- Control de tiempo y usuario vía `IClock` e `ICurrentUser`, para poder probarlos.

## 4. Persistencia

- **Esquemas por módulo:** `org`, `catalog`, `inventory`, `production`, `logistics`, `purchasing`, `security`, `audit`.
- **Nombres:** tablas y columnas en `snake_case` (`UseSnakeCaseNamingConvention()`).
- **Tipos:**
  - Cantidades y costos: `numeric(18,4)`.
  - Montos de documentos: `numeric(18,2)`.
  - Fechas: `timestamptz`.
  - Enums guardados como `text`.
- **Concurrencia optimista:** en todos los documentos y catálogos, usando la columna de sistema `xmin` como token. Los DTOs de detalle exponen `version`. Los endpoints de edición y de cambio de estado reciben `version` y responden **409** si no coincide.
- **Folios:** una `SEQUENCE` de Postgres por tipo de documento. `IFolioGenerator.NextAsync(DocType)` genera `OC-000001`.
- **Filtros globales:** `IsActive` no se filtra globalmente (los catálogos inactivos deben verse en históricos). Los listados de catálogos filtran activos por defecto con `?includeInactive=true`.
- **Auditoría:** `AuditInterceptor` (`SaveChangesInterceptor`) escribe en `audit.audit_log` los cambios de entidades marcadas con `[Audited]`. `TimestampsInterceptor` llena `CreatedAt/By` y `UpdatedAt/By`.
- **Índices mínimos:**
  - `inventory_movement(location_id, item_id, occurred_at)`
  - `stock_balance(location_id, item_id, lot_id)` único
  - `lot(item_id, expiration_date)`
  - `folio` único por tabla de documento
  - `status` en tablas de documento
- **Migraciones:** nombre descriptivo (`AddPurchasing`, `AddTransferDiscrepancies`). **Nunca modificar una migración ya aplicada**; crear una nueva.
- **Semilla** (idempotente, al arrancar en Development o con `--seed`):
  - Unidades de medida.
  - 12 ubicaciones (`SUC-01..SUC-10`, `FAB`, `COM`).
  - Roles y permisos (sección 6 de dominio).
  - Usuario administrador, con credenciales tomadas de variables de entorno.
  - `AppSetting` con sus valores por defecto.

## 5. Motor de inventario (núcleo crítico)

Todo movimiento de inventario pasa por un solo servicio:

```csharp
public interface IInventoryPostingService
{
    // Debe llamarse dentro de una transacción abierta por el servicio de aplicación.
    Task<IReadOnlyList<InventoryMovement>> PostAsync(IEnumerable<MovementRequest> requests, CancellationToken ct);
}

public sealed record MovementRequest(
    Guid LocationId, Guid ItemId, Guid? LotId, MovementType Type,
    decimal Quantity,            // con signo, unidad base
    decimal? UnitCost,           // requerido en entradas externas; null = usar promedio vigente
    string SourceDocType, Guid SourceDocId, string SourceDocFolio, string? Notes);
```

**Algoritmo:**

1. Agrupar las solicitudes y ordenarlas por `(LocationId, ItemId, LotId)`. El orden evita deadlocks.
2. Bloquear las filas afectadas con `SELECT ... FOR UPDATE` (SQL crudo vía `FromSql`). Si la fila de `stock_balance` o `item_location_cost` no existe, crearla.
3. Validar RN-02: la existencia resultante debe ser ≥ 0. Acumular **todos** los faltantes y lanzar `InsufficientStockException(faltantes)` si hay alguno.
4. Calcular costos según RN-04: actualizar `item_location_cost` en las entradas; usar el promedio vigente en las salidas.
5. Insertar `InventoryMovement` y actualizar `StockBalance`.

**Asignación de lotes FEFO:**
- `ILotAllocator.AllocateAsync(locationId, itemId, qty)` devuelve `[(LotId, Qty)]`.
- Excluye lotes vencidos (RN-05) y lanza `InsufficientStockException` si no alcanza.

**Transacciones:** cada caso de uso que mueve inventario abre `await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted)`, hace los cambios de documento más `PostAsync`, `SaveChangesAsync` y `CommitAsync`. Si algo falla, no queda nada registrado.

## 6. API

### 6.1 Convenciones

- Prefijo `/api/v1`. Recursos en plural y `kebab-case`: `/api/v1/purchase-orders`.
- Las acciones de estado van como `POST` sobre subrecurso: `/purchase-orders/{id}/submit`, `/approve`, `/cancel`, `/close`.
- **Listados:** `GET ?page=1&pageSize=25&sort=folio:desc&q=texto&status=Approved&locationId=...`. Responden:

  ```json
  { "items": [], "page": 1, "pageSize": 25, "total": 0 }
  ```

  `pageSize` máximo 100.
- **Detalle:** incluye `version` para concurrencia.
- **JSON** en `camelCase`; enums como string.
- **Errores:** `ProblemDetails` (RFC 9457), con `type` = `https://sgo/errors/<codigo>`:

| Situación | HTTP | Extensiones |
|---|---|---|
| Validación (FluentValidation) | 400 | `errors: { campo: [mensajes] }` |
| No autenticado | 401 | |
| Sin permiso o fuera de alcance de ubicación | 403 | |
| No encontrado | 404 | |
| Concurrencia (`version` distinta) | 409 | `code: "concurrency"` |
| Existencia insuficiente | 409 | `code: "insufficient_stock"`, `shortages: [{ itemId, sku, name, lotId, requested, available }]` |
| Regla de negocio / transición inválida | 422 | `code: "<regla>"`, ej. `"po_not_approved"` |

- Los mensajes de error para el usuario van **en español**.

### 6.2 Endpoints

Todos requieren autenticación excepto los de `auth`. Entre corchetes, el permiso requerido.

**Auth y usuario actual**

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | — | `{ email, password }` → `{ accessToken, expiresIn }` y cookie de refresh |
| POST | `/auth/refresh` | — (cookie) | Rota el refresh token y devuelve un nuevo access token |
| POST | `/auth/logout` | autenticado | Revoca el refresh token |
| GET | `/me` | autenticado | Usuario, permisos efectivos y ubicaciones permitidas |
| POST | `/me/change-password` | autenticado | |

**Organización y catálogos**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/locations`, `/locations/{id}` | [locations.view] / [locations.manage] |
| GET / POST / PUT | `/units-of-measure` | [catalog.view] / [catalog.manage] |
| GET / POST / PUT | `/item-categories` | [catalog.view] / [catalog.manage] |
| GET / POST / PUT | `/items`, `/items/{id}` | [catalog.view] / [catalog.manage] |
| GET / PUT | `/items/{id}/location-settings` (mín/máx por ubicación) | [catalog.view] / [catalog.manage] |
| GET | `/items/lookup?q&type&id&limit` — búsqueda ligera de artículos activos para los selectores | cualquiera de [catalog.view], [inventory.view], [logistics.view], [production.view], [purchasing.view] |
| POST | `/imports/items` (CSV) — valida todo y reporta errores por fila; si hay errores no importa nada | [catalog.manage] |

**Inventario**

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/stock?locationId&itemId&categoryId&belowMin=true` — existencias agregadas por artículo | [inventory.view] |
| GET | `/stock/{locationId}/{itemId}/lots` — detalle por lote | [inventory.view] |
| GET | `/movements?locationId&itemId&type&from&to` — kardex paginado | [inventory.view] |
| GET | `/alerts` — stock bajo y lotes por caducar de las ubicaciones del usuario | [inventory.view] |
| GET / POST | `/adjustments`, `/adjustments/{id}` — POST crea y registra de inmediato | [inventory.view] / [inventory.adjust] |
| GET / POST / PUT | `/physical-counts`, `/physical-counts/{id}` | [inventory.view] / [inventory.count] |
| POST | `/physical-counts/{id}/start`, `/close`, `/cancel` | [inventory.count] |
| GET / POST | `/consumptions`, `/consumptions/{id}` | [inventory.view] / [inventory.consumption] |
| POST | `/imports/initial-stock` (CSV) — carga de existencias iniciales como ajuste | [inventory.adjust] |

**Producción**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/recipes`, `/recipes/{id}` — PUT sobre receta ya usada crea nueva versión | [production.view] / [production.recipes.manage] |
| GET | `/recipes/{id}/explode?qty=` — consumo teórico y disponibilidad | [production.view] |
| GET / POST / PUT | `/production-orders`, `/production-orders/{id}` | [production.view] / [production.orders.manage] |
| POST | `/production-orders/{id}/release`, `/cancel` | [production.orders.manage] |
| POST | `/production-orders/{id}/complete` — `{ version, producedQty, lines: [{ componentItemId, actualQty, lots?: [{ lotId, qty }] }] }` | [production.orders.complete] |

**Logística**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/branch-orders`, `/branch-orders/{id}` | [logistics.view] / [logistics.orders.create] |
| POST | `/branch-orders/{id}/submit`, `/cancel` | [logistics.orders.create] |
| POST | `/branch-orders/{id}/approve` — `{ version, lines: [{ lineId, approvedQty }] }`; crea traspaso(s) en `Draft` | [logistics.orders.approve] |
| POST | `/branch-orders/{id}/reject` | [logistics.orders.approve] |
| GET | `/branch-orders/suggestion?locationId=` — sugerido por mín/máx | [logistics.orders.create] |
| GET / POST / PUT | `/transfers`, `/transfers/{id}` | [logistics.view] / [logistics.transfers.dispatch] |
| POST | `/transfers/{id}/dispatch` — `{ version, vehicleDescription, driverName, lines?: [{ lineId, lots: [{ lotId, qty }] }] }` | [logistics.transfers.dispatch] |
| POST | `/transfers/{id}/receive` — `{ version, lines: [{ lineId, receivedQty, discrepancyReason?, discrepancyNotes? }] }` | [logistics.transfers.receive] |
| POST | `/transfers/{id}/cancel` (solo `Draft`) | [logistics.transfers.dispatch] |
| GET | `/transfers/in-transit?locationId=` | [logistics.view] |

**Compras**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/suppliers`, `/suppliers/{id}`, `/suppliers/{id}/items` | [purchasing.view] / [purchasing.suppliers.manage] |
| GET / POST / PUT | `/requisitions`, `/requisitions/{id}` | [purchasing.view] / [purchasing.requisitions.manage] |
| POST | `/requisitions/{id}/submit`, `/approve`, `/reject`, `/cancel` | [purchasing.requisitions.manage]; aprobar requiere [purchasing.po.approve] |
| POST | `/requisitions/convert` — `{ requisitionIds }` → OC(s) agrupadas por proveedor | [purchasing.po.manage] |
| GET / POST / PUT | `/purchase-orders`, `/purchase-orders/{id}` | [purchasing.view] / [purchasing.po.manage] |
| POST | `/purchase-orders/{id}/submit`, `/cancel`, `/close` | [purchasing.po.manage] |
| POST | `/purchase-orders/{id}/approve`, `/reject` | [purchasing.po.approve] |
| GET / POST | `/goods-receipts`, `/goods-receipts/{id}` — POST `{ purchaseOrderId, poVersion, supplierInvoiceNumber, lines: [{ poLineId, quantity, lotNumber?, expirationDate? }] }` | [purchasing.view] / [purchasing.receive] |

**Seguridad y configuración**

| Método | Ruta | Permiso |
|---|---|---|
| GET / POST / PUT | `/users`, `/users/{id}`; POST `/users/{id}/reset-password`, `/activate`, `/deactivate` | [security.users.manage] |
| GET / POST / PUT | `/roles`, `/roles/{id}` | [security.roles.manage] |
| GET | `/permissions` — catálogo fijo | [security.roles.manage] |
| GET | `/audit-log?entityType&entityId&userId&from&to` | [security.audit.view] |
| GET / PUT | `/settings` | [settings.manage] |

**Tablero**

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/dashboard?locationId=` — conteos de alertas, traspasos en tránsito o por recibir, OC por aprobar, OP liberadas del día y pedidos pendientes | autenticado; cada bloque se filtra según los permisos del usuario |

## 7. Seguridad

- **Autenticación:**
  - ASP.NET Core Identity para usuarios y contraseñas. Política: mínimo 10 caracteres, con mayúscula, minúscula y número. Bloqueo según RN-42.
  - **Access token JWT** de 15 minutos (HS256; clave desde variable de entorno de al menos 32 bytes).
  - **Refresh token** opaco de 7 días. Se guarda hasheado en `security.refresh_token`, se entrega en cookie `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` y **rota en cada uso**. Si se detecta reutilización de un token ya rotado, se revoca toda la familia, salvo dentro de una **ventana de gracia de 30 s** tras la rotación mientras la sesión siga viva (renovaciones simultáneas del mismo navegador: dos pestañas, doble recarga): ahí se emite un token hermano de la misma familia.
- **Autorización por permiso:**
  - Atributo `[RequirePermission("purchasing.po.approve")]`, implementado con un `IAuthorizationPolicyProvider` dinámico.
  - Los permisos efectivos del usuario se resuelven por request desde `IMemoryCache` (TTL 5 min; se invalidan al editar roles o usuarios). No se meten todos los permisos al JWT.
- **Alcance por ubicación (RN-40):**
  - `ILocationScope` expone `AllowedLocationIds` y `EnsureAccess(locationId)`.
  - Todas las consultas filtran por ubicaciones permitidas.
  - Toda operación sobre un documento valida acceso a su ubicación o ubicaciones: en un traspaso, el despacho requiere el origen y la recepción requiere el destino.
- **Rate limiting** (middleware integrado): `/auth/login` 10 req/min por IP (`RateLimiting:LoginPermitLimit`; el compose de desarrollo lo sube a 60 para las E2E).
- **Proxy:** detrás de Caddy, con `UseForwardedHeaders` para la IP real. No se configura CORS, porque el frontend se sirve del mismo origen.

## 8. Validación, errores y logging

- **Validación:** un validador FluentValidation por request DTO, ejecutado por un filtro global antes del controller. Las reglas que requieren BD, como la existencia de una entidad, van en el servicio.
- **Manejo de excepciones:** `IExceptionHandler` global mapea las excepciones según la tabla 6.1. Las excepciones no controladas responden 500 con `traceId` y sin detalles internos.
- **Logging:** Serilog en consola con formato JSON compacto en producción. Incluye `UseSerilogRequestLogging`, y enriquece con `UserId`, `TraceId` y la ruta. **Nunca** registrar contraseñas ni tokens.
- **Salud:** health checks en `/health/live` y `/health/ready` (este último verifica la conexión a la BD).

## 9. Configuración

`appsettings.json` más variables de entorno (prefijo `SGO__`).

| Variable | Descripción |
|---|---|
| `SGO__ConnectionStrings__Default` | Conexión Postgres (en producción, `sslmode=require`) |
| `SGO__Jwt__Key` | Clave de firma del JWT |
| `SGO__Jwt__Issuer` / `SGO__Jwt__Audience` | |
| `SGO__Seed__AdminEmail` / `SGO__Seed__AdminPassword` | Solo se usan en la primera semilla |
| `ASPNETCORE_ENVIRONMENT` | `Development` / `Production` |

Los secretos nunca se versionan. Incluir `.env.example` con las variables y valores de ejemplo.

## 10. Pruebas

**Unitarias (`Sgo.UnitTests`)**, obligatorias:
- Cálculo de costo promedio (RN-04): entradas sucesivas, entrada con existencia cero y salida al costo vigente.
- Asignación FEFO: varios lotes, exclusión de vencidos, insuficiencia.
- Máquinas de estado de cada documento: transiciones válidas y todas las inválidas lanzan `BusinessRuleException`.
- Consumo teórico de receta (RN-11) y costo unitario de producción (RN-12).
- Aprobación de OC por umbral (RN-31) y tolerancia de recepción (RN-32).

**Integración (`Sgo.IntegrationTests`)**, con Postgres en Testcontainers y `WebApplicationFactory`:
- Flujo completo de compra: OC → aprobación → recepción parcial → recepción final → kardex y existencia correctos.
- Flujo de producción: OP → completar → consumos, lote de salida y costo.
- Flujo de logística: pedido → aprobación → despacho → recepción con faltante → estados y existencias.
- Existencia insuficiente: 409 con `shortages` y **sin** movimientos parciales.
- Concurrencia: dos despachos simultáneos del mismo traspaso → uno 200 y otro 409.
- Seguridad: 403 por permiso faltante y 403 por ubicación no asignada.

**Criterio:** `dotnet test` en verde antes de dar por terminada cualquier tarea.

## 11. Contenedores y despliegue

- **`backend/Dockerfile`:** multi-stage. `mcr.microsoft.com/dotnet/sdk:10.0` para compilar y `mcr.microsoft.com/dotnet/aspnet:10.0` para ejecutar, con usuario no root y puerto 8080.
- **Migraciones en producción:** paso explícito, no al arrancar la API. Generar un bundle con `dotnet ef migrations bundle` y ejecutarlo antes de levantar la nueva versión.
- **`deploy/docker-compose.yml`** (en el Droplet): servicios `api` (imagen del backend) y `web` (Caddy sirviendo el SPA y haciendo proxy a `api:8080`). La base de datos es el Postgres administrado de DigitalOcean.
- **`deploy/docker-compose.dev.yml`** (local): `postgres:16` más la API con recarga (`dotnet watch`).

## 12. Plan de implementación (tareas para Claude Code)

Cada tarea debe dejar el código compilando, con pruebas en verde y la migración creada si aplica. Hacer una tarea por sesión y empezar en modo plan.

**Fase 1: base, seguridad, catálogos e inventario**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| B-01 | Solución, proyectos, referencias, `Program.cs`, Serilog, ProblemDetails, health checks, OpenAPI + Scalar, Dockerfile y compose de desarrollo | `docker compose -f deploy/docker-compose.dev.yml up` levanta la API y `/health/ready` responde 200 |
| B-02 | `SgoDbContext`, convenciones, interceptores de timestamps y auditoría, generador de folios, semilla base | La migración inicial se aplica; la semilla es idempotente |
| B-03 | Identity, login/refresh/logout, `/me`, permisos dinámicos, `ILocationScope`, rate limit | Pruebas de integración de login, refresh con rotación, 401, 403 por permiso y 403 por ubicación |
| B-04 | CRUD de usuarios, roles, permisos y bitácora | Admin crea un usuario con rol y ubicaciones; el usuario inicia sesión y ve solo lo permitido |
| B-05 | Ubicaciones, unidades de medida, categorías, artículos, mín/máx e importación CSV de artículos | CSV con errores devuelve errores por fila sin importar nada |
| B-06 | Motor de inventario: `InventoryPostingService`, `LotAllocator`, costo promedio | Pruebas unitarias de RN-02, RN-04 y RN-05 en verde |
| B-07 | Existencias, kardex, alertas, ajustes e importación de existencias iniciales | Ajuste negativo sin existencia → 409 `insufficient_stock` |
| B-08 | Conteo físico y registro de consumo | Cierre de conteo genera ajustes por la diferencia contra el snapshot |
| B-09 | Traspasos directos (sin pedido): crear, despachar, recibir con discrepancias, en tránsito | Prueba de integración del flujo de traspaso y de concurrencia |

**Fase 2: producción**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| B-10 | Recetas con versionado y explosión teórica con disponibilidad | Editar una receta usada crea versión N+1 |
| B-11 | Órdenes de producción: liberar, completar (transaccional) y cancelar | Prueba de integración: consumos FEFO, lote de salida y costo unitario |

**Fase 3: compras, logística completa y tablero**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| B-12 | Proveedores y artículos de proveedor | |
| B-13 | Requisiciones y conversión a OC | Varias requisiciones se convierten en OC agrupadas por proveedor |
| B-14 | Órdenes de compra con aprobación por umbral, recepción parcial y cierre | Prueba de integración del flujo completo de compra |
| B-15 | Pedidos de sucursal, sugerido por mín/máx, aprobación que genera traspasos y actualización de estado al recibir | Prueba de integración pedido → traspaso → recepción → pedido `Fulfilled` |
| B-16 | Endpoint de tablero y configuración (`/settings`) | Cada bloque respeta los permisos del usuario |
| B-17 | Endurecimiento: revisar índices, `EXPLAIN` en kardex y existencias, bundle de migraciones y compose de producción | Kardex de 100k movimientos responde en < 300 ms |
