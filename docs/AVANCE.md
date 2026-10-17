# Avance de SGO Paníssimo

> Bitácora de trabajo para retomar entre sesiones. Última actualización: 2026-10-16 (B-07).
> Reglas: `docs/specs/dominio.md`; tareas: `docs/specs/backend.md` §13 y `docs/specs/frontend.md` §11.

## Backend

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | B-01 Solución, Program.cs, Serilog, ProblemDetails, JSON, health, OpenAPI + Scalar, Docker, compose dev, CLAUDE.md | ✅ | (ver `git log`) |
| 1 | B-02 AppDbContext, interceptores, folios, candados, semilla base. `InitialCreate` | ✅ | (ver `git log`) |
| 1 | B-03 Identity, login, refresh rotativo, permisos, alcance, rate limit | ✅ | (ver `git log`) |
| 1 | B-04 Usuarios, roles, bitácora, ubicaciones, settings | ✅ | (ver `git log`) |
| 1 | B-05 Catálogos y CSV de artículos | ✅ | (ver `git log`) |
| 1 | B-06 Motor de inventario | ✅ | (ver `git log`) |
| 1 | B-07 Existencias, kardex, alertas, ajustes, existencias iniciales | ✅ | (ver `git log`) |
| 1 | B-08 Conteo físico y consumo | ⏳ | |
| 1 | B-09 Traspasos directos | ⏳ | |
| 2 | B-10..B-13 Recetas, OP, cierres, importación de Excel | ⏳ | |
| 3 | B-14..B-16 Proveedores, requisiciones, OC y recepciones | ⏳ | |
| 4 | B-17..B-21 Pedidos de sucursal, clientes, remisiones, plan, requerimiento | ⏳ | |
| 5 | B-22..B-25 Tablero, costos y análisis, fotos, endurecimiento | ⏳ | |

## Frontend

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | F-01..F-08 | ⏳ | |
| 2 | F-09..F-12 | ⏳ | |
| 3 | F-13..F-15 | ⏳ | |
| 4 | F-16..F-20 | ⏳ | |
| 5 | F-21..F-24 | ⏳ | |

## Notas por tarea

### B-01 (2026-10-16)

- Solución `backend/Panissimo.sln`: `Panissimo.Domain`, `Panissimo.Application`, `Panissimo.Infrastructure`, `Panissimo.Api`, `tests/Panissimo.UnitTests`, `tests/Panissimo.IntegrationTests`. `TreatWarningsAsErrors` en `Directory.Build.props`.
- API: prefijo `/api/v1` por convención, JSON con enums como texto y números estrictos (mismas opciones en MVC y OpenAPI), `ProblemDetails` en español (`ProblemDetailsMapper`, `GlobalExceptionHandler`, errores de *model binding* con claves `camelCase`), filtro global de FluentValidation, Serilog (JSON compacto fuera de Development), `/health/live` y `/health/ready` (consulta `SELECT 1`), OpenAPI + Scalar en Development.
- Excepciones de dominio en `Panissimo.Domain/Common/DomainExceptions.cs` (422, 404, 409, 401, 400, 403, `insufficient_stock` con `shortages`).
- Docker: `backend/Dockerfile` (targets `runtime` y `migrator` con bundle por `TARGETARCH`); `deploy/docker-compose.dev.yml` (postgres 16, api con `dotnet watch` en el puerto 8090, respaldos diarios en `deploy/backups`).
- `deploy/seed/locations.csv` vacío (solo encabezados) hasta confirmar D-01.
- Pruebas: 10 unitarias (mapeo de errores, claves camelCase) y 4 de integración (health, 404 en ProblemDetails, OpenAPI).
- Paquetes (licencia): FluentValidation 12.1.1 (Apache-2.0), Microsoft.AspNetCore.OpenApi 10.0.12 (MIT), Scalar.AspNetCore 2.17.8 (MIT), Serilog.AspNetCore 10.0.0 y Serilog.Formatting.Compact 3.0.0 (Apache-2.0), Npgsql 10.0.3 y Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3 (PostgreSQL), Microsoft.EntityFrameworkCore 10.0.12 (MIT), EFCore.NamingConventions 10.0.1 (Apache-2.0), xunit 2.9.3 (Apache-2.0), NSubstitute 6.2.0 (BSD), Testcontainers.PostgreSql 4.15.0 (MIT), Microsoft.AspNetCore.Mvc.Testing 10.0.12 (MIT).

### B-02 (2026-10-16)

- `AppDbContext` (Identity + `IAppDbContext`): snake_case, decimales `numeric(18,4)`, enums como texto, `xmin` como `version` en todo `IVersioned`, ids Guid v7 generados en código, una secuencia por tipo de documento (13 folios, dominio §3).
- Entidades base: `Location` (`Plant`/`Branch` y derivados), `ProductionArea` y enum `Shift`, `UnitOfMeasure` (`pza` exige enteros), `AppSetting` tipado con `SettingDefinitions` (9 parámetros con límites y default), `AppUser`/`AppRole` (`SystemKey`), `RolePermission`, `UserLocation`, `AuditLog`.
- `TimestampsInterceptor` y `AuditInterceptor` (RN-41; binarios por tamaño, ids compuestos con `|`), `FolioGenerator`, `PostgresTransactionLocks` (`pg_advisory_xact_lock`), `UserDirectory`, `HttpCurrentUser`.
- Semilla idempotente (`DatabaseSeeder`): `PLANTA` + sucursales de `PAN__Seed__LocationsCsv` (D-01, propuesta), 8 unidades, 11 áreas, 9 parámetros, 35 permisos y 10 roles de dominio §6, administrador (con la Planta como ubicación). No sobrescribe ediciones. Se ejecuta en Development al arrancar o con `--seed`.
- Migración `InitialCreate`.
- Pruebas: 30 unitarias y 12 de integración (semilla completa e idempotente, folios, candado sin transacción, bitácora con timestamps, directorio de usuarios).
- Paquetes nuevos (licencia): Microsoft.AspNetCore.Identity.EntityFrameworkCore 10.0.12 (MIT), CsvHelper 33.1.0 (MS-PL / Apache-2.0), Microsoft.EntityFrameworkCore.Design 10.0.12 (MIT).

### B-03 (2026-10-16)

- Endpoints: `POST /auth/login` (rate limit 10/min por IP, `PAN__RateLimiting__LoginPermitLimit`), `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `POST /me/change-password`.
- Access token JWT HS256 de 15 min (`PAN__Jwt__Key` ≥ 32 bytes, validado al arrancar); refresh opaco de 7 días con hash SHA-256 en `security.refresh_token`, cookie `pan_refresh` (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`), rotación por uso, ventana de gracia de 30 s (token hermano) y revocación de la familia al reutilizar fuera de ella.
- RN-42: contraseña ≥ 10 con mayúscula, minúscula y número; bloqueo 15 min tras 5 fallos; usuario inactivo no entra y sus tokens vigentes se rechazan (`UserAccessMiddleware`). Mensajes de Identity en español.
- `[RequirePermission("a", "b")]` (basta uno) con `PermissionPolicyProvider` dinámico; permisos efectivos y ubicaciones en `IMemoryCache` 5 min (`IUserAccessService`, invalidación por usuario o total). `ILocationScope` (`AllowedLocationIds`, `EnsureAccess` → 403). Política de respaldo: todo endpoint exige sesión salvo `[AllowAnonymous]`.
- Cambiar la contraseña revoca todas las sesiones (el frontend cierra sesión con aviso, frontend §7.1).
- Migración `AddRefreshTokens`.
- Pruebas: 34 unitarias y 24 de integración (login, cookie, 401, bloqueo, inactivo, `/me`, rotación con gracia y robo, logout, cambio de contraseña, 403 por permiso y por ubicación con un controlador de prueba, 429).
- Paquetes nuevos (licencia): Microsoft.AspNetCore.Authentication.JwtBearer 10.0.12 (MIT).

### B-04 (2026-10-16)

- `/users` (lista con filtros, alta, edición, `reset-password`, `activate`, `deactivate`), `/roles` (matriz de permisos), `/permissions` (agrupados por módulo), `/audit-log` (filtros; `entityId` incluye llaves compuestas `id|…`), `/locations` (alcance del usuario, alta, edición con `version`), `/locations/lookup` (todas las activas, Planta primero; `locations.view` o `logistics.view` o `sales.view`), `/settings` (lista tipada y PUT parcial con `version` por parámetro).
- RN-43 (`PrivilegeGuard`): no se otorgan ni quitan roles, permisos o ubicaciones que no se tienen; no se administra a un usuario con más acceso; el rol Administrador conserva todos los permisos (`admin_role_locked`); nadie se quita a sí mismo `security.users.manage`/`security.roles.manage` ni se desactiva.
- Desactivar o restablecer contraseña revoca las sesiones; cambios de rol invalidan la caché de accesos de todos.
- Comunes de Application: `PageQuery`/`PagedResult` (máx. 100), `ApplySort` con lista blanca (400 si el campo no existe), `EnsureVersion` (409), `GetSettingAsync`, `VersionRequest`.
- Nota: los enums se guardan como texto; ordenar por ellos es alfabético (la Planta se ordena primero de forma explícita).
- Pruebas: 34 unitarias y 33 de integración (+9: alta de usuario y alcance, ubicaciones con versión, anti-escalamiento, rol Administrador bloqueado, cambio de permisos inmediato, desactivación, bitácora de usuario, parámetros con límites y versión).

### B-05 (2026-10-16)

- `/units-of-measure`, `/item-categories`, `/production-areas` (código fijo, orden, activa), `/items` (filtros `type`, `presentation`, `categoryId`, `areaId`, `bulkItemId`, `includeInactive`), `/items/lookup` (≤ 50; `q`, `type`, `presentation`, `areaId`, `id`), `/items/{id}/location-settings`, `POST /imports/items` (multipart, 2 MB).
- `Item` con tipos `RawMaterial | Supply | SemiFinished | FinishedGood`, `Presentation` (obligatoria solo en terminados), `BulkItemId` y `UnitsPerPackage` (solo empaquetados; el granel debe ser terminado a granel activo y no él mismo), `ProductionAreaId` (solo producidos), `ProductionMultiple` (> 0, default 1; entero si la unidad base es `pza`), `UnitWeightGrams`. Un granel con empaquetados ligados no deja de ser granel.
- CSV (`sku,nombre,tipo,categoria,unidad_base,unidad_compra,factor_compra,maneja_lotes,vida_util_dias,almacenamiento,iva,presentacion,sku_granel,piezas_por_paquete,area,multiplo_op,gramaje_g`): todo o nada, errores por fila y columna (`rowErrors`), sin distinguir mayúsculas ni acentos en valores, área por código o nombre, `sku_granel` puede venir en el mismo archivo; SKU existente se actualiza (conserva su estado activo).
- Migración `AddCatalog`.
- Unidad base y control de lotes quedan fijos cuando el artículo tiene movimientos: se agregó en B-06 (API 422 `item_has_movements` y CSV por fila).
- Pruebas: 49 unitarias y 41 de integración (granel + empaquetado ligado, liga inválida, múltiplo fraccionario en `pza`, lookup por filtros, mín/máx, áreas, CSV con errores sin importar nada, CSV con liga en el mismo archivo y actualización, permisos).

### B-06 (2026-10-16)

- Entidades `Lot`, `StockBalance` (único con `NULLS NOT DISTINCT`), `ItemLocationCost`, `InventoryMovement` (inmutable, `Sequence` identity para el orden del kardex; índice cubriente para el saldo corrido).
- `IInventoryPostingService` (exige transacción abierta): crea filas faltantes con `ON CONFLICT`, bloquea costos y existencias con `FOR UPDATE` en orden estable y delega en `InventoryPostingCalculator` (puro): RN-02 con todos los faltantes juntos, RN-03b (enteros en `pza`), RN-04 costo promedio por ubicación, RN-05 (lote obligatorio/prohibido, FEFO con desempate por creación, vencidos rechazados en `TransferOut`, `CustomerShipment`, `ProductionConsumption` y `Consumption`). No guarda: el caso de uso hace `SaveChanges` y `Commit`.
- `ILotAllocator` (vista previa FEFO sin bloqueo) e `ILotRegistry` (candado `pg_advisory_xact_lock` por artículo y lote; rechaza otra caducidad).
- Nuevo tipo de movimiento `CustomerShipment` (remisiones, B-19).
- Migración `AddInventory`.
- Pruebas: 68 unitarias y 49 de integración (+8: transacción obligatoria, kardex y costo, faltante sin movimientos parciales, salidas concurrentes sin negativos, lote nuevo concurrente compartido, caducidad distinta, FEFO sin vencidos, candado de unidad/lotes con movimientos).

### B-07 (2026-10-16)

- `GET /stock` (filtros `locationId`, `itemId`, `categoryId`, `type`, `belowMin`, `q`; incluye artículos con mínimo sin existencia), `GET /stock/{locationId}/{itemId}/lots`, `GET /movements` (kardex del más reciente al más antiguo; saldo corrido con ubicación y artículo, calculado con el índice cubriente), `GET /alerts` (RN-07: bajo mínimo y lotes que vencen en ≤ `inventory.expiry_alert_days`).
- `/adjustments` (lista, detalle con movimientos aplicados y lotes FEFO, alta): motivos `Correction` (entradas con costo, lote y caducidad; salidas), `Waste`, `Expired`, `Damaged` (movimiento `Waste`) e `InternalUse` (solo salidas). Estado único `Posted`: se corrige con otro ajuste.
- `POST /imports/initial-stock` (RN-08): `ubicacion,sku,cantidad,costo_unitario,lote,caducidad`; un ajuste de corrección por ubicación; rechaza artículos con movimientos en esa ubicación; enteros en `pza`.
- RN-05 completado en `LotRegistry`: sin caducidad capturada, un lote existente conserva la suya y uno nuevo toma fecha de negocio + `ShelfLifeDays`.
- Migración `AddAdjustments`.
- Pruebas: 79 unitarias y 56 de integración (+7: ajuste sin existencia → 409 con faltantes y sin movimientos, lote con caducidad por omisión y FEFO, costo y saldo corrido paginado, bajo mínimo y por caducar, alcance, piezas fraccionarias, CSV de existencias iniciales).

## Pendientes y decisiones abiertas

- D-01..D-10 (dominio §8) siguen como **propuesta**. B-02 usa D-01 (PLANTA + CSV de sucursales); B-04 depende de D-10 (no bloquea: solo semilla y capacitación).
