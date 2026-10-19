# Avance de SGO Paníssimo

> Bitácora de trabajo para retomar entre sesiones. Última actualización: 2026-10-19 (integración y E2E en verde con Colima).
> Reglas: `docs/specs/dominio.md`; tareas: `docs/specs/backend.md` §13 y `docs/specs/frontend.md` §11.

## ▶ Retomar aquí (estado al 2026-10-18)

**Dónde quedamos**
- **Plan completo:** backend B-01..B-28 y frontend F-01..F-26 terminados y en `main`, incluida la ampliación de trazabilidad (B-28 y F-26).
- Pruebas en verde: backend 282 unitarias y 167 de integración (más la de volumen, que corre con `PAN_PERF_VOLUME=1`) (`cd backend && dotnet test -nologo -v q`; Docker debe estar corriendo por Testcontainers); frontend 187 unitarias, lint y build; E2E: suite completa 45 en verde y 22 omitidas por diseño (escritorio y celular); la E2E 7 falló una vez por el botón de ayuda (corregido abajo) y se volvió a correr en verde con las que usan barra de acciones.
- Migraciones hasta `AddShipmentDelivery` (RN-114).
- BD de desarrollo reparada el 2026-10-17: tenía aplicado un borrador viejo de `AddSuppliers`; se borraron sus 2 tablas vacías y su renglón del historial, y la API aplicó las migraciones vigentes.

**Decisiones:** D-01..D-11 en `docs/specs/dominio.md` §8. D-11 (roles de la trazabilidad) decidida con el usuario el 2026-10-18. D-10 sigue abierta (no bloquea). El tema claro va en **verdes** (decisión del usuario, 2026-10-17; frontend §4.1); el oscuro conserva el "neón azul".

**Siguiente:** no quedan tareas en el plan. Lo que falta depende del cliente: D-10 (usuarios por rol), la lista real de sucursales (`deploy/seed/locations.csv`, D-01) y el arranque en producción (`deploy/README.md`). Todo lo demás requiere una tarea nueva en los specs.

**Para arrancar mañana**
1. Abrir Docker Desktop.
2. `docker compose -f deploy/docker-compose.dev.yml up -d` (API en 8090, Postgres en 5433; `deploy/.env` ya existe localmente).
3. `cd backend && dotnet build && dotnet test -nologo -v q` para confirmar verde.
4. `cd frontend && npm ci && npm test && npm run lint`; `npm start` abre http://localhost:4200 con proxy a la API (8090).
5. E2E: `cd frontend && npm run e2e` (usa el Chrome instalado y `deploy/.env` para el admin; levanta `npm start` si no está corriendo). Los componentes compartidos se ven en `/demo/componentes` (permiso `settings.manage`).

**Recordatorios**
- D-01..D-10 siguen como propuesta; `deploy/seed/locations.csv` solo trae encabezados (falta la lista real de sucursales, D-01).
- Patrones a reutilizar: reclamo de fila con `version` para concurrencia, `IInventoryPostingService` dentro de transacción, `[RequirePermission]` + `ILocationScope`, ejemplos OpenAPI en `OpenApiSetup.RequestExamples`.

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
| 1 | B-08 Conteo físico y consumo | ✅ | (ver `git log`) |
| 1 | B-09 Traspasos directos | ✅ | `246e708` |
| 2 | B-10 Recetas versionadas y explosión | ✅ | `6a77239` |
| 2 | B-11 Órdenes de producción | ✅ | `f7babc5` |
| 2 | B-12 Cierres parciales y final | ✅ | `1be95dd` |
| 2 | B-13 Importación de OP desde Excel | ✅ | `c95444b` |
| 3 | B-14 Proveedores y artículos de proveedor | ✅ | (ver `git log`) |
| 3 | B-15 Requisiciones y conversión a OC | ✅ | (ver `git log`) |
| 3 | B-16 OC y recepciones | ✅ | (ver `git log`) |
| 4 | B-17 Pedidos de sucursal | ✅ | (ver `git log`) |
| 4 | B-18 Clientes y pedidos de cliente | ✅ | (ver `git log`) |
| 4 | B-19 Remisiones | ✅ | (ver `git log`) |
| 4 | B-20 Plan de producción | ✅ | (ver `git log`) |
| 4 | B-27 Retrabajo por decisiones | ✅ | (ver `git log`) |
| 4 | B-26a Subalmacenes: modelo y alcance | ✅ | (ver `git log`) |
| 4 | B-26b Vale interno | ✅ | (ver `git log`) |
| 4 | B-26c Procesos eligen subalmacén | ✅ | (ver `git log`) |
| 4 | B-26d Totales por ubicación | ✅ | (ver `git log`) |
| 4 | B-21 Requerimiento de materia prima | ✅ | (ver `git log`) |
| 5 | B-22 Tablero y resumen de producción | ✅ | (ver `git log`) |
| 5 | B-23 Costo de receta y análisis de consumo | ✅ | (ver `git log`) |
| 5 | B-24 Fotos de artículos | ✅ | (ver `git log`) |
| 5 | B-25 Endurecimiento y despliegue | ✅ | (ver `git log`) |
| + | B-28 Trazabilidad de lotes (`docs/specs/trazabilidad.md`) | ⏳ | |

## Frontend

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | F-01 Proyecto, tema, locale, íconos, shell | ✅ | (ver `git log`) |
| 1 | F-02 Sesión, interceptores, guardas, login, perfil | ✅ | (ver `git log`) |
| 1 | F-03 Layout, estilos y componentes compartidos | ✅ | (ver `git log`) |
| 1 | F-04 Administración (usuarios, roles, bitácora, configuración) | ✅ | (ver `git log`) |
| 1 | F-05 Catálogos (ubicaciones, categorías, unidades, áreas, artículos, CSV) | ✅ | (ver `git log`) |
| 1 | F-06 Inventario (existencias, kardex, ajustes, existencias iniciales) | ✅ | (ver `git log`) |
| 1 | F-07 Conteo físico y consumo | ✅ | (ver `git log`) |
| 1 | F-08 Traspasos directos | ✅ | (ver `git log`) |
| 2 | F-09 Recetas | ✅ | (ver `git log`) |
| 2 | F-10 Órdenes de producción | ✅ | (ver `git log`) |
| 2 | F-11 Cierres de producción | ✅ | (ver `git log`) |
| 2 | F-12 Importación de OP desde Excel | ✅ | (ver `git log`) |
| 2 | F-25 Vales internos entre subalmacenes | ✅ | (ver `git log`) |
| 3 | F-13 Proveedores y artículos de proveedor | ✅ | (ver `git log`) |
| 3 | F-14 Requisiciones y conversión a OC | ✅ | (ver `git log`) |
| 3 | F-15 Órdenes de compra y recepciones | ✅ | (ver `git log`) |
| 4 | F-16 Pedidos de sucursal con sugerido y aprobación | ✅ | (ver `git log`) |
| 4 | F-17 Clientes y pedidos de cliente | ✅ | (ver `git log`) |
| 4 | F-18 Remisiones con despacho, lotes e impresión | ✅ | (ver `git log`) |
| 4 | F-19 Plan de producción con generación de OP | ✅ | (ver `git log`) |
| 4 | F-20 Requerimiento de materia prima y requisición sugerida | ✅ | (ver `git log`) |
| 5 | F-21 Tablero y resumen de producción | ✅ | (ver `git log`) |
| 5 | F-22 Costos de receta y análisis de consumo | ✅ | (ver `git log`) |
| 5 | F-23 Fotos de artículos | ✅ | (ver `git log`) |
| 5 | F-24 Pulido | ✅ | (ver `git log`) |
| + | F-26 Pantalla de trazabilidad (`docs/specs/trazabilidad.md`) | ⏳ | |

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

### B-08 (2026-10-16)

- `/physical-counts` (lista, detalle, alta, PUT de autoguardado con `version`, `POST /{id}/lines`, `start`, `close`, `cancel`). RN-06: el snapshot (con `FOR SHARE` para que cantidades y secuencia del kardex coincidan) se toma al iniciar; las líneas agregadas se valúan a la secuencia del snapshot; el cierre exige todo contado y registra `PhysicalCountAdjustment` por contado − snapshot, respetando los movimientos ocurridos durante el conteo. Un solo conteo en curso por ubicación (índice parcial único). Lote contado nuevo se crea con `LotRegistry`. Conteos enteros en `pza`.
- `/consumptions` (RN-09): solo sucursales, fecha de negocio hoy o anterior, FEFO si no se elige lote; estado único `Posted`.
- Migración `AddCountsAndConsumptions`.
- Pruebas: 85 unitarias y 61 de integración (+5: cierre contra snapshot con venta durante el conteo y lote encontrado, un conteo en curso por ubicación, cierre incompleto, agregar línea y piezas enteras, consumo solo en sucursal/no futuro/FEFO, alcance).

### B-09 (2026-10-16)

- `/transfers` (lista con `tab` = `ToDispatch | InTransit | Received | All` y filtros; detalle; alta; edición en borrador; `dispatch` con vehículo, chofer y lotes elegidos `{ lotId, qty }` opcionales; `receive`; `cancel`).
- RN-21 despacho: `TransferOut` con lote planeado, lotes elegidos o FEFO (vencidos rechazados); las líneas quedan una por lote enviado con el costo del origen. RN-22 recepción: todas las líneas a la vez, nunca más de lo enviado, faltante con motivo → `ReceivedWithDiscrepancies` y pérdida en tránsito valuada; `TransferIn` con los mismos lotes y costo. RN-23: solo el borrador se edita o cancela. RN-25: Planta → sucursal sin permiso especial; sucursal → sucursal y sucursal → Planta con `logistics.transfers.special`. Despacho exige el origen en el alcance; recepción, el destino. Concurrencia: la primera escritura reclama la fila con `version` (409 al segundo). Piezas enteras desde la captura.
- `BranchOrderId` existe sin FK; `ITransferLinks` (hoy `NoTransferLinks`) es el punto donde B-17 conectará el pedido de sucursal (RN-24 al despachar, cancelar traspaso cancela pedido, edición dentro de lo aprobado).
- Migración `AddTransfers`.
- Pruebas: 91 unitarias y 67 de integración (+6: despacho FEFO y recepción con faltante al costo del origen, despachos concurrentes 200/409, faltantes sin cambiar el borrador, rutas especiales y piezas, recepción solo en destino y cancelación, lotes elegidos y vencido rechazado).

**Fase 1 del backend completa (B-01..B-09).** Siguiente: F-01..F-08 (frontend fase 1) o B-10..B-13 (producción).

### B-10 (2026-10-16)

- `/recipes` (lista con versiones anteriores opcionales, detalle con historial de versiones, alta, PUT, `activate`, `deactivate`, `explode?qty&locationId`).
- RN-10: una activa por artículo (índice parcial único); editar una usada crea la versión N+1 y desactiva la anterior; editar una no usada la modifica; activar otra versión exige desactivar la activa. `MarkUsed` lo llama la OP (B-11).
- RN-14 y D-04: producto semiterminado o terminado; componentes materia prima, insumo o semiterminado (nunca terminado); sin ciclos entre recetas activas.
- RN-11/RN-12: teórico = Q / rendimiento × cantidad × (1 + merma %); explosión con existencia utilizable (sin lotes vencidos), faltante, costo promedio y costo estimado; `HasRecipe` marca semiterminados con receta ("por producir", RN-67).
- Migración `AddRecipes`. El costo por versión (RN-51) queda en B-23.
- Pruebas: 104 unitarias y 72 de integración (+5: versión N+1 y edición en su lugar, una activa y reactivación, tipos de producto y componente, ciclo de semiterminados, explosión con vencidos excluidos y costo).

### B-11 (2026-10-16)

- `/production-orders` (lista con `tab` = `ToProduce | InProgress | Drafts | All` y filtros `status`, `locationId`, `from`, `to`, `areaId`, `shift`, `source`, `importId`, `outputItemId`, `q`; trae `producedQty`, `progressPct`, `closeCount`), detalle (componentes con teórico, real acumulado y disponibilidad mientras está abierta; `maxAllowedQty` por la tolerancia de RN-63), alta, edición en borrador, `release`, `cancel`.
- RN-60: borrador editable (cambiar de producto toma su receta activa); liberada se cancela solo sin cierres; en proceso no se cancela. RN-14: solo en la Planta y solo semiterminados o terminados. Área por omisión la del artículo. Piezas enteras. Fecha programada hoy o posterior. Crear o editar marca la receta como usada (RN-10).
- `CreateInTransactionAsync` (orígenes `Manual`, `Plan`, `Import`) lo reutilizarán el plan (B-20) y la importación (B-13). Se crea la tabla `production_order_import` (sin lógica hasta B-13) para la liga `ImportId`.
- La entidad ya lleva `ProducedQty`, `TotalCost`, `UnitCost`, `CloseCount`, datos del cierre final y `ActualQty` por línea para B-12.
- Migración `AddProductionOrders`.
- Pruebas: 109 unitarias y 77 de integración (+5: receta activa y área por omisión con versión conservada, sin receta → 422, solo Planta/piezas/fecha, ciclo borrador → liberada → cancelada y pestañas, permisos del supervisor).

### B-12 (2026-10-16)

- `GET /production-orders/{id}/close-preview?qty` (teórico, existencia utilizable, costo estimado, lote y caducidad que se crearían), `GET/POST /production-orders/{id}/closes` (201 con `{ close, order }`), `GET /production-closes` (filtros `locationId`, `from`, `to`, `areaId`, `itemId`, `productionOrderId`, `kind`, `q`) y `/production-closes/{id}` (consumos, lotes, merma, lote producido).
- §5.1 en una transacción: reclamo de la fila de la OP con `version` (RN-66: cierres simultáneos 201/409); RN-61 consumo real por componente (por omisión el teórico de lo producido en el cierre; lotes elegidos que deben sumar o FEFO; vencidos rechazados); RN-62 lote `{folio}-{nn}` con caducidad = fecha de negocio + vida útil (sin lote si el artículo no maneja lotes); RN-64 costo del cierre = Σ consumo real × costo promedio, entrada al costo unitario del cierre y acumulado en la OP; RN-13 merma por línea (real − teórico) y su costo; RN-63 tolerancia (`production.overrun_tolerance_pct`, también en parciales), motivo de faltante en el cierre final (notas con `Other`), cierre final en 0 solo con cierres previos y sin consumos; RN-65 los cierres son inmutables; turno por omisión el de la OP.
- Migración `AddProductionCloses` (índice único `(production_order_id, sequence)`).
- Pruebas: 119 unitarias y 83 de integración (+6: 2 parciales + final con kardex, tres lotes y caducidad, costos por cierre y acumulado, merma; faltante 409 sin movimientos; cierres concurrentes 201/409; cancelar con cierres 422 y tolerancia; cierre final en 0 y suma de lotes; supervisor cierra).

### B-13 (2026-10-16)

- `/production-order-imports/template` (.xlsx con hoja OP: encabezados, formato de fecha y lista Día/Tarde/Noche en turno; hoja Instrucciones), `POST /validate` (vista previa: `fileSha256`, filas, órdenes, `errors` por fila y columna, `warnings`, órdenes a crear), `POST /production-order-imports` (multipart `file`, `confirmWarnings`, `releaseOnImport`; 400 con `rowErrors`, 422 `import_warnings_not_confirmed`, liberar exige `production.orders.manage`), lista e historial con sus OP. Límite de 5 MB por endpoint.
- `ClosedXmlOrderReader`: hoja `OP` o la primera; encabezados sin mayúsculas, acentos ni espacios; celdas de fecha, número, texto o valor en caché de fórmula (si un archivo no trae caché, se evalúa); filas vacías ignoradas.
- RN-90..RN-95: fecha (celda, serial de Excel o `dd/mm/aaaa`, no pasada), SKU semiterminado/terminado activo con receta activa, cantidad > 0 con 4 decimales y entera en `pza`, área por código o nombre, turno, ubicación = Planta del alcance, notas ≤ 500; columnas desconocidas como aviso; máximo 3,000 filas; agrupación por (fecha, sku, área, turno, ubicación) con notas unidas; avisos de archivo repetido (SHA-256) y de OP existente; todo o nada en una transacción.
- Alta de OP por lote (`CreateManyInTransactionAsync`): catálogos en pocas consultas y folios con `NextManyAsync` (una sola consulta con `generate_series`). La usará también el plan (B-20).
- Paquete nuevo (licencia): ClosedXML 0.105.1 (MIT, verificado en el nuspec). `SixLabors.Fonts` solo como dependencia transitiva; ninguna referencia directa a `SixLabors.*`.
- Pruebas: 123 unitarias (+4 del lector y la plantilla) y 89 de integración (+6: errores por fila sin crear nada, agrupación y liga a `IMP`, avisos de duplicado y OP existente con confirmación, liberar al importar y permiso, plantilla, rendimiento 3,000 filas: validación < 5 s e importación < 10 s con `Category=Performance`). Las reglas RN-90..RN-93 se prueban de punta a punta contra la API en lugar de unitarias aisladas.

**Fase 2 del backend completa (B-10..B-13).**

### B-14 (2026-10-17)

- `Supplier` y `SupplierItem` (esquema `purchasing`, migración `AddSuppliers`). `TaxIdRules` en `Domain/Common` (lo reutilizará el cliente en B-18): RFC de 12 o 13 caracteres con fecha AAMMDD válida, en mayúsculas; no se verifica el dígito de la homoclave. Únicos con índice parcial que excluye `XAXX010101000` y `XEXX010101000`; la validación previa responde 400 en `taxId`.
- Endpoints: `GET/POST /suppliers` (q por razón social o RFC, `includeInactive`), `GET/PUT /suppliers/{id}`, `GET /suppliers/lookup`, `GET/POST /suppliers/{id}/items`, `PUT /suppliers/{id}/items/{supplierItemId}` y `GET /items/{id}/supplier-offers` (proveedores activos: primero el preferido, luego el más barato por unidad base). Permisos `purchasing.view` y `purchasing.suppliers.manage`; catálogo global, sin alcance de ubicación.
- RN-35: marcar preferido desmarca el anterior dentro de una transacción con dos candados en orden fijo (`supplier` y luego `preferred-supplier` por artículo) y un índice único parcial `ix_supplier_item_preferred`. Una fila inactiva nunca es preferida. Desactivar el proveedor quita sus preferencias; sus artículos responden 422 `supplier_inactive` hasta reactivarlo.
- Solo se agregan materias primas e insumos activos, una vez por proveedor. `PricePerBaseUnit` = precio / factor de compra (4 decimales).
- Sin paquetes nuevos.
- Pruebas: 148 unitarias (+25: RFC, proveedor y fila) y 95 de integración (+6: RFC y genéricos, cambio de preferido con 409 por versión, artículos permitidos, desactivar y reactivar, 4 marcas de preferido en paralelo, permisos). Sin el candado, la prueba en paralelo falla.
- Decisión de API: el spec decía `PUT /suppliers/{id}/items`; se implementó por fila (`/items/{supplierItemId}`, con `version`) para seguir la concurrencia optimista por fila.

### B-15 (2026-10-17)

- `PurchaseRequisition` + líneas (`Draft → Submitted → Approved → Converted`; `Rejected` desde `Submitted` con motivo; `Cancelled` desde `Draft`, `Submitted` o `Approved`). Solo en la Planta y en el alcance; `NeededBy` no pasada al crear, editar y enviar; cantidades en unidad de compra (enteras si es `pza`); solo materias primas e insumos activos, sin repetir.
- Proveedor por línea: vacío toma el preferido activo; uno indicado debe estar activo y vender el artículo. Enviar exige proveedor en todas las líneas.
- `PurchaseOrder` + líneas creada en esta tarea (B-16 le agrega edición, envío, aprobación y recepciones): importes `numeric(18,2)` redondeados por línea (`PurchaseOrderMath`), encabezado = suma de líneas.
- `POST /requisitions/convert` (`purchasing.po.manage`): `RequisitionConversion.Group` agrupa por proveedor + entrega, una línea de OC por línea de requisición (`RequisitionLineId`, índice único), precio del catálogo, IVA del artículo, fecha esperada = `NeededBy` más próxima, OC en `Draft` con nota "Generada desde REQ-…". Revalida proveedor, catálogo y artículo; cualquier problema → 422 sin convertir nada. Reclama las requisiciones con su versión antes de crear las OC: una conversión simultánea responde 409.
- Endpoints `/requisitions` (lista con status, locationId, from/to, q), detalle (importe estimado con el precio actual y OC de cada línea), alta, edición, `submit`, `cancel` (`purchasing.requisitions.manage`), `approve`, `reject` (`purchasing.po.approve`).
- **Pendiente movido:** `POST /requisitions/suggested` depende de RN-50 y se hará en B-21.
- Sin paquetes nuevos.
- Pruebas: 160 unitarias (+12: transiciones, agrupación, redondeo) y 100 de integración (+5: conversión agrupada con totales, todo o nada, conversión concurrente, catálogo y envío, permisos de Compras y Almacén).

### B-16 (2026-10-17)

- `PurchaseOrder`: edición en borrador (el proveedor queda fijo; una línea existente conserva su requisición si conserva el artículo), `submit` (RN-31: subtotal ≥ `purchasing.po_approval_threshold` → `PendingApproval`; si no, `Approved` automática con `ApprovedBy` nulo), `approve`, `reject` (motivo, final), `cancel` (Draft, PendingApproval o Approved sin recepciones), `close` (solo `PartiallyReceived`).
- RN-30: solo artículos activos del catálogo activo del proveedor; precio sugerido del catálogo y editable; IVA del artículo; enteras si la unidad de compra es `pza`. RN-33: entrega solo en la Planta.
- `GoodsReceipt` + líneas (folio `REC`): `POST /goods-receipts` con `poVersion`; una línea puede venir en varios lotes; tolerancia `purchasing.receipt_tolerance_pct` (RN-32); lote obligatorio si el artículo maneja lotes y prohibido si no; caducidad por defecto la del lote o hoy + vida útil (RN-05). Registra `PurchaseReceipt` en la Planta con `BaseQuantity = cantidad × factor` y costo base `UnitPrice / factor` sin IVA (RN-03, RN-33), dentro de una transacción con `IInventoryPostingService`. La primera escritura reclama la OC con su versión: una recepción simultánea responde 409.
- Endpoints `/purchase-orders` (pestañas `tab=ToApprove|ToReceive`, `pendingReceipt`, `supplierId`, `locationId`, `from/to`, q por folio o proveedor; detalle con pendiente, máximo recibible, requisición de origen y recepciones) y `/goods-receipts` (historial y detalle con costo).
- Sin paquetes nuevos.
- Pruebas: 172 unitarias (+12: umbral, rechazo, recepción en varios lotes, tolerancia, cancelar y cerrar, conversión a unidad base y costo) y 106 de integración (+6: compra completa requisición → OC → aprobación → recepción parcial con lote → final con kardex, lotes y costo promedio; umbral; tolerancia; recepciones simultáneas 201/409; reglas de cancelación, cierre, catálogo y lotes; permisos de Almacén y sucursal).

**Fase 3 del backend completa (B-14..B-16).**

### B-17 (2026-10-17)

- `BranchOrder` + líneas (`logistics.branch_order`, migración `AddBranchOrders`, FK `transfer.branch_order_id`). `Draft → Submitted → Approved → PartiallyFulfilled | Fulfilled`; `Rejected` con motivo; la sucursal cancela en `Draft` o `Submitted`.
- RN-20: solo sucursales, siempre a la Planta activa (D-01: una sola Planta; el pedido no la pide). Fecha requerida no pasada; cantidades en unidad base, enteras en `pza`; solo `FinishedGood` a granel y `Supply` (empaquetado o semiterminado → **422**, D-05). Aprobar exige el origen, una cantidad por línea de 0 a lo solicitado y no todo en 0; crea **un** traspaso en `Draft` ligado con las líneas aprobadas (> 0), sin reservar existencia. El detalle muestra la existencia en la Planta.
- `BranchOrderTransferLinks` reemplaza a `NoTransferLinks` en `ITransferLinks`: editar el traspaso ligado no cambia el destino, no agrega artículos no aprobados ni pasa de lo aprobado (422); cancelarlo cancela el pedido; despacharlo aplica RN-24 (`ShippedQty` por artículo → `Fulfilled` si se despachó todo lo aprobado, si no `PartiallyFulfilled`).
- `GET /branch-orders/suggestion?locationId` (RN-20): artículos con mín/máx en la sucursal; proyectado = existencia + en tránsito + pedidos enviados (solicitado) y aprobados (aprobado − despachado); si proyectado ≤ mínimo sugiere máximo − proyectado, hacia arriba en `pza`.
- Endpoints `/branch-orders` (lista con `tab=ToApprove`, status, locationId, from/to, q), alta, edición, `submit`, `cancel` (`logistics.orders.create`), `approve`, `reject` (`logistics.orders.approve`).
- Sin paquetes nuevos.
- Pruebas: 188 unitarias (+16: artículos permitidos, sugerido, aprobación, RN-24, cancelación, rechazo) y 112 de integración (+6: pedido → traspaso → despacho → recepción → `Fulfilled`; ediciones del traspaso ligado y despacho parcial; cancelar el traspaso cancela el pedido; empaquetado y semiterminado → 422, todo en cero, rechazo; sugerido; alcance de la sucursal).

### B-18 (2026-10-17)

- Esquema `sales`, migración `AddCustomersAndCustomerOrders`: `Customer` (código único, fijo al crearse, en mayúsculas; RFC opcional con `TaxIdRules`, único salvo genéricos con índice parcial), `CustomerDeliveryPoint`, `CustomerItem` (solo `FinishedGood` empaquetado activo, una vez por cliente; clave del cliente y precio informativo opcional, D-06) y `CustomerOrder` + líneas.
- RN-80: cliente activo; punto de entrega opcional del mismo cliente y activo; fecha requerida no pasada (también al confirmar); al menos una línea; solo empaquetados activos sin repetir (granel u otros → **422**, D-05); enteras en `pza`. Lo surte la Planta activa (D-01) y toda acción exige la Planta en el alcance. El precio vacío toma el del artículo del cliente.
- Estados: `Draft → Confirmed` (ya no se edita), `Cancelled` desde `Draft` o `Confirmed` sin remisionado, `Closed` con motivo solo desde `PartiallyShipped` (se alcanza con las remisiones de B-19).
- Endpoints `/customers` (lista con q por código, nombre o RFC; lookup; delivery-points; items, edición por fila `PUT /customers/{id}/items/{customerItemId}`) y `/customer-orders` (pestañas `tab=ToFulfill|Drafts`, customerId, status, from/to, q por folio, referencia o cliente; avance %; `confirm`, `cancel`, `close`). Permisos `sales.view`, `sales.customers.manage`, `sales.orders.manage`.
- Sin paquetes nuevos.
- Pruebas: 198 unitarias (+10: código, RFC opcional, artículos vendibles, transiciones del pedido) y 117 de integración (+5: código y RFC únicos con genéricos, puntos de entrega y artículos, pedido con granel → 422, precio por omisión, confirmado no editable, cliente inactivo, permisos de Ventas, Almacén y sucursal).

### B-19 (2026-10-17)

- `CustomerShipment` + líneas + lotes por línea (`sales.customer_shipment*`, migración `AddCustomerShipments`; folio `RM`). `Draft → Dispatched`; `Cancelled` solo en `Draft`; una despachada no se edita ni se cancela.
- RN-81: `POST /customer-orders/{id}/shipments` crea el borrador con el saldo de cada línea de un pedido `Confirmed` o `PartiallyShipped` (sin saldo → 422). Varias remisiones por pedido. `PUT /customer-shipments/{id}` cambia notas y cantidades (0 omite la línea; enteras en `pza`; máximo saldo + tolerancia).
- Despacho (§5.2): reclama remisión (versión del cliente) y pedido (versión leída) en la primera escritura, de modo que un despacho simultáneo de la misma remisión o de otra del mismo pedido responde 409; `PostAsync` con `CustomerShipment` negativo en la Planta con lotes elegidos (deben sumar la línea) o FEFO; vencidos rechazados (422) y faltantes con `insufficient_stock` (409) sin registrar nada; costo promedio vigente por línea y lotes tomados en `CustomerShipmentLineLot`.
- RN-82 en `CustomerOrder.RegisterShipment`: lo remisionado por línea no excede lo pedido × (1 + `sales.shipment_tolerance_pct`/100); todas completas → `Shipped`, si no `PartiallyShipped` (y ya se puede cerrar con saldo). El detalle del pedido lista sus remisiones.
- Endpoints `/customer-shipments` (pestaña `tab=ToDispatch`, status, customerId, customerOrderId, from/to, q), detalle con saldo, máximo, lotes, costo y quién recibe; `dispatch`, `cancel`. Permisos `sales.view` y `sales.shipments.dispatch`. RN-83: documento de entrega, sin factura ni cuenta por cobrar.
- Sin paquetes nuevos.
- Pruebas: 204 unitarias (+6: avance del pedido, tolerancia, borrador y líneas en cero, lotes elegidos, cancelación) y 123 de integración (+6: pedido → remisión parcial FEFO → lote vencido rechazado → final → `Shipped` con kardex y lotes; tolerancia; cierre con saldo; despachos simultáneos; sin existencia y cancelación; permisos de Almacén y Ventas).

### B-20 (2026-10-17)

- `ProductionPlanCalculator` (dominio, puro): neto acumulado por producto y día (RN-70). La existencia cubre primero los días más próximos; una OP abierta cubre desde su `ScheduledDate` (las anteriores al rango desde el primer día, las posteriores nunca); lo sugerido cuenta como cubierto para los días siguientes; redondeo hacia arriba al `ProductionMultiple` y a entero en `pza`. Demanda vencida (fecha anterior al rango) cuenta el primer día.
- **Reposición a stock (interpretación):** si la existencia proyectada al final del rango (después de pedidos y sugeridos) queda debajo de `MinQty`, el primer día se reserva `MaxQty` como stock objetivo (`stockReplenishment = MaxQty`), de modo que el plan termina con el máximo en existencia. Ej.: existencia 30, pedido 25, mín 10, máx 50 → por producir 20 + 25 → termina con 50.
- `IDemandSource` ×3 (backend §6): `BranchOrderDemandSource` (`Submitted` solicitado; `Approved` aprobado − despachado), `CustomerOrderDemandSource` (`Confirmed`/`PartiallyShipped` cantidad − remisionado), `ParentOrderDemandSource` (semiterminados: RN-11 sobre lo pendiente de OP abiertas, proporcional a `TheoreticalQty`). Consultas agregadas y cálculo en memoria; existencia utilizable sin vencidos.
- `GET /production-plan?locationId&from&to&areaId&q` (`production.view`; solo la Planta; desde hoy, 1–31 días; por omisión hoy + `production.plan_default_days`): renglones por (producto, día) con demanda desglosada, existencia al inicio del día, OP pendientes, por producir, receta activa y líneas de pedido origen. Orden fecha, área, SKU.
- `POST /production-plan/generate` (`production.orders.manage`, RN-71): una OP `Draft` por (producto, fecha, área, turno) con `Source = Plan` vía `CreateManyInTransactionAsync`; liga `ProductionOrderDemand` (`production.production_order_demand`, migración `AddProductionOrderDemand`) a las líneas de pedido indicadas o, si no se indican, a las pendientes del producto hasta esa fecha, repartiendo la cantidad por `RequiredDate`. Las OP padre nunca se ligan. Todo o nada (sin receta activa → 422; línea ajena → 400). RN-72: las ligas no reservan; el detalle de la OP muestra los pedidos que atiende (`demands`).
- Sin paquetes nuevos.
- Pruebas: 214 unitarias (+10 del calculador: cobertura acumulada, múltiplo, OP posterior no cubre días anteriores, demanda vencida, fuera de rango, piezas, reposición a stock, OP padre) y 128 de integración (+5: pedidos de sucursal y cliente + mín/máx → plan → generar → OP ligadas y plan cubierto; demanda de semiterminado por OP padre; todo o nada; alcance y permisos; rendimiento 300 productos, 7 días, 500 líneas y 300 OP < 1 s con `Category=Performance`).

### B-27 (2026-10-17)

- **D-03:** la tolerancia de sobreproducción ya no bloquea; `EnsureCanClose` devuelve si el cierre la excede y queda en `ProductionClose.ExceedsTolerance`; la vista previa, el cierre, la lista de cierres y la OP exponen `exceedsTolerance`.
- **D-05:** `BranchOrderRules.IsOrderable` = `FinishedGood` (granel o empaquetado) o `Supply`; `CustomerRules.IsSellable` = `FinishedGood`. Semiterminados y materias primas siguen dando 422.
- **D-07:** `Item.MatrixCode` opcional (mayúsculas, forma de SKU, único con índice parcial y nunca igual a otro SKU); en API, búsqueda y CSV de artículos (columna `codigo_matriz`; un archivo sin la columna conserva los códigos). La importación de OP acepta en `sku` el SKU o el código de la Matriz (el SKU gana si chocan); la plantilla lo indica.
- **D-08:** `AdjustmentReason.CustomerReturn`: solo entradas; por línea `wasteQty` (≤ devuelto) y `wasteReason` (`Waste`, `Expired`, `Damaged`); la merma se registra después de la entrada, del mismo lote, como movimiento `Waste`.
- **RN-32:** cerrar con saldo una OC exige motivo (`POST /purchase-orders/{id}/close` con `{ version, reason }`; `CloseReason` en el detalle).
- **Cliente:** `PUT /customers/{id}` recibe `code` y lo cambia si sigue siendo único.
- **RN-34:** la requisición acepta artículos repetidos; cada renglón repetido (después del primero) exige `notes`; la conversión hace una línea de OC por renglón.
- Migración `ApplyClientDecisions` (columnas `exceeds_tolerance`, `matrix_code` + índice, `waste_qty`, `waste_reason`, `close_reason`, `notes` de línea de requisición). `dominio.md` §4 y §5 actualizados (RN-20, RN-32, RN-34, RN-63, RN-80, RN-90, ajustes, cliente, artículo).
- Sin paquetes nuevos.
- Pruebas: 219 unitarias (+5 netas: tolerancia marcada, artículos permitidos, devolución con merma, código de la Matriz) y 132 de integración (+4: importación por código de la Matriz, devolución con merma en kardex, código de cliente editable, requisición con artículo repetido y nota; ajustadas las que esperaban el bloqueo de tolerancia y las restricciones de presentación).

### Ajuste de D-07 (2026-10-17)

- A pedido del usuario: el "código de la Matriz" se renombra a **código interno** (`Item.InternalCode`, API `internalCode`, columna `internal_code` con migración `RenameMatrixCodeToInternalCode` que renombra sin perder datos; CSV `codigo_interno`). Solo debe ser único entre artículos (se quitó la regla de no chocar con SKU).
- La importación de OP identifica el producto **solo** por el código interno: la columna de la plantilla es `codigo_interno` (antes `sku`) y el SKU del sistema ya no se acepta. Un artículo sin código interno no puede importarse.
- CSV de artículos: un renglón sin código interno (o un archivo sin la columna) se **omite** y el resultado (`ItemImportResult.skipped`) dice el renglón y el motivo; los demás se importan. Los errores de los renglones restantes siguen siendo todo o nada.
- Pruebas: 219 unitarias y 133 de integración (+1: renglones omitidos sin código interno; la importación de OP rechaza el SKU del sistema). `TestData.CreateItemAsync` asigna `INT-{sku}` a los artículos de prueba.

### Ajuste 2 de D-07 (2026-10-17)

- El código interno pasa a llamarse **SKU interno** (`Item.InternalSku`, API `internalSku`, columna `internal_sku`, CSV y plantilla de OP `sku_interno`; textos "SKU interno") y es **obligatorio y único** en el catálogo: alta y edición por API lo exigen (400 en `internalSku` si falta o se repite); en `ItemDefinition`, `CreateItemRequest` y `UpdateItemRequest` va justo después de `Sku`.
- Migración `RequireInternalSku` escrita a mano: renombra la columna (sin perder datos), rellena con el SKU del sistema los artículos que no tenían uno, la vuelve `NOT NULL` e índice único sin filtro.
- CSV de artículos: el renglón sin SKU interno se sigue omitiendo con su motivo. Importación de OP: solo `sku_interno`.
- Pruebas: 219 unitarias y 133 de integración (alta sin SKU interno o repetido → 400).

### B-26a (2026-10-17)

- `LocationType.Warehouse` con `ParentLocationId` (migración `AddSubWarehouses`); `Location.Warehouse(code, name, parent)`: el padre es una planta o sucursal activa, nunca otro subalmacén. `POST /locations` con `type = Warehouse` y `parentLocationId`; no se agregan subalmacenes a una ubicación con existencia ni se desactiva un subalmacén con existencia (RN-44, 422). `GET /locations/{id}/warehouses` (con `canMoveStock`); `GET /locations/lookup` ya no lista subalmacenes; la lista filtra por `parentLocationId`.
- RN-44 en el motor: `IInventoryPostingService` rechaza movimientos en una ubicación con subalmacenes activos (`location_has_warehouses`, 422).
- Alcance (RN-40): `UserAccess.StockLocationIds` y `ILocationScope.AllowedStockLocationIds` / `EnsureStockAccess`. Una planta o sucursal asignada trae sus subalmacenes; un subalmacén asignado mueve solo ese y ve a su padre. Ajustes, conteos, consumo (sucursal o subalmacén de sucursal) y existencias iniciales exigen acceso de inventario; las consultas de existencias, lotes y kardex leen las ubicaciones de inventario del alcance y, por una ubicación con subalmacenes, sus subalmacenes (con saldo corrido sumado en el kardex).
- Los traspasos rechazan subalmacenes hasta B-26b/B-26c. **Pendiente para B-26c:** semilla de los 4 subalmacenes de la Planta (no se siembran aún para no romper los procesos que postean en PLANTA). **Pendiente para B-26d:** alertas de mínimo con la existencia de los subalmacenes.
- Sin paquetes nuevos.
- Pruebas: 221 unitarias (+2: reglas del subalmacén) y 137 de integración (+4: existencia en subalmacenes y consultas por la sucursal, reglas de alta y baja, usuario de un solo subalmacén, traspasos sin subalmacenes).

### B-26b (2026-10-17)

- El vale interno es un **documento** (folio `VI`, estados, líneas, bitácora) que genera los **movimientos** del kardex, como todo documento del sistema (RN-01): `TransferOut` al enviar en el subalmacén origen y `TransferIn` al recibir en el destino, con el mismo lote y costo; el faltante queda como pérdida en tránsito con motivo.
- Implementado como `Transfer.Kind = Internal` (migración `AddInternalTransfers`: columna `kind`, existentes `Standard`; secuencia `inventory.internal_transfer_folio_seq`). Origen y destino: dos subalmacenes activos distintos de la misma planta o sucursal (`internal_transfer_route`, 422). Sin vehículo ni chofer. Movimientos con `SourceDocType = InternalTransfer` y nota "Vale VI-…". Nunca sirve a un pedido de sucursal.
- Endpoints `/internal-transfers` (lista, detalle, alta, edición, `dispatch` con `{ version, lines? }`, `receive`, `cancel`): ver con `inventory.view`, operar con el permiso nuevo `inventory.internal_transfers` (Almacén planta por módulo de inventario y Encargado de sucursal). Crear, editar, enviar y cancelar exigen el subalmacén origen; recibir, el destino. Los endpoints de traspasos no ven vales y viceversa (404).
- Sin paquetes nuevos.
- Pruebas: 222 unitarias (+1) y 140 de integración (+3: vale con lote, tránsito, recepción con diferencia, kardex con costo; rutas inválidas, sin existencia y cancelación; alcance origen/destino y permiso). `AdministrationTests` ajustada: el rol de prueba que asigna "Encargado de sucursal" necesita también el permiso nuevo (anti-escalamiento, RN-43).

### B-26c (2026-10-17)

- `WarehousePicker` (RN-45): por línea, el subalmacén de la línea o el del documento; una ubicación sin subalmacenes postea en sí misma (y rechaza un subalmacén ajeno); con subalmacenes, el subalmacén es obligatorio (`warehouse_required`, 422), debe ser un subalmacén activo de esa ubicación (`warehouse_not_of_location`, 422) y estar en el alcance de inventario (403).
- Recepción de compra: `warehouseId` en el encabezado y por línea; `GoodsReceiptLine.LocationId`. Cierre de OP: `consumptionWarehouseId` (encabezado), `warehouseId` por componente y `outputWarehouseId`; `ProductionCloseLine.LocationId` y `ProductionClose.OutputLocationId`; FEFO y costo promedio del subalmacén de cada componente. Traspaso: `fromWarehouseId` (+ por línea) al despachar y `toWarehouseId` (+ por línea) al recibir; `TransferLine.FromStockLocationId` / `ToStockLocationId`. Remisión: `fromWarehouseId` (+ por línea); `CustomerShipmentLine.LocationId`. Los vales internos no cambian (su origen y destino ya son subalmacenes). Los DTO muestran el código del subalmacén por línea.
- Migración `ProcessesChooseWarehouse` con relleno: los documentos anteriores quedan con su propia ubicación como ubicación de inventario.
- Semilla: opción `Seed:PlantWarehouses` (por omisión **activa**) crea los 4 subalmacenes de la Planta (`PLANTA-MP`, `PLANTA-INS`, `PLANTA-SEMI`, `PLANTA-PT`) solo si no tiene subalmacenes ni existencia. Las pruebas de integración la desactivan: la Planta compartida sigue sin subalmacenes (cubre ese caso) y las pruebas de RN-44..RN-47 crean su propia planta o sucursal. **Atención:** una BD de desarrollo con existencia en PLANTA no recibe los subalmacenes (RN-44); en una BD nueva sí, y entonces todo proceso de la Planta debe indicar subalmacén.
- Sin paquetes nuevos.
- Pruebas: 222 unitarias y 144 de integración (+4: recepción con MP e insumos y errores de subalmacén; cierre que consume de MP y semiterminados y deja en terminado; traspaso de PT a la vitrina de una sucursal; remisión desde PT). La siembra con la opción activa no tiene prueba automática (sembraría la Planta compartida).

### B-26d (2026-10-17)

- `InventoryLocations.WithWarehousesAsync`: la ubicación más sus subalmacenes (RN-46). La usan `RecipeService.UsableStockAsync` (plan de producción, disponibilidad de la OP, vista previa de cierre, explosión de receta y, en B-21, requerimiento de MP), el sugerido de pedidos de sucursal y la existencia en la Planta al aprobar un pedido.
- Existencias: el renglón de una planta o sucursal (donde viven el mín/máx) suma su existencia y la de sus subalmacenes; costo promedio = valor / existencia y valor = Σ cantidad × costo de cada subalmacén; los renglones de cada subalmacén siguen apareciendo. Las alertas de mínimo suman los subalmacenes.
- Conteo físico: en una ubicación con subalmacenes se hace por subalmacén (`location_has_warehouses`, 422 al crearlo).
- Sin migración ni paquetes nuevos.
- Pruebas: 222 unitarias y 146 de integración (+2: existencia, mínimo, alerta, plan y disponibilidad de OP con la existencia repartida en dos subalmacenes de una planta; conteo por subalmacén; sugerido de una sucursal con dos subalmacenes). Rendimiento del plan < 1 s sigue en verde.

**B-26 (subalmacenes) completa.**

### B-21 (2026-10-17)

- `MaterialRequirementService` (RN-50): para la Planta, las OP `Draft`, `Released` e `InProgress` con `ScheduledDate` hasta la fecha elegida (hoy + 7 por omisión). Requerido por componente = RN-11 sobre lo pendiente de producir de cada OP (proporcional a `TheoreticalQty`); faltante = requerido + `MinQty` − existencia utilizable (sin vencidos, con subalmacenes) − en camino (saldo de OC no finales + requisiciones `Draft`, `Submitted` o `Approved`, en unidad base), nunca negativo. `RawMaterial` y `Supply` faltantes → **por comprar** con unidades de compra completas hacia arriba y su proveedor preferido; `SemiFinished` faltante → **por producir** (D-04); el resto, **cubierto**. Cada renglón lista las OP que lo originan.
- `GET /material-requirements?locationId&to` (`purchasing.view` o `production.view`; solo la Planta). `POST /requisitions/suggested` (`purchasing.requisitions.manage`; `{ locationId, to?, neededBy?, itemIds? }`): una requisición normal en `Draft` con lo por comprar (o solo los artículos indicados), proveedor preferido y fecha requerida = la más próxima de sus OP (hoy como mínimo); sin nada por comprar → 422 `nothing_to_buy`. **Cierra el pendiente de B-15.**
- Sin migración ni paquetes nuevos.
- Pruebas: 230 unitarias (+8: faltante y redondeo a unidades de compra) y 148 de integración (+2: faltante con mínimo, existencia y OC en camino → 1 bulto, semiterminado por producir, insumo cubierto, OP fuera del horizonte, requisición sugerida que luego cuenta como en camino; permisos y solo Planta).

**Fase 4 del backend completa** (B-17..B-21, más B-26 y B-27 por las decisiones del cliente).

## Pendientes y decisiones abiertas

- D-01..D-09 decididas el 2026-10-17 (dominio §8); retrabajo en B-27 y B-26. D-10 abierta (no bloquea: semilla y capacitación).
- D-11 (trazabilidad: qué roles la consultan y si las sucursales ven la cadena completa) abierta con propuesta en `docs/specs/trazabilidad.md` §8; se registra en `dominio.md` §8 al hacer B-28.
- `docs/specs/trazabilidad.md` numeraba sus tareas B-26 y F-25, que ya existían (subalmacenes y vales internos): se renumeraron a **B-28** y **F-26** (los siguientes consecutivos), a pedido del usuario. D-11, RN-100..RN-109 y la E2E 17 no chocan con nada.
- Falta la lista real de sucursales para `deploy/seed/locations.csv` (D-01).

### F-01 (2026-10-17)

- Proyecto `frontend/` con `ng new` (Angular 22.2, standalone, zoneless, sin SSR, Vitest + jsdom). Carpetas `core/`, `shared/`, `features/` (vacías con `.gitkeep` hasta su tarea) y `styles/`.
- Tema Material 3 (`styles/_theme.scss`): base `theme-type: color-scheme` con paleta **verde** (decisión del usuario: el claro no va en azules) y paleta azure para el oscuro, aplicada con `html[data-theme='dark']` o, sin atributo, con `prefers-color-scheme: dark`. Tokens `--pan-*` con `light-dark()` en `styles/_tokens.scss`.
- `ThemeService` (`core/theme`): Claro / Oscuro / Según el sistema (default), `localStorage` `pan.theme` (sistema = sin clave), `html[data-theme]`; script en `index.html` lo aplica antes del arranque (sin destello). 4 pruebas.
- Locale `es-MX` (`LOCALE_ID`, `MAT_DATE_LOCALE`), Roboto local (`@fontsource/roboto` 400/500/700), `provideHttpClient(withFetch())`, environments con `apiBaseUrl: '/api/v1'`, `proxy.conf.mjs` (`/api` y `/health` a `PAN_API_URL`, default 8090).
- Íconos: `npm run icons` busca los íconos en `src/` (`<mat-icon>`, `fontIcon=`, `icon: '...'`, sin comentarios) y genera `public/fonts/material-symbols.woff2` con `scripts/subset-material-symbols.py` (fonttools + brotli; instancia FILL 0/wght 400/opsz 24 y conserva las ligaduras `rlig` de Material Symbols; 5 íconos ≈ 2 KB). `npm run icons:check` (parte de `lint`) falla si se usa un ícono fuera del subconjunto.
- Shell provisional (`core/layout/shell`): barra superior con marca y menú de tema; página "Inicio" provisional. F-03 agrega menú lateral, ubicación activa, usuario y migas.
- `npm run lint` = ESLint (angular-eslint) + `icons:check` + Prettier.
- `frontend/Dockerfile` (node:24-alpine → caddy:2-alpine en `/srv`) con `frontend/Caddyfile` propio; `deploy/Caddyfile` de producción (proxy `/api` y `/health` a `api:8080`, SPA fallback, caché inmutable para `nombre-HASH.js/css` y `no-cache` para `index.html` y rutas). Verificado con contenedor y `caddy validate`.
- Probado en Chrome: tema oscuro según el sistema, cambio a claro verde sin destello y persistente tras recargar.
- Paquetes nuevos (licencia en la versión instalada): `@angular/material` 22.2.3 MIT, `@angular/cdk` 22.2.3 MIT, `@fontsource/roboto` 5.3.0 OFL-1.1, `material-symbols` 0.48.0 Apache-2.0 (dev), `angular-eslint` 22.6.0 MIT, `eslint` 10.13.0 MIT, `typescript-eslint` 8.71.0 MIT. Scripts de instalación nativos (`esbuild`, `lmdb`, `@parcel/watcher`, `msgpackr-extract`) quedan denegados en npm 11; el build no los necesita.
- Pendiente: `deploy/docker-compose.yml` de producción (con el servicio web) se arma en la tarea de despliegue.

### F-02 (2026-10-17)

- `npm run api:types` (`scripts/api-types.mjs`): `openapi-typescript` desde `PAN_API_URL/openapi/v1.json` → `core/api/schema.d.ts` (versionado, excluido de ESLint). `core/api/api.ts`: `Schemas` y `ApiEnum<K>`.
- `core/http`: `apiBaseInterceptor` (rutas relativas → `/api/v1/...`), `errorInterceptor` (avisos según frontend §6; 400 al formulario, 401 a la sesión; contexto `SILENT_ERRORS` para quien muestra su propio error), `toProblem` (`code`, `errors`, `shortages`, `rowErrors`, `traceId`), `Notifier` (snackbar cargado en diferido para no inflar el bundle inicial). Los diálogos de 409 `concurrency` e `insufficient_stock` llegan en F-03; mientras tanto son avisos con el `detail`.
- `AuthService`: token solo en memoria; al arrancar `POST /auth/refresh` + `GET /me` (la sesión sobrevive a F5); un solo refresh compartido ante 401 concurrentes y serializado entre pestañas con Web Locks (`pan.auth.refresh`); `BroadcastChannel` `pan.auth` cierra la sesión en todas las pestañas; `expire()` manda a `/login?returnUrl=` con aviso. `authInterceptor` reintenta una vez tras renovar.
- Guardas `authGuard`, `guestGuard` y `permissionGuard` (`data.permission`, cadena o lista); directiva `*hasPermission`; `LocationContextService` (`pan.location`, default `DefaultLocationId`, sin subalmacenes, `plant`).
- `shared/forms`: `FormErrors` (400 → controles, incluidas líneas `lines[2].quantity`; lo no mapeable a aviso) y `controlError` (mensajes en español).
- Login con fondo plexus en `canvas` (cuadro fijo con "reducir movimiento"; colores por tema), verdes en claro y neón azul en oscuro, campos nativos en píldora con `aria-describedby`, botón de tema en la esquina; `returnUrl` solo acepta rutas propias. `/perfil` (datos y cambio de contraseña, cierra sesión con aviso), `/sin-acceso`, y página "en construcción" para las rutas del menú aún sin pantalla.
- Shell: menú lateral filtrado por permisos (`core/layout/navigation.ts`, rutas y permisos de frontend §7), selector de ubicación activa (oculto con una sola), menú de usuario (Mi perfil, Tema, Cerrar sesión). El diseño final (etiqueta, colapso, migas) es de F-03. El shell se carga en diferido: bundle inicial 399 kB.
- Script de íconos: ahora resuelve cada nombre por la ligadura de la fuente (los alias como `location_on` comparten glifo con otro nombre). 41 íconos ≈ 6.7 KB.
- 31 pruebas unitarias (refresh único ante 401 concurrentes, expiración, guardas, `*hasPermission`, `FormErrors`, avisos por estado, ubicación activa, menú filtrado, `returnUrl`).
- Probado en Chrome contra una API local con BD desechable: credenciales inválidas muestran el mensaje del backend; login regresa al `returnUrl`; F5 y dos pestañas mantienen la sesión; cerrar sesión en una pestaña cierra la otra; el encargado de sucursal ve solo General, Inventario y Logística, sin selector de ubicación.
- Paquete nuevo: `openapi-typescript` 7.13.0 MIT (dev). Su peer pide TypeScript 5; se usa con el TypeScript 6 del proyecto mediante `overrides` en `package.json` (generación verificada).
- Vales internos (B-26b): el usuario decidió hacerlos en la siguiente fase; quedaron como **F-25** en la Fase 2 de `frontend.md` §11 y su pantalla en §7.3.

### F-03 (2026-10-17)

- Estilos (`styles/`): `_ui` (tarjetas, campos de Material en píldora rellena sin línea inferior —12 px dentro de `.pan-capture`—, botón principal con sombra, secundario tonal en píldora, pestañas con subrayado de 3 px, barra de acción fija en celular `.pan-action-bar`, skeleton, `pan-sr-only`), `_dark` (primario #4F86FF con texto negro), `_nav-tag` (menú con "etiqueta" solo CSS: barra inclinada con resplandor radial, bloque tras el ícono y tres cuadritos en la página actual; contraído solo el bloque), tokens `--pan-row-*`, `--pan-pill-*`, `--pan-sidebar-*`, `--pan-nav-*` y colores de estado con variante oscura.
- Layout: menú lateral propio (sin capas de Material) colapsable en escritorio (`localStorage` `pan.sidebar`, tooltips al estar contraído) y drawer en celular (< 768 px); `BreadcrumbsService` (migas desde `data.breadcrumb`, `setCurrent(folio)` para detalles). Todo lo que está detrás del login se carga en diferido (`core/layout/shell.routes.ts`, con los providers de fechas, paginador y campos): bundle inicial 372 kB.
- Formatos: pipes `qty` (es-MX, hasta 4 decimales, `pza` entero), `mxn` y `statusLabel`; `ENUM_LABELS` cubre **todos** los enums del OpenAPI y está tipado: un enum o valor nuevo sin etiqueta rompe la compilación tras `npm run api:types`. Colores de estado de frontend §4.2. `EsMxDateAdapter` (`dd/MM/yyyy`) y paginador en español.
- Componentes (`shared/components`): `page-header`, `data-table` (columnas `appCell`, `appCardDef`, `appRowDetail`; orden y paginado en servidor con `ListQuery`; selección conservada entre páginas; skeleton; vacío con contenido `[empty]`; tarjetas en celular), `status-tag`, `lookup-picker` (genérico) e `item-picker` (lo extiende con `/items/lookup`; la foto llega en F-23), `location-picker`, `qty-input` (valida número, > 0 o ≥ 0, máximo y decimales en el control padre), `lines-editor` (`appLineColumn`, `minLinesValidator`, `uniqueLinesValidator`, Enter pasa a la siguiente cantidad, tarjetas en celular), `confirm-summary` (`ConfirmService`), `reason-dialog` (`ReasonService`), `stamp`, y los diálogos de 409 (`ConflictHandler`, cargados en diferido; el interceptor los abre en lugar del aviso). Las plantillas se tipan con `[appCellOf]`, `[appRowDetailOf]`, `[appCardDefOf]` y `[appLineColumnOf]`.
- Los campos compartidos se enlazan al control del padre (`bindParentControl`), muestran su error y se repintan con `control.events` (errores 400 del servidor, `markAllAsTouched`). MatInput y MatSelect llevan un control interno para que su estado de error funcione.
- Script de íconos: detecta también nombres entre comillas dentro de interpolaciones (`{{ abierto ? 'expand_less' : 'expand_more' }}`); 49 íconos.
- `/demo/componentes` [settings.manage] con todos los componentes y datos de ejemplo. Revisada en Chrome en claro y oscuro, escritorio y 390 px (sin scroll horizontal; drawer, tarjetas y barra de acción fija).
- 58 pruebas unitarias (formatos y etiquetas, adaptador de fechas, migas, `qty-input`, `lookup-picker`, `lines-editor`, `data-table`, conflictos 409 en el interceptor, más las de F-01/F-02). Sin paquetes nuevos.
- Pendientes para tareas posteriores: `app-item-photo` (F-23) y existencia en `item-picker`; `app-audit-panel`, `app-progress-meter`, `app-stock-level`, `app-csv-import`, `app-xlsx-import`, `app-shift-select` y `lot-split` llegan con las tareas que los usan (no estaban en el alcance de F-03).

### F-04 (2026-10-17)

- `features/admin` (`admin.routes.ts`, carga diferida bajo `/admin`; cada ruta con su permiso): usuarios (lista con búsqueda, estado y rol; alta con contraseña temporal y generador; edición de nombre, roles, ubicaciones y ubicación default; activar/desactivar con confirmación; restablecer contraseña en diálogo con generador y copiar), roles (lista y matriz de permisos por módulo con casilla por módulo; Administrador de solo lectura), bitácora (filtros por entidad, usuario y fechas; detalle con campo, antes y después) y configuración (formulario armado desde `/settings` con límites y decimales; guarda solo lo cambiado con su versión).
- Compartidos nuevos: `app-audit-panel` (historial de un registro, 10 y "Ver más"; en el detalle de usuario y de rol si hay `security.audit.view`), `shared/data-access/audit.ts` (etiquetas de entidades y campos, oculta los campos internos de Identity), generador y política de contraseñas (`shared/forms/password.ts`, 10+ con mayúscula, minúscula y número, sin caracteres confundibles), `requiredList(mensaje)`. `app-status-tag` acepta texto y color propios (estado de usuario). Las migas de una ruta agrupadora sin página propia (`/admin`) ya no son enlace. `guestGuard` respeta `returnUrl` si ya hay sesión.
- Backend (B-04, ajuste): `GET /roles` también con `security.users.manage` y `/locations/lookup` también con `security.users.manage`, para que quien administra usuarios pueda llenar su formulario (crear o editar roles sigue requiriendo `security.roles.manage`). Prueba de integración en `AdministrationTests`. `appsettings.Development.json`: `RateLimiting:LoginPermitLimit = 60` solo en desarrollo (producción sigue en 10 por minuto), para que la suite E2E no choque con el límite.
- E2E (Playwright, frontend §9): `playwright.config.ts` con proyectos escritorio y celular (390 px) sobre el Chrome instalado (sin descargar navegadores), `npm run e2e`. **E2E 1 en verde (8/8):** credenciales inválidas, menú completo del admin, el encargado de sucursal solo ve General, Inventario y Logística y `/admin/usuarios` lo manda a `/sin-acceso`, la sesión sobrevive a recargar. Prepara el usuario `e2e.encargado@panissimo.test` por API (lo crea o le renueva la contraseña temporal); no mueve inventario.
- Corregido al probar en Chrome: un `<form (ngSubmit)>` sin `[formGroup]` recargaba la página en vez de guardar (configuración, diálogo de motivo y de contraseña); ahora todos llevan su directiva.
- Pruebas: 66 unitarias en verde. Aparte se corrigieron 18 archivos de pruebas de integración que calculaban "hoy" en UTC: después de las 18:00 en México fallaban dos (FEFO con lote "vencido" y plan con fecha pasada); ahora usan `ApiFactory.Today` (fecha de negocio de la Ciudad de México, igual que el servidor). Backend: 230 unitarias y 148 de integración en verde.
- Paquete nuevo: `@playwright/test` 1.64.1 Apache-2.0 (dev; trae `playwright-core` 1.64.1 Apache-2.0).

### F-05 (2026-10-17)

- `features/catalog` (`/catalogos`, carga diferida) y `features/production` (por ahora solo `/produccion/areas`): ubicaciones (filtros por tipo y activas; alta de planta, sucursal o subalmacén con su ubicación padre; edición de nombre, dirección y activa), categorías, unidades de medida (el código no cambia), áreas de producción (código, nombre, orden, activa; editar con `production.areas.manage`). Las cuatro usan un diálogo genérico `app-record-dialog` armado por campos (visibilidad condicional, códigos en mayúsculas, errores 400 en su campo sin cerrar).
- Artículos: lista con búsqueda y filtros (tipo, presentación, categoría, área, inactivos); formulario con los campos que aplican según el tipo (presentación solo en terminados, versión a granel y piezas solo en empaquetados, área solo en semiterminados y terminados; al cambiar el tipo se limpian los que dejan de aplicar), unidad y factor de compra, lotes, vida útil, almacenamiento, IVA 0/16 %, múltiplo de OP y gramaje; pestañas **Mín/Máx por ubicación** (guardado propio, máx ≥ mín), **Versiones empaquetadas** (si es granel, con "Nueva versión empaquetada" que abre el alta prellenada con `?granel=`) e **Historial**. Solo lectura sin `catalog.manage`. La pestaña Foto llega en F-23.
- Importación CSV (`/catalogos/articulos/importar`): componente compartido `app-csv-import` (plantilla con BOM generada en el navegador, guía de valores, vista previa de 20 filas, aviso de columnas desconocidas, tabla de errores por fila del 400 `import_invalid`); la página muestra creados, actualizados y filas omitidas (sin `sku_interno`). Lector CSV RFC 4180 en `shared/data-access/csv.ts` (`,` o `;`, comillas, saltos de línea dentro de comillas).
- Global: `input.pan-uppercase` (MDC anulaba `text-transform` en el input).
- Probado en Chrome: alta de categoría; alta de granel con validación de presentación; desde su pestaña, alta de la versión empaquetada prellenada y ligada; mín/máx con error de máx < mín y guardado.
- **E2E 2 en verde** (escritorio y 390 px; suite completa 12/12): archivo con errores (tipo inválido, categoría inexistente, presentación en materia prima) no guarda nada y muestra los errores; archivo válido da de alta (o actualiza) `E2E-GRANEL` y `E2E-PAQ` ligado, que aparece en "Versiones empaquetadas". Crea la categoría `E2E` si falta; no mueve inventario.
- Pruebas: 75 unitarias en verde (CSV, diálogo de registro, reglas del formulario de artículo y prellenado del empaquetado). Sin paquetes nuevos.

### F-06 (2026-10-17)

- `features/inventory` (`/inventario`, carga diferida): **Existencias** de la ubicación activa (renglón total de la planta o sucursal y uno por subalmacén, RN-46; costo promedio, valor y `app-stock-level`; lotes al expandir con vencidos en rojo; "Solo bajo mínimo"; sección "Lotes por caducar" de `/alerts`; enlace al kardex por artículo y ubicación), **Kardex** (filtros por ubicación —las del usuario y los subalmacenes de la activa—, artículo, tipo y fechas; saldo corrido con ubicación y artículo; folio con enlace al documento; usuario), **Ajustes** (lista por motivo y fechas; alta; detalle con líneas, movimientos registrados con lote y costo, e historial) y **Existencias iniciales** (CSV con `app-csv-import`; muestra los folios de los ajustes de corrección).
- Alta de ajuste: la ubicación es la activa y, si tiene subalmacenes, se elige uno (RN-45). Por motivo: corrección elige entrada o salida por línea; merma, caducado, dañado y uso interno solo salidas (se capturan en positivo y se envían negativas); devolución de cliente solo entradas, con merma opcional y su motivo (D-08). Entradas con lote y caducidad (artículos con lote) y costo opcional; salidas con lote elegido (`app-lot-select`, con existencia y caducidad) o automático FEFO, sin costo. Confirmación con resumen; el 409 de existencia insuficiente abre el diálogo de faltantes y el formulario se conserva.
- Compartidos: `app-stock-level` (nivel en palabras y barra, rango para lector de pantalla), `shared/data-access/document-links.ts` (ruta por tipo de documento; solo enlaza las pantallas ya construidas), `shared/data-access/item-lookup.ts` (búsqueda y artículo por id; ahora lo usa `app-item-picker`), `shared/forms/dates.ts` (fecha `yyyy-MM-dd` local e inicio/fin de día; también lo usa la bitácora).
- **Backend corregido (B-26d):** las listas de ajustes, conteos y consumos filtraban la ubicación exacta, así que una planta no mostraba lo registrado en sus subalmacenes; ahora incluyen los subalmacenes (prueba de integración nueva en `WarehouseTotalsTests`). Commit aparte.
- Probado en Chrome: existencias iniciales con error (artículo sin lotes) y válida (AJ-000001 en PLANTA-PT para `E2E-GRANEL`, lotes L-A y L-B), existencias con lotes y "por caducar", kardex con saldo corrido y folio enlazado, ajuste de merma sin existencia con diálogo de faltantes, lista y detalle del ajuste.
- **E2E 3 en verde** (suite completa 14/14, escritorio y 390 px): ajuste de merma de `E2E-SIN-EXISTENCIA` (lo crea por API si falta, nunca tiene existencia) en el subalmacén de producto terminado → diálogo "Existencia insuficiente" con lo que falta; no se guarda nada.
- Pruebas: 83 unitarias (signo y lote del ajuste, subalmacén obligatorio, nivel de existencia, textos de caducidad, enlaces a documentos). Backend: 230 unitarias y 149 de integración. Sin paquetes nuevos.
- Datos de prueba en la BD de desarrollo: AJ-000001 (existencia inicial de `E2E-GRANEL` en PLANTA-PT) y el artículo `E2E-SIN-EXISTENCIA`.

### Marca (2026-10-17)

- Por indicación del usuario: `ico.png` como favicon y `logo.png` como logo del login y título de la barra superior. Los originales (varios MB) quedan en la raíz del repositorio; `frontend/scripts/brand-assets.py` (Pillow, MIT-CMU, herramienta local) genera `public/favicon.ico` (16-64 px, el ícono ancho se completa a cuadrado con su color de fondo), `public/brand/icon-180.png` e `icon-192.png` (apple-touch y PWA) y los logos en WebP (`logo-bar.webp` 4.6 KB para la barra de 48 px, `logo.webp` 66 KB para el login). Revisado en Chrome en claro y oscuro.

### F-07 (2026-10-17)

- **Conteos** (`/inventario/conteos`, `/:id`, RN-06): lista de la ubicación activa por estado y alta en diálogo (subalmacén si la ubicación los tiene, categoría opcional para un conteo parcial, notas). Detalle por estado: borrador (iniciar con confirmación, cancelar), **en curso** con captura a ciegas por tarjetas (no se muestra la existencia esperada), buscador fijo, filtros Todas/Pendientes/Contadas con su número, Enter pasa a la siguiente cantidad, "Agregar artículo" (artículo o lote que no estaba; lote nuevo con caducidad) y **revisión de diferencias** (al iniciar, contado, diferencia; "Solo con diferencia"; cerrar deshabilitado con "Faltan N"); cerrado con diferencias y ajustes registrados.
- **Autoguardado** (`ui/count-autosave.ts`): 1 s después de la última tecla, al salir del campo y al ocultar la app (`visibilitychange`); los guardados van en serie, cada uno con la versión que devolvió el anterior; si uno falla conserva las cantidades y ofrece "Reintentar"; al salir de la página guarda lo pendiente. Indicador Sin guardar / Guardando / Guardado.
- **Consumos** (`/inventario/consumos`, `/nuevo`, `/:id`, RN-09): solo con una sucursal como ubicación activa (subalmacén si los tiene); día de hoy o anterior; captura rápida artículo → cantidad → Enter (el mismo artículo sin lote elegido se suma); lote opcional por línea (si no, el que caduca primero); confirmación con resumen; lista por fechas y detalle con los movimientos. Los folios de conteos y consumos del kardex ya enlazan a su pantalla.
- Helper `ui/stock-warehouses.ts` (subalmacenes donde el usuario mueve existencia) para conteos y consumos.
- Probado en Chrome: CF-000001 en PLANTA-PT (categoría E2E): captura 38 y 25 con dos guardados en serie, recarga con lo capturado, revisión (−2 en lote L-A) y cierre con su ajuste de −2.
- **E2E 4 en verde** (solo en 390 px; suite 16/16): conteo nuevo → iniciar → capturar → "Guardado" → recargar conserva → revisar → cancelar, sin scroll horizontal; consumo en la sucursal `SUC-E2E` (la crea si falta) capturando el mismo artículo dos veces (2 + 3 = 5), sin scroll horizontal y sin registrarlo. No mueve inventario.
- Pruebas: 87 unitarias (autoguardado: espera de 1 s, último valor por línea, guardados en serie con versión, reintento). Sin paquetes nuevos.
- Datos de prueba en la BD de desarrollo: CF-000001 cerrado (−2 de `E2E-GRANEL` lote L-A en PLANTA-PT), la sucursal `SUC-E2E` y conteos cancelados de las corridas E2E.

### F-08 (2026-10-17)

- Feature `logistics` (`/logistica/traspasos`): lista con pestañas Por despachar / En tránsito / Recibidos / Todos (en `?tab=`, vuelve a la página 1 al cambiar) de los traspasos que salen o llegan a la ubicación activa, con botón **Recibir** en los que van en tránsito hacia ella.
- **Formulario** (`/nuevo`, `/:id/editar`): origen = ubicación activa (al editar, la del borrador); destino filtrado por ruta RN-25 (`ui/transfer-rules.ts`: sin `logistics.transfers.special` solo Planta → sucursal; nunca a sí misma ni a un subalmacén); líneas con lote planeado opcional; guarda borrador.
- **Detalle** (`/:id`): datos, valor enviado, pérdida en tránsito, líneas con subalmacén origen → destino, recibido, faltante y motivo. En borrador (con permiso y si el origen es tuyo): Editar, Cancelar (si surte un pedido de sucursal advierte que también lo cancela) y **Despachar** — diálogo con subalmacén de salida (RN-45), vehículo, chofer y "Elegir lotes" por línea (lotes con existencia del subalmacén; la suma debe igualar la línea o quedar vacía para lote planeado / el que caduca primero), luego confirmación con resumen.
- ★ **Recepción** (`/:id/recibir`, móvil primero): tarjeta por línea prellenada con lo enviado, nunca más; si llega menos, motivo (Faltante/Dañado/Otro, obligatorio) y notas; subalmacén de entrada si el destino los tiene; barra fija con el número de líneas con faltante; confirmación con el detalle del faltante (RN-22).
- Los folios de traspasos del kardex ya enlazan a su pantalla.
- Probado en Chrome: lista y detalle recibido; borrador TR-000004 con `E2E-GRANEL` → "Elegir lotes" muestra L-A y L-B con su existencia y avisa si no suma; cancelado sin mover inventario.
- **E2E 5 en verde** (escritorio; recepción a 390 px sin scroll horizontal; suite 17/17): mete 3 pza de `E2E-TRASPASO` en PLANTA-PT con un ajuste de corrección por API, crea PLANTA → `SUC-E2E`, despacha desde Producto terminado, recibe 2 con motivo Faltante y verifica "Recibido con diferencias" y la pérdida en tránsito. **Sí mueve inventario** en la BD contra la que corre (cada corrida deja 2 pza en SUC-E2E y 1 de pérdida).
- Pruebas: 91 unitarias (rutas RN-25, motivo RN-22, suma de lotes). Sin paquetes nuevos.
- Datos de prueba en la BD de desarrollo: TR-000001..TR-000003 recibidos con diferencias (corridas E2E), TR-000004 cancelado, el artículo `E2E-TRASPASO` y sus ajustes de corrección.

### F-09 (2026-10-17)

- **Recetas** (`/produccion/recetas`): lista de activas con búsqueda, tipo (semiterminado / terminado) e interruptor "Incluir versiones anteriores"; versión, rendimiento, componentes y si está en uso.
- **Editor** (`/nueva`, `/:id`, RN-10): producto (semiterminado o terminado; fijo al editar), rendimiento con su unidad, notas y componentes con `app-lines-editor` (materia prima, **insumo** o semiterminado; cantidad y % de merma 0–100 con 2 decimales). Una versión ya usada muestra el aviso "guardar creará la versión N+1", el botón dice "Guardar versión N+1" y pide confirmación; al guardar navega a la versión nueva. Las versiones inactivas y los usuarios sin `production.recipes.manage` ven el editor en solo lectura. **Desactivar / Activar esta versión** con confirmación (activar con otra activa lo rechaza el backend, RN-10). **Historial de versiones** con enlaces, fecha, activa/inactiva y uso.
- La pestaña **Costos** por versión (RN-51) queda para F-22, que depende de B-23 (aún sin endpoint `/recipes/{id}/costs`).
- `app-item-picker` acepta `types` (varios tipos: una búsqueda por tipo, combinadas por SKU) para producto y componentes.
- **E2E 6 en verde** (escritorio; suite 18/18): crea la primera vez `E2E-HARINA`, `E2E-MASA` y su receta; si la receta no está usada crea una OP en borrador y la cancela; edita la merma, confirma, verifica la versión N+1 activa y que la anterior quede inactiva y en solo lectura. No mueve inventario (cada corrida deja una versión más de la receta de `E2E-MASA`).
- Revisado en escritorio y 390 px con capturas de Playwright (las capturas de la extensión de Chrome fallaron por el entorno; el DOM respondía bien).
- Pruebas: 94 unitarias. Sin paquetes nuevos.

### F-10 (2026-10-17)

- **Lista** (`/produccion/ordenes`): pestañas Por producir / En proceso / Borradores / Todas (en `?tab=`), búsqueda, filtros de fecha, área, turno y origen, y `?importId=` (filtro de una importación, con botón para quitarlo); avance con el nuevo `app-progress-meter` (barra `progressbar` accesible, naranja si supera lo planeado) y número de cierres.
- **Formulario** (`/nueva`, `/:id/editar`): planta (la activa si es planta), producto semiterminado o terminado con su receta activa (o aviso con enlace "Crear receta"), cantidad (entera para `pza` por `qty-input`), fecha, área (por omisión la del producto mientras no se toque), turno y notas. **Explosión con disponibilidad** (RN-12, `/recipes/{id}/explode`) que se recalcula 400 ms después de dejar de escribir: teórico, disponible, faltante y costo estimado total y unitario; avisa si hay faltantes. Guarda borrador.
- **Detalle** (`/:id`, §7.4.2): encabezado con producto, receta (enlace a la versión), planta, fecha, área y turno, origen (enlace a sus OP si es importación), avance, cierres y tolerancia excedida; resultado de la OP completada (producido vs planeado, motivo del faltante, costo total y unitario, merma total). Pestañas **Componentes** (teórico, real acumulado, merma por componente RN-13 y, mientras está abierta, disponible y faltante), **Cierres** (tabla simple; la línea de tiempo `app-close-timeline` llega con F-11), **Pedidos** (con enlace cuando el documento ya tiene pantalla) e **Historial**.
- **Acciones** por estado y permiso (`ui/order-actions.ts` `productionOrderActions`, RN-60): Liberar / Editar / Cancelar en borrador; Cancelar en liberada sin cierres; Cierre parcial / final en liberada o en proceso. Los botones de cierre llevan a `/:id/cerrar?tipo=…`, que muestra "En construcción" hasta F-11.
- `.row-link` pasó a estilos globales (`styles/_ui.scss`) sin partir el folio en dos líneas; las listas de traspasos y órdenes no lo tenían.
- `fromIsoDate` en `shared/forms/dates.ts` (fecha local de un DateOnly).
- Verificado con un recorrido temporal de Playwright en escritorio y 390 px (nueva OP con explosión → guardar → liberar → cancelar) y capturas.
- Pruebas: 100 unitarias (acciones por estado y permiso; merma por componente). Sin paquetes nuevos.
- Datos de prueba en la BD de desarrollo: OP-000001..OP-000007 de `E2E-MASA`, todas canceladas.

### F-11 (2026-10-17)

- ★ **Cierre** (`/produccion/ordenes/:id/cerrar?tipo=parcial|final`, §7.4.3, RN-61..RN-66), para tableta y 390 px: título "Cierre parcial/final — OP · SKU" con producido y pendiente; cantidad con input grande (parcial vacía; final con el pendiente; 0 solo si ya hay cierres); turno (el de la OP), subalmacén de consumo y de entrada (obligatorios si la planta los tiene; se recuerdan por planta en este equipo), notas y el lote que se creará con su caducidad (RN-62). **Consumo real** por componente en tarjetas con el teórico de `close-preview` (recalculado 400 ms después de dejar de escribir; la vista previa anterior se conserva mientras llega la nueva), consumo prellenado que solo sigue al teórico mientras el usuario no lo toca, existencia, faltante y **"Elegir lotes"** (nuevo `inventory/ui/lot-split.ts` reutilizable, el reparto debe sumar el consumo). Final abajo de lo planeado: motivo obligatorio y notas con "Otro". Barra fija con costo estimado, unitario y merma; confirmación con producido, lote y consumos; al terminar avisa folio y lote y regresa al detalle. 409 por los diálogos del interceptor.
- **Sobreproducción (D-03):** aviso naranja si supera lo planeado y aviso destacado con el máximo permitido si supera la tolerancia, **sin bloquear** (el cierre queda marcado). `frontend.md` §7.4.3 decía "bloqueo"; se corrigió para cumplir D-03 (decisión cerrada en `dominio.md`).
- **Línea de tiempo** `app-close-timeline` en la pestaña Cierres del detalle de OP: folio, tipo, fecha y hora, turno, usuario, producido, lote, costo unitario, merma y tolerancia; al expandir carga consumos y lotes (`ui/close-consumption.ts`).
- **Cierres** (`/produccion/cierres`, `/:id`): lista con búsqueda, fechas (DateOnly), área y tipo (fecha, OP, producto, área y turno, tipo, producido, costo, merma) y detalle de solo lectura (RN-65) con lote, caducidad, subalmacén de entrada, costos y consumos con lotes. El kardex enlaza los folios de cierres.
- **Corrección de backend (B-26d):** la explosión (RN-12) y la vista previa del cierre costeaban con el costo promedio de la planta misma, que es 0 cuando la existencia está en sus subalmacenes. Ahora usan `InventoryLocations.AverageCostsAsync` (promedio ponderado por existencia de la planta y sus subalmacenes, como el renglón total de Existencias). Prueba de integración `Explosion_and_close_preview_cost_the_components_of_the_plant_warehouses`. Backend: 230 unitarias y 150 de integración en verde.
- **E2E 7 en verde** (suite 19/19): liberar → cierre parcial de 10 kg a 1024 px (consumo 6 kg) → cierre parcial de 5 kg a 390 px sin scroll horizontal (subalmacenes recordados) → cierre final de 3 kg con motivo "Falta de insumo" → Terminada con 3 cierres → los lotes `{folio}-01..03` en Existencias. **Mueve inventario**: mete 20 kg de `E2E-HARINA` en PLANTA-MP y produce 18 kg de `E2E-MASA-L` (artículo con lotes, vida útil 3 días) por corrida.
- Pruebas: 104 unitarias (tipo de cierre, motivo, tolerancia, costos y merma). Sin paquetes nuevos.

### F-12 (2026-10-17)

- **`app-xlsx-import`** (`shared/components/xlsx-import`, §7.4.4): importación de Excel en 3 pasos validada en el servidor. 1) "Descargar plantilla" (la del backend, `downloadBlob` nuevo en `shared/data-access/csv.ts`) y archivo `.xlsx` de hasta 5 MB (botón o arrastrar y soltar), que se envía a `validate`; 2) revisión: con errores, tabla filtrable (fila, columna, mensaje) y solo "Elegir otro archivo"; sin errores, el contenido proyectado `[preview]` y los avisos con la casilla **"Entiendo los avisos y quiero continuar"** (`canImport`: los errores bloquean y los avisos exigen la casilla); 3) resultado proyectado `[result]`. El archivo queda en memoria para reenviarlo (el servidor revalida; un 400 con `rowErrors` regresa a la revisión).
- **Importar OP** (`/produccion/importar`, RN-90..RN-95): "N filas → M órdenes", tabla de órdenes a crear (filas, fecha, producto, cantidad, área y turno, planta, receta), **"Liberar las órdenes al importar"** solo con `production.orders.manage`; resultado con folio `IMP-…`, órdenes creadas, "Ver órdenes" (lista filtrada por la importación) y "Ver la importación"; botón "Historial".
- **Historial** (`/produccion/importaciones`, `/:id`): fecha, archivo, filas, órdenes, liberadas y quién; detalle con huella SHA-256 y sus OP con su estado actual. El origen "Importación" del detalle de OP y el kardex enlazan a la importación.
- Fixtures `e2e/fixtures/ordenes-con-errores.xlsx` y `ordenes-validas.xlsx` generados por `frontend/scripts/e2e-fixtures.py` (**openpyxl 3.1.5, MIT, herramienta local** como Pillow; no es dependencia del proyecto; fechas 2030 para no caducar).
- **E2E 8 en verde** (suite 20/20): archivo con errores → tabla de 3 errores y sin botón de importar; archivo válido con columna desconocida → 3 filas → 2 órdenes, importar deshabilitado hasta marcar la casilla → "2 órdenes creadas en borrador" → "Ver órdenes" muestra 2. Pasa también en la segunda corrida (aviso de archivo ya importado y de OP existentes). No mueve inventario; cada corrida deja 2 OP en borrador de `E2E-MASA` para el 30 y 31/12/2030.
- Pruebas: 108 unitarias (`app-xlsx-import`: errores bloquean, avisos exigen casilla, solo `.xlsx`). Sin paquetes npm nuevos.

### F-25 (2026-10-17)

- ★ **Vales internos** (`/inventario/vales-internos`, RN-47) y entrada "Vales internos" en el menú de Inventario (`inventory.view`). Lista con pestañas Por enviar / En tránsito / Recibidos / Todos de los vales de la ubicación activa, con **Recibir** en los que llegan a uno de sus subalmacenes; aviso si la ubicación no tiene dos subalmacenes donde el usuario mueva existencia.
- **Formulario** (`/nuevo`, `/:id/editar`, `inventory.internal_transfers`): "Sale de" y "Entra a" entre los subalmacenes de la ubicación activa (distintos; el origen no cambia al editar), notas y líneas con lote planeado opcional del subalmacén origen.
- **Detalle** (`/:id`): datos, valor enviado, pérdida en tránsito y líneas con recibido, faltante y motivo; en borrador Editar, Cancelar y **Enviar** (lote planeado o el que caduca primero, confirmación con resumen); en tránsito **Recibir**. Las acciones solo aparecen si el subalmacén (origen para enviar, destino para recibir) es de la ubicación activa y el usuario puede mover existencia ahí.
- **Recepción** (`/:id/recibir`): la misma pantalla que la de traspasos (`TransferReceivePage` con `data: { voucher: true }`: API de vales, rutas y textos de "vale"). `InternalTransfersApi` en `logistics/data-access`. Los folios de vales del kardex enlazan a su pantalla. `stockWarehouses` trata una consulta fallida como "sin subalmacenes".
- **Corrección de backend (B-26d):** la lista de traspasos y vales filtrada por `locationId` de una planta o sucursal no incluía los de sus subalmacenes (los extremos de un vale), así que la lista de vales salía vacía. Ahora el filtro incluye los subalmacenes (RN-46). Prueba de integración `The_list_by_a_location_includes_the_vouchers_of_its_warehouses`; backend 230 unitarias y 151 de integración en verde.
- **E2E 9 en verde** (criterio de F-25; suite 21/21): vale de PLANTA-MP a PLANTA-PT con 3 kg de `E2E-HARINA` creado y enviado en escritorio, recibido con 2 kg y motivo "Faltante" a 390 px sin scroll horizontal; existencias: −3 en MP y +2 en PT. **Mueve inventario** (mete 3 kg con un ajuste de corrección por corrida). Se actualizaron la unitaria del menú y la E2E 1 con la entrada nueva.
- Pruebas: 108 unitarias. Sin paquetes nuevos.

### F-13 (2026-10-17)

- Feature `purchasing` (`/compras`): **Proveedores** (`/compras/proveedores`) con búsqueda por razón social o RFC e interruptor "Mostrar inactivos"; razón social, RFC, contacto, crédito (0 = contado), número de artículos y estado.
- **Ficha** (`/nuevo`, `/:id`, editar con `purchasing.suppliers.manage`): pestaña **Datos generales** (RFC en mayúsculas con el formato SAT de RN-35 validado en el navegador con la misma regla y mensaje que el backend — `ui/rfc.ts`; razón social, contacto, teléfono, correo, días de crédito 0–365, activo; **desactivar pide confirmación** porque pierde sus preferencias y su catálogo no se edita hasta reactivarlo), pestaña **Artículos** (`ui/supplier-items.ts`: clave, precio por unidad de compra y por unidad base, días de entrega, preferido y estado; "Mostrar inactivos"; alta y edición en `ui/supplier-item-dialog.ts` con materias primas e insumos; marcar preferido quita la preferencia del otro proveedor y la tabla se vuelve a leer) e **Historial**.
- **E2E 10 en verde** (criterio de F-13; suite 22/22): un RFC con fecha imposible muestra el error; con un RFC válido único (en minúsculas, se guarda en mayúsculas) crea el proveedor, agrega `E2E-HARINA` a $18.50 con 2 días de entrega como preferido y la tabla lo muestra. No mueve inventario; cada corrida deja un proveedor "Proveedor E2E EEE…" que se queda con la preferencia de `E2E-HARINA`.
- Pruebas: 111 unitarias (RFC moral y física, fechas imposibles, genéricos). Sin paquetes nuevos.

### F-14 (2026-10-17)

- **Requisiciones** (`/compras/requisiciones`, RN-34): lista por estado con selección (con `purchasing.po.manage`) y **"Convertir a OC (n)"** de las aprobadas seleccionadas (avisa si hay seleccionadas sin aprobar); confirmación y tarjeta con las **OC generadas** (folio, proveedor, requisiciones que agrupa, fecha esperada, líneas y total con IVA; el folio enlazará a la OC con F-15).
- **Formulario** (`/nueva`, `/:id/editar`): la Planta, "Se necesita para" (hoy + 7 por omisión, no pasada), líneas de materia prima o insumo en la **unidad de compra** del proveedor, con **proveedor sugerido** (las ofertas de `/items/{id}/supplier-offers`, el preferido primero y marcado "(preferido)"), **importe** estimado por línea y subtotal; un artículo repetido exige nota (`repeatedWithoutNote`).
- **Detalle** (`/:id`): datos, sellos (enviada, aprobada, rechazada con motivo), líneas con proveedor (o "Sin proveedor"), precio, importe y la OC que la convirtió; **acciones por estado y permiso** (`ui/requisition-actions.ts`): Editar y Enviar en borrador, Aprobar y Rechazar con motivo (`ReasonService`) enviadas, Cancelar en borrador/enviada/aprobada, **Convertir a OC** aprobadas.
- **E2E 11 en verde** (criterio de F-14; suite 23/23): una requisición por el formulario (proveedor preferido e importe) enviada y aprobada en la interfaz, otra aprobada por API; ambas seleccionadas y convertidas; la tabla de OC generadas muestra los dos folios. No mueve inventario; cada corrida deja 2 requisiciones convertidas y una OC en borrador.
- Pruebas: 115 unitarias (acciones por estado y permiso; nota de artículo repetido). Sin paquetes nuevos.

### F-15 (2026-10-17)

- **Órdenes de compra** (`/compras/ordenes`, RN-30..RN-32): pestañas Todas / Por aprobar / Por recibir (en `?tab=`), búsqueda por folio o proveedor y **Recibir** en las aprobadas o parcialmente recibidas.
- **Formulario** (`/nueva`, `/:id/editar`): proveedor (nuevo `ui/supplier-picker.ts` sobre `LookupPicker`; fijo al guardar), planta de entrega, fecha esperada (+7 días), notas; líneas del **catálogo activo del proveedor** (el editor aparece cuando el catálogo cargó) con el precio sugerido y editable, el IVA del artículo y **totales en vivo con el mismo redondeo que el backend** (`ui/purchase-math.ts`: centavos redondeando lejos de cero, IVA sobre el subtotal redondeado de cada línea); la requisición de origen por línea.
- **Detalle** (`/:id`): proveedor, entrega, sellos (enviada, aprobada —automática si quedó debajo del umbral—, rechazada, cerrada con saldo con su motivo), líneas con recibido y pendiente, totales y recepciones; **acciones por estado y permiso** (`ui/purchase-order-actions.ts`): Editar/Enviar/Cancelar en borrador, Aprobar/Rechazar con motivo por aprobar, Recibir y Cancelar aprobada, Recibir y **Cerrar con saldo** (motivo) parcialmente recibida.
- ★ **Recepción** (`/compras/recepciones/nueva?oc=`, móvil primero): tarjeta por línea con su saldo prellenada con lo pendiente; lote y caducidad para artículos con lotes y **"Otro lote"** para repartir una línea; factura (en mayúsculas); subalmacén de entrada; aviso naranja si excede lo pendiente y bloqueo arriba de la tolerancia (`ui/receipt-rules.ts`, RN-32); barra fija con el costo sin IVA; confirmación. **Historial** (`/compras/recepciones`) y **detalle** con unidad de compra y base, lote y costo unitario base (RN-33). Los folios de OC y recepciones del kardex y de requisiciones enlazan a su pantalla.
- **Backend:** `SupplierItemDto` trae `taxRate` (el IVA del artículo, que toma la línea de la OC), para calcular los totales de una línea nueva sin pedir permiso de catálogos; tipos regenerados.
- Corrección en el formulario: el selector de proveedor emite cambios al escribir y al reescribir su valor; las líneas solo se reinician cuando cambia de verdad el proveedor (antes se recreaban y el selector de artículos perdía el foco y las opciones).
- **E2E 9 en verde** (`12-purchase-receipt`, suite 24/24): OC por el formulario con el precio del catálogo → enviar → aprobar → recibir a 390 px (prellenado con lo pendiente, factura, sin scroll horizontal) → recepción con OC "Recibida" → la existencia de PLANTA-MP sube 5 kg. **Mueve inventario.** `support/api.ts` ganó `ensureSupplierOffer`.
- Pruebas: 124 unitarias (redondeo igual al backend, acciones de OC, tolerancia de recepción). Sin paquetes nuevos.

### F-16 (2026-10-17)

- ★ **Pedidos de sucursal** (`/logistica/pedidos`, RN-20): sin permiso de aprobar, los de la sucursal activa; con `logistics.orders.approve`, todos los del alcance con **filtro de sucursal** y pestaña **Por aprobar** (en `?tab=`).
- **Formulario** (`/nuevo`, `/:id/editar`): la sucursal activa pide a la Planta, "Se necesita para" mañana, notas; artículos **producto terminado o insumo** (D-05) con la **existencia de la sucursal** (con sus subalmacenes); **"Sugerir por mín/máx"** agrega solo los artículos en o bajo su mínimo que faltan, con la cantidad para llegar al máximo, y muestra mín, máx, en camino y pedido.
- **Detalle** (`/:id`): solicitado / aprobado / despachado, traspasos ligados con su estado e **"Ir a despachar"**, sellos y motivo de rechazo. **Aprobar en la misma pantalla**: existencia de la Planta por línea, cantidad aprobada (0 a lo solicitado, aviso si pasa de la existencia, no se permite todo en 0: se rechaza con motivo), confirmación; crea el traspaso en borrador. Acciones por estado y permiso en `ui/branch-order-rules.ts` (`branchOrderActions`, `checkApproval`).
- **E2E 10 en verde** (`13-branch-order`, suite 25/25): pedido de 4 pza de `E2E-INSUMO` (insumo nuevo) hecho y enviado a 390 px → aprobado 3 en escritorio → "Ir a despachar" → despacho desde Producto terminado → recibido 2 con motivo "Faltante" a 390 px sin scroll horizontal → "Recibido con diferencias". **Mueve inventario** (mete 4 pza en PLANTA-PT por corrida). `support/api.ts` ganó `put`.
- Revisado aparte el sugerido a 390 px: con mín 10, máx 30 y existencia 2 en SUC-E2E sugiere 28 y muestra los datos (deja ese mín/máx de `E2E-INSUMO` en SUC-E2E en la BD de desarrollo).
- Pruebas: 130 unitarias (acciones por estado y permiso; aprobación: rango, todo en 0, arriba de la existencia). Sin paquetes nuevos.

### F-17 (2026-10-17)

- Feature `sales` (`/ventas`). **Clientes** (`/ventas/clientes`): búsqueda por código, nombre o RFC y "Mostrar inactivos". **Ficha** (`/nuevo`, `/:id`): **Datos generales** (código en mayúsculas con letras, números y guiones, editable mientras sea único; RFC opcional con las reglas del proveedor —`rfc.ts` pasó a `shared/forms`—; contacto, teléfono, correo, notas, activo), **Puntos de entrega** (`ui/delivery-points.ts`, lista y `RecordDialog`), **Artículos** (`ui/customer-items.ts` + diálogo: clave del cliente y precio informativo, D-06) e **Historial**.
- Los artículos del cliente aceptan **producto terminado granel o empaquetado**: `frontend.md` §7.7 decía "solo empaquetados", pero `dominio.md` (D-05, decidida) permite ambos y el backend lo valida así.
- **Pedidos de cliente** (`/ventas/pedidos`, RN-80..RN-82): pestañas Por surtir / Borradores / Todos (en `?tab=`), filtros de cliente (`ui/customer-picker.ts`), fechas y estado, avance remisionado con `app-progress-meter`. **Formulario** (`/nuevo`, `/:id/editar`): cliente (fijo al guardar), punto de entrega activo del cliente, fecha requerida (mañana), referencia del cliente y notas; productos terminados sin repetir con cantidad y precio opcional (el informativo del cliente al elegir el producto, con su clave); importe informativo; **"Guardar borrador"** o **"Guardar y confirmar"** (con confirmación: entra al plan y ya no se edita). **Detalle**: pedido / remisionado / pendiente por línea, importe, remisiones y acciones por estado y permiso (`ui/customer-order-actions.ts`): Confirmar, Editar, Cancelar (sin nada remisionado), Cerrar con saldo con motivo. "Nueva remisión" se muestra con F-18 (la acción ya está en las reglas).
- **E2E de F-17 en verde** (`14-customer-order`, suite 26/26): cliente con código en minúsculas (se guarda en mayúsculas), punto de entrega "Tienda centro", artículo `E2E-PAN` (terminado nuevo) con clave PAN-01 y $4.50; pedido para ese punto con la referencia, precio y clave prellenados, 12 pza, "Guardar y confirmar" → Confirmado con importe $54.00. No mueve inventario; deja un cliente "Cliente E2E …" y un pedido confirmado (demanda del plan) por corrida. `support/api.ts`: `ensureItem` acepta terminados (granel).
- Pruebas: 135 unitarias (acciones del pedido por estado y permiso; producto repetido). Sin paquetes nuevos.
- Pendiente para F-19: "OP ligadas con avance" en el detalle del pedido (el DTO aún no las trae; llegan con el plan, que genera las OP con su demanda).

### F-18 (2026-10-17)

- **Remisiones** (`/ventas/remisiones`, RN-81..RN-83): pestañas Por despachar / Todas (en `?tab=`), filtros de cliente y fechas; pedido, cliente, punto, estado, cantidad, creada y despachada.
- **"Nueva remisión"** en el detalle del pedido (confirmado o remisionado parcial, con `sales.shipments.dispatch`): crea la remisión en borrador prellenada con el saldo y abre su pantalla.
- ★ **Remisión** (`/:id`): en borrador, tarjeta por producto con pedido, ya remisionado y máximo (saldo + tolerancia, RN-82), cantidad editable, **"Elegir lotes"** (`lot-split`), subalmacén de salida, vehículo, chofer, quién recibe y notas; "Guardar cantidades", "Cancelar remisión" y **Despachar** (guarda primero las cantidades si cambiaron, luego despacha con los lotes elegidos; confirmación con el resumen; 409 por faltantes en el interceptor). Despachada: solo lectura con lotes y caducidad, costo interno solo en pantalla, e **Imprimir** en hoja carta.
- **Impresión** (`styles/_ui.scss`): `@media print` con `@page { size: letter }`, sin barra superior, menú lateral, migas ni barra de acciones; clases globales `pan-print-only` y `pan-no-print`. La remisión impresa lleva logo, "Documento de entrega · no es factura" (RN-83), datos, productos con lotes y líneas de firma "Entregó" / "Recibió".
- Corrección: el efecto que llenaba las líneas de la remisión leía y escribía la misma señal (ciclo) y la pantalla no terminaba de mostrarse; ahora lee el estado previo con `untracked`.
- **E2E 11 en verde** (`15-customer-shipment`, suite 27/27): pedido de 12 `E2E-PAN` confirmado por API → "Nueva remisión" prellenada con 12 → parcial de 5 desde Producto terminado con vehículo, chofer y quién recibe → Despachada → vista de impresión (emulada) con encabezado, sin menú → el pedido queda "Remisionado parcial" con 7 pendientes. **Mueve inventario** (mete 5 pza de `E2E-PAN` en PLANTA-PT y las remisiona). Se cancelaron las remisiones borrador RM-000001..RM-000009 que dejaron las corridas de diagnóstico.
- Pruebas: 137 unitarias (reparto de lotes). Sin paquetes nuevos.
- `docs/specs/trazabilidad.md` (nueva versión) y `trazabilidad-ui.md` del usuario se renumeraron a B-28 y F-26 y se comitearon aparte.

### F-19 (2026-10-17)

- **Plan de producción** (`/produccion/plan`, §7.4.1, RN-70, RN-71): Planta, rango (el que usa el servidor por omisión, hoy + `production.plan_default_days`, llena las fechas), área y búsqueda; tabla agrupada por **fecha** y luego por **área** (`ui/plan-rules.ts`) con SKU, producto, tipo y presentación, demanda (sucursales, clientes, stock, OP padre), existencia, OP pendientes y **por producir** resaltado; "sin receta activa" en rojo. Al expandir: las líneas de pedido que lo originan con enlace (pedido de sucursal, de cliente u OP padre).
- Selección de renglones con algo por producir y receta activa (con `production.orders.manage`): cantidad editable prellenada con el sugerido (el **múltiplo de producción es pista**, no bloqueo) y turno opcional. **"Generar OP (n)"** con confirmación (producto / fecha / cantidad / área) → tarjeta con los folios creados, las líneas que atiende cada una y "Ver órdenes en borrador". Al refrescar el plan se conservan los renglones elegidos que siguen por producir (antes la búsqueda borraba la selección a los 300 ms).
- La **pestaña Pedidos** del detalle de OP (hecha en F-10) ya enlaza a los pedidos de sucursal y de cliente.
- **Calendario en español:** `EsMxDatepickerIntl` (en `provideEsMxDates`) traduce los textos que anuncian los lectores de pantalla ("Abrir el calendario", "Mes siguiente"…), que salían en inglés en toda la app.
- **E2E 12 en verde** (`16-production-plan`, suite 28/28): pedido de sucursal de 40 `E2E-PAN` enviado para mañana → aparece por producir con su pedido al expandir → generar OP (cantidad que cubre toda la demanda del día) → la OP lo lista en su pestaña Pedidos. Cancela al inicio las OP en borrador de `E2E-PAN` de corridas anteriores. No mueve inventario; crea la receta de `E2E-PAN` la primera vez.
- Pruebas: 141 unitarias (agrupación del plan, múltiplo como pista, calendario en español). Sin paquetes nuevos.
- Sigue pendiente "OP ligadas con avance" en el detalle del pedido de cliente: el `CustomerOrderDto` no trae las OP (requiere un campo en el backend; se anota para B-25 o una tarea menor).

### F-20 (2026-10-17)

- **Requerimiento de materia prima** (`/compras/requerimiento`, RN-50, con `purchasing.view` o `production.view`): Planta y horizonte "Órdenes hasta" (el que usa el servidor por omisión, hoy + 7, llena la fecha); grupos **Por comprar / Por producir / Cubiertos** con su número; por componente: requerido, mínimo, existencia, en OC, en requisiciones, faltante y, por comprar, sugerido en unidades de compra y proveedor preferido. Al expandir: las OP que lo requieren con enlace.
- **"Crear requisición sugerida"** (con `purchasing.requisitions.manage`): de los renglones elegidos o, sin elegir, de todo lo por comprar; confirmación con el resumen; abre la requisición en borrador.
- Un semiterminado **por producir** (D-04) enlaza al plan filtrado por su SKU: el plan acepta `?q=`.
- **E2E de F-20 en verde** (`17-material-requirement`, suite 29/29): una OP en borrador de 50,000 kg de `E2E-MASA` deja `E2E-HARINA` por comprar con su proveedor preferido → requisición sugerida de esa línea → borrador con la harina y el proveedor. Cancela la OP y la requisición al final para no cubrir el requerimiento de las siguientes corridas. No mueve inventario.
- Pruebas: 141 unitarias. Sin paquetes nuevos.
- **Fase 4 del frontend completa** (F-16..F-20).

### B-22 (2026-10-17)

- **Tablero** `GET /dashboard?locationId` (basta la sesión; sin `locationId`, todas las ubicaciones del alcance; una ubicación fuera del alcance → 403). Cada bloque llega en `null` sin su permiso y trae conteo + los primeros 5:
  - `lowStock`, `expiringLots` (con vencidos y días de alerta) con `inventory.view`, reutilizando `/alerts`.
  - `transfersToReceive` / `transfersToDispatch` (traspasos normales; los vales internos tienen su pantalla) con `logistics.view`; `branchOrdersToApprove` (enviados a la ubicación surtidora) con `logistics.orders.approve`; `branchOrdersInProgress` (enviados, aprobados o surtidos en parte) con `logistics.orders.create`; `purchaseOrdersToApprove` con `purchasing.po.approve`.
  - `productionToday` (OP de hoy no canceladas por área **y unidad**: nunca suma kg con pza; planeado vs producido), `productionInProgress` y `recipesWithCostIncreases` con `production.view`.
  - `customerOrdersDue` (confirmados o surtidos en parte con fecha ≤ hoy; cuenta aparte los vencidos) con `sales.view`; `customerShipmentsToDispatch` (borradores) con `sales.shipments.dispatch`; `lowStockByLocation` (solo ubicaciones con alguno) solo con `locations.all`.
- **Recetas con alza de insumos** (parte de RN-51 que necesita el tablero): versiones activas con un componente cuyo último costo de entrada por compra supera al anterior en ≥ `production.cost_increase_alert_pct` y tiene ≤ 30 días. Una recepción con varios lotes cuenta una vez, a su costo ponderado. Las recetas no son por ubicación: el bloque no filtra por `locationId`. `RecipeCostRules` y `DashboardService.CostIncreasesAsync` quedan para B-23.
- **Resumen de producción** `GET /reports/production-summary?locationId&from&to&groupBy=Area|Item|Day` (RN-53, `production.view`, rango ≤ 366 días): planeado (OP del rango no canceladas), producido, costo y merma en pesos (cierres del rango, cada cierre con su merma redondeada como en su detalle), % de cumplimiento; un renglón por unidad. Totales de costo y merma.
- Pruebas: unitarias de la regla de alza (umbral exacto, 30 días, bajada, sin anterior, costo ponderado) y del cumplimiento; integración `DashboardTests`: el resumen por área y por producto cuadra con la suma de los cierres (una OP cancelada no cuenta), producción de hoy en el tablero, permisos por bloque (encargado de sucursal), 403 fuera de alcance y receta con alza de 900 %. Backend: 245 unitarias y 154 de integración en verde. Sin migración ni paquetes nuevos.
- Frontend: tipos regenerados y etiqueta de `ProductionSummaryGroupBy`.
- Nota de desarrollo: `dotnet watch` no recarga bien un enum nuevo (`/openapi` respondía 500 "Literal value was not found"); se resuelve reiniciando el contenedor del API.

### B-23 (2026-10-17)

- **Costo de receta** `GET /recipes/{id}/costs?locationId` (RN-51, `production.view`): todas las versiones de la receta del producto, la más nueva primero, costeadas con el costo promedio vigente de la ubicación con sus subalmacenes (`InventoryLocations.AverageCostsAsync`). Por línea: cantidad, % merma, costo promedio, costo de línea = cantidad × (1 + merma/100) × costo, y el **alza** si la hay (costo anterior, último, %, fecha). Por versión: costo total del rendimiento, **costo unitario = total / rendimiento** y número de alzas. Solo lectura.
- La detección de alzas pasó a `RecipeCostRules.IncreasesAsync` (Production) y la comparten el tablero y los costos.
- **Análisis de consumo** `GET /consumption-analysis?locationId&weeks&q` (RN-52, `inventory.view`, semanas 1..26, 8 por omisión): salidas `Consumption`, `ProductionConsumption`, `TransferOut` y `CustomerShipment` de la ubicación y sus subalmacenes en **N semanas completas que terminan ayer** (N × 7 días; hoy no cuenta). Excluye los vales internos (`TransferOut` con documento `InternalTransfer`): solo mueven existencia entre la ubicación y sus subalmacenes. Por artículo: total, promedio diario, promedio por día de la semana (lunes a domingo), tendencia (últimas 4 semanas contra las 4 anteriores; null con menos de 8 semanas o sin consumo antes), mín/máx actual y sugerido (promedio × `inventory.min_cover_days` / `max_cover_days`, hacia arriba: enteros en `pza`, 4 decimales en las demás unidades; el máx nunca bajo el mín). "Aplicar sugerido" usa el PUT normal de mín/máx.
- **Decisión tomada (sin pregunta, por ser de presentación):** el redondeo hacia arriba fuera de `pza` es a 4 decimales, la precisión de las cantidades (RN-03b).
- Pruebas: unitarias del periodo, promedio, tendencia, sugerido (enteros, decimales, máx ≥ mín) y del costo de línea y unitario; integración `ConsumptionAnalysisAndRecipeCostTests`: historial de 8 semanas (8 y 12 pza/día → 10/día, +50 %, 20/70; las salidas de hoy, de antes del periodo y el vale interno no cuentan; 4 semanas sin tendencia; 27 semanas → 400) y dos versiones de receta (132.1 y 112.1 → 1.321 y 1.121 por pieza; azúcar +20 % marcada). Para fechar el historial la prueba cambia la fecha de negocio de sus propios movimientos. Backend: 264 unitarias y 156 de integración en verde. Sin migración ni paquetes nuevos.
- Frontend: tipos regenerados.

### B-24 (2026-10-17)

- **`ItemPhoto`** (`catalog.item_photo`, una por artículo, se borra con él; migración `AddItemPhotos`): imagen (máx. 512 px por lado, 300 KB) y miniatura (96 px, 50 KB) en `bytea` con su tipo, fecha y usuario. `Revision` (long) sale de la hora de carga y siempre crece: una foto borrada y vuelta a subir nunca repite una revisión que el navegador tenga en caché.
- **`GET /items/{id}/photo?size=thumbnail|full`** (miniatura por omisión; con cualquiera de los permisos de `/items/lookup`): `ETag` `"<revisión>-<tamaño>"`, `Cache-Control: private, no-cache`; con `If-None-Match` vigente → **304**. Sin foto → 404.
- **`PUT /items/{id}/photo`** (`catalog.manage`): multipart `image` + `thumbnail`, límite de 400 KB. El tipo **se lee del archivo** (encabezado PNG, JPEG o WebP —VP8, VP8L y VP8X—, `ImageHeader`, sin librerías de imágenes: SixLabors está prohibido); el que declara el navegador se ignora. Errores 400 por campo en español: falta, peso, dimensiones o "no es una imagen PNG, JPEG o WebP". **`DELETE`** → 204.
- **`photoRevision`** (null sin foto) en `ItemDto`, `ItemListItemDto` e `ItemLookupDto`, para que el frontend pida la foto solo cuando cambia.
- **Corrección general:** una carga mayor al límite del endpoint llegaba como 400 con el texto en inglés de ASP.NET ("Failed to read the request form…"); ahora es **413** `payload_too_large` en español con el límite en KB (también para los Excel y CSV). Y la plantilla de importación de OP documentaba su respuesta como `FileContentResult`; ahora, como la foto, es binaria en OpenAPI.
- Pruebas: unitarias del lector de encabezados (PNG, JPEG, las tres variantes de WebP, texto, truncados, GIF), de la validación y de la revisión; integración `ItemPhotoTests`: carga, revisión en los tres DTO, miniatura y completa con ETag y 304, reemplazo (cambia la revisión y el tipo, el ETag viejo ya no coincide), borrado; tipo, dimensiones, falta, peso y 413; permisos (encargado de sucursal ve pero no cambia; sin sesión 401). Backend: 269 unitarias y 159 de integración. Sin paquetes nuevos.
- Frontend: tipos regenerados, etiqueta de `ItemPhotoSize` y `photoRevision` en las opciones de artículo que se arman a mano (null hasta F-23).

### B-25 (2026-10-18)

- **Volumen y `EXPLAIN`** (`docs/rendimiento.md`): `Fixtures/volume.sql` genera un año de producción (27,000 OP, 79,029 cierres, 237,087 líneas, 316,156 movimientos; 79,030 de la harina) y `VolumeTests` (solo con `PAN_PERF_VOLUME=1`, en su propio contenedor) mide por la API y captura los planes reales con `auto_explain`. **Criterio cumplido:** kardex de la harina 39 ms, lista de OP 12 ms, plan 24 ms (límites 300/300/1000).
- **Mejoras que salieron de los planes:**
  - Índice `production_close(closed_at)` (migración `AddCloseListIndex`): lista de cierres 97 → 28 ms.
  - Resumen de producción agrupado en la BD (antes una subconsulta de merma por cierre y 79,000 filas agrupadas en .NET): 656 → 94 ms en un año.
  - Conteo del kardex sobre los movimientos filtrados, sin las uniones: kardex de toda la planta 50 → 26 ms.
  - Los índices mínimos de backend §4 ya existían todos.
- **Despliegue:**
  - `deploy/docker-compose.yml` (producción: `api`, `web` con Caddy y `migrate` en el perfil `tools`) y `deploy/docker-compose.demo.yml` (overlay con Postgres en contenedor y respaldos).
  - `deploy/Caddyfile` con **página de mantenimiento** (`deploy/maintenance/index.html`, 503) cuando falta el build.
  - `deploy/README.md` (instalación, actualización, demo, variables, respaldos, diagnóstico) y `PAN_DOMAIN` en `.env.example`. El `Dockerfile` con el target `migrator` (bundle `linux-x64`/`linux-arm64`) ya existía desde B-01.
- **Verificado de punta a punta:** se construyeron las tres imágenes y, con el overlay de demo sobre una BD vacía y valores de prueba generados al momento, corrió `migrate` (25 migraciones), `api --seed`, `up -d`, `/health/ready` *Healthy*, SPA por Caddy e inicio de sesión por `/api`. Los logs quedaron sin errores después de dos correcciones:
  - Npgsql intentaba cifrado GSS (Kerberos) y la imagen `aspnet` no tiene `libgssapi_krb5`: ahora la cadena de conexión lo desactiva salvo que la configuración lo pida (`DependencyInjection.WithoutKerberos`, con prueba unitaria).
  - El health check abría conexiones por fuera del data source: ahora usa el mismo pool.
- **Licencias** (`docs/licencias.md`): 128 paquetes NuGet y 442 de npm revisados en su versión exacta; ninguno de pago ni prohibido. `SixLabors.Fonts` 1.0.0 llega solo como transitivo de ClosedXML y es Apache-2.0.
- Pruebas: backend 270 unitarias y 159 de integración en verde. Sin paquetes nuevos.
- **Backend completo** (B-01..B-27). Queda registrada la ampliación de trazabilidad (B-28).

### F-21 (2026-10-18)

- **Tablero** (`/`, frontend §7.9) de la ubicación activa:
  - **Tarjetas** según permisos (un bloque en null no tiene tarjeta) y tipo de ubicación (`dashboardCards`): la sucursal ve traspasos por recibir y pedidos en curso; la Planta, traspasos por despachar, pedidos por aprobar, OC por aprobar, OP en proceso, recetas con alza de insumos, pedidos de cliente por surtir y remisiones por despachar; las dos, bajo mínimo y lotes por caducar.
  - Cada tarjeta trae su conteo y los primeros 5 con enlace, "Ver los N", y abre su lista filtrada por URL (`?tab=`, `?bajoMinimo=1`, `?porCaducar=1`). Las alertas con algo pendiente van en naranja (bajo mínimo, por caducar, alzas, pedidos de cliente vencidos); las colas de trabajo no.
  - Skeleton, error con "Reintentar" y estado vacío.
- **Gráficas con Chart.js 4.5.1 (MIT), carga diferida** en su propio chunk (61 KB transferidos; el bundle inicial no cambia). Componente compartido `app-bar-chart`: barras horizontales con colores de tokens que siguen el tema, ticks enteros cuando los valores lo son, y una **tabla oculta para lector de pantalla** con los mismos datos.
  - **Producción de hoy por área** (planeado contra producido, un renglón por área y unidad) con enlace al resumen.
  - Con `locations.all`, **artículos bajo mínimo por ubicación**, en un tono y sin leyenda: tocar una barra cambia la ubicación activa y abre Existencias con "Solo bajo mínimo".
- **Acciones rápidas en celular** (`quickActions`, hasta 4, solo bajo 600 px):
  - Sucursal: Recibir traspaso (abre el único pendiente), Contar inventario (abre el único conteo en proceso), Registrar consumo y Nuevo pedido.
  - Planta: Cerrar producción (OP en proceso), Contar inventario, Despachar traspaso y Recibir compra.
- **Existencias** acepta `?bajoMinimo=1` (enciende el filtro) y `?porCaducar=1` (lleva a la sección de lotes por caducar).
- **Resumen de producción** (`/produccion/resumen`): periodo (por omisión los últimos 7 días), por área, producto o día; totales de costo producido y merma; barras planeado contra producido (los primeros 15) y tabla completa con OP, planeado, producido, cumplimiento (en rojo bajo 90 %), costo y merma. Un renglón por unidad.
- **E2E 13 en verde** (`18-dashboard`, escritorio y 390 px): administrador en la Planta (tarjetas de Planta, gráficas, tabla accesible, acciones rápidas en celular, la tarjeta de bajo mínimo abre Existencias filtrada, resumen por día) y encargado de sucursal (tarjetas de sucursal, ninguna de Planta, sus cuatro acciones). No mueve inventario.
- **Corrección de la E2E 12 (plan):** con el cambio de día, los pedidos E2E de corridas anteriores caen hoy y había dos renglones de E2E-PAN; ahora toma el de mañana, el último.
- Pruebas: 149 unitarias (tarjetas por tipo de ubicación, permisos, alertas y enlaces; acciones rápidas; rótulo del resumen). Suite E2E 33/33.
- Paquete nuevo: `chart.js` 4.5.1 (MIT) y su dependencia `@kurkle/color` 0.3.4 (MIT), anotados en `docs/licencias.md`.

### F-22 (2026-10-18)

- **Pestaña Costos de la receta** (`/produccion/recetas/:id?tab=costos`, RN-51; pestañas Receta / Costos con `mat-tab-nav-bar`):
  - Todas las versiones del producto, la más nueva primero, costeadas con el costo promedio vigente de la Planta: costo por unidad base, costo del rendimiento y **cambio contra la versión anterior** (`unitCostChangePct`).
  - Por componente: cantidad, merma, costo promedio ("Sin costo" en naranja si no tiene), costo y **alza** (%, costo anterior → último, fecha). Etiqueta naranja con cuántos insumos subieron.
  - La versión abierta va resaltada y las otras enlazan a su propia pestaña de costos. La tarjeta "Recetas con alza de insumos" del tablero abre esta pestaña.
- **`mxn` con decimales opcionales:** `| mxn: 4` muestra costos unitarios con hasta 4 decimales sin ceros sobrantes ($0.045, $11.6039); sin argumento sigue igual.
- **Análisis de consumo** (`/inventario/analisis-consumo`, RN-52) de la ubicación activa:
  - Semanas (4, 8, 12 o 26) y búsqueda. Por artículo: total, promedio diario, tendencia (flecha y %), mín/máx actual y sugerido.
  - Al expandir: **barras por día de la semana**.
  - **Aplicar sugerido** (con `catalog.manage`, confirmación con actual contra sugerido) guarda el mín/máx de esa ubicación con el PUT normal; si ya coincide dice "Aplicado".
  - El promedio de un artículo en `pza` muestra decimales (es un promedio, no un conteo; 21 pza en 56 días = 0.38 pza y no "0 pza").
- **E2E de F-22 en verde** (`19-costs-analysis`): la receta de E2E-PAN muestra una sección por versión con su costo por pza y la harina; en el análisis, el día de la semana de E2E-HARINA y "Aplicar sugerido" → "Aplicado". Restaura el mín/máx anterior al final. No mueve inventario. En una BD recién creada, sin salidas antes de hoy, la parte del análisis termina en el estado vacío.
- Pruebas: 152 unitarias (cambio entre versiones, sugerido distinto del actual, `mxn` con decimales). Suite E2E 34/34. Sin paquetes nuevos.

### F-23 (2026-10-18)

- **`app-item-photo`:** miniatura del artículo o sus iniciales ("Concha de vainilla" → CV) cuando no tiene foto.
  - Se descarga con la sesión como blob (`ItemPhotosApi`) y se muestra por un object URL guardado por artículo, **revisión** y tamaño (máx. 400). Una carga nueva cambia la revisión, así que nunca se ve una foto vieja; el navegador revalida con el ETag (304).
  - Sin revisión no pregunta al servidor. Si una descarga falla no se guarda en caché, para no esconder la foto por un corte de red.
  - Es decorativa salvo que reciba `alt`.
- **Pestaña Foto del artículo:** foto actual a 240 px; **Elegir foto**, **Tomar foto** (cámara del celular o tableta, `capture="environment"`) y **Quitar foto** con confirmación.
  - Se redimensiona en el navegador con `canvas` (sin librerías): JPEG de 512 px y miniatura de 96 px, bajando la calidad hasta caber en 300 KB y 50 KB; la transparencia queda en blanco (`shared/forms/image-resize.ts`).
  - Al cambiar, el artículo toma la revisión nueva.
- **Fotos en:** opciones del selector de artículos y el artículo elegido (el selector tiene su propia plantilla), lista de artículos (columna Foto) y tabla del plan.
- **Importación masiva** (`/catalogos/articulos/fotos`, `catalog.manage`, enlace "Importar fotos" en la lista): cada archivo se liga al artículo activo con el SKU de su nombre (`TRENZA.jpg`, sin importar mayúsculas ni la carpeta). Se suben **una por una** con estado por archivo (Por subir, Sin artículo, Subiendo, Lista, Error); un error no detiene a las demás.
- **Backend (pequeño):**
  - `ProductionPlanRowDto` trae `photoRevision`.
  - **Corrección de B-24:** la lista de artículos leía la revisión con `ToDictionaryAsync(p => p.ItemId, p => p.Revision)`, que carga la entidad completa **con las imágenes** (hasta ~7 MB por página de 25). Ahora proyecta solo `ItemId` y `Revision`, igual que el plan.
- **Corrección del script de íconos:** tomaba el `/*` de `accept="image/*"` como inicio de comentario y se saltaba el resto de la plantilla; `upload` y `photo_camera` no entraban al subconjunto y `icons:check` pasaba. Ahora un comentario de bloque solo empieza al inicio de línea o tras un espacio. Subconjunto: 83 íconos.
- **E2E de F-23 en verde** (`20-item-photos`):
  - Una foto de 900 × 600 px subida desde E2E-PAN llega a 512 × 341 px y se ve en el selector del ajuste.
  - `e2e-harina.png` en la importación masiva se liga a E2E-HARINA → "Lista".
  - No mueve inventario; las fotos se quedan.
  - El PNG de prueba (`e2e/fixtures/foto-e2e.png`) lo genera `scripts/e2e-fixtures.py` solo con la biblioteca estándar.
- Pruebas: 157 unitarias (tamaño proporcional, SKU del nombre de archivo, iniciales). Backend 270 + 159 en verde. Sin paquetes nuevos.

### F-24 (2026-10-18)

- **Ayuda contextual** (frontend §4.3, `core/help/`):
  - `HelpService` resuelve el manual por el patrón de la ruta (`produccion/ordenes/:id/cerrar`). `help-content.ts` trae un tema para **cada una de las 87 rutas** (descripción, pasos, campos y consejos en español, con las reglas del negocio), y una prueba unitaria recorre todas las rutas, las diferidas incluidas, y falla si falta alguna o sobra un tema.
  - Botón flotante con **anillos tipo HUD en SVG** que giran, se detienen al abrir y quedan quietos con "reducir movimiento"; sube sobre la barra de acción fija del celular.
  - El panel se cierra con X, Esc, el botón o al cambiar de pantalla, y el foco vuelve al botón. En oscuro usa el "neón azul" del menú.
  - Se carga con `@defer (on idle)` (chunk de 29 KB; el inicial sigue en 393 KB) y aparece también en el login.
  - **Corrección durante la prueba:** el panel se cerraba si se abría antes de que terminara la primera navegación de la app (el guard espera el refresh). Ahora solo lo cierra una navegación que empezó con el panel abierto (prueba unitaria).
- **Videos de ayuda** (`npm run help:record`, `playwright.help.config.ts`, `help-recording/`):
  - Cinco pantallas de captura a 1024 × 640 en `public/help/`: ajuste, consumo, pedido de sucursal, conteo y cierre de producción (5.6 MB en total). Se descargan solo al abrir el panel; si falta uno, el panel lo oculta.
  - Las escenas **no guardan nada**: se detienen antes de confirmar y cancelan el conteo y la OP que usan.
  - Recepción de traspaso y de compra quedan sin video: grabarlas exigiría mover inventario antes.
  - Requiere el ffmpeg de Playwright (`npx playwright install ffmpeg`, instalado con permiso del usuario el 2026-10-18).
- **Accesibilidad con axe** (E2E 14, `21-accessibility`): WCAG 2.1 A/AA, falla con serious/critical, en **claro y oscuro**, sobre login, tablero, existencias, órdenes, plan, resumen, traspasos, OC, artículos, nuevo ajuste, nuevo pedido de cliente y análisis de consumo. Correcciones de contraste:
  - Selector de ubicación de la barra verde: el velo pasa de blanco a negro en claro.
  - Token `--pan-link`: el primario en claro y #90BEFE en oscuro, porque el #4F86FF sobre tarjeta oscura no llega a 4.5:1. Lo usan `.row-link`, el "por producir" del plan, las versiones empaquetadas, la opción elegida del menú de tema y los botones de texto y delineados (`mat.button-overrides`).
- **Lighthouse** (`npm run lighthouse`, `playwright.lighthouse.config.ts`): accesibilidad con emulación móvil sobre un Chrome con la sesión abierta. **100** en login, tablero, recepción de traspaso y cierre de producción, verificando que cada pantalla no terminó en el login. La OP que necesita se cancela.
- **Sin scroll horizontal a 360 px** (`23-responsive`, 52 pantallas, página y contenedor del shell). Tres pantallas nuevas lo tenían:
  - El tablero: la tabla oculta de la gráfica; ahora el `pan-sr-only` va en un contenedor.
  - El análisis de consumo y el resumen: su `:host` en grid crecía al ancho mínimo de la tabla; ahora `minmax(0, 1fr)`.
  - `.pan-sr-only` ahora lleva `left: 0`, para que una etiqueta oculta dentro de una tabla con scroll propio no ensanche la página.
- **Tema** (E2E 15): elegir Oscuro persiste al recargar; "Según el sistema" sigue al sistema en vivo y tras recargar. **Ayuda** (E2E 16): abrir, foco en el título, video que carga, Esc devuelve el foco, se cierra al navegar y el tema sigue a la pantalla.
- El build de producción con Caddy quedó verificado en B-25.
- Pruebas: 162 unitarias; suite E2E 45 en verde (21 omitidas por diseño: las que solo aplican a un ancho). Paquetes nuevos (dev): `@axe-core/playwright` 4.14.0 (MPL-2.0) y `lighthouse` 13.5.0 (Apache-2.0), anotados en `docs/licencias.md`.
- **Frontend completo** (F-01..F-25). Sigue la ampliación de trazabilidad: B-28 y F-26.

### B-28 (2026-10-18)

- **D-11 decidida con el usuario:** `inventory.traceability` para Administrador, Dirección, Jefe de producción y Almacén planta; las sucursales no.
- **Verificación previa** (trazabilidad §3.1 y §3.3, sin cambios):
  - `GoodsReceiptLine.LotId` ya existía desde B-16 (sin relleno).
  - Al despachar, cada lote es una línea del traspaso (`transfer_line.lot_id` hace de `transfer_line_lot`) y la recepción captura cada lote, con su `TransferIn` por lote; el faltante queda en el lote que se indica.
  - Consumo, ajustes y conteos parten por FEFO con lote en el movimiento.
  - El cierre guarda los lotes que FEFO tomó realmente.
- **Migración `AddTraceability`:**
  - Índice `inventory_movement(lot_id, location_id) INCLUDE (type, quantity, occurred_at)`, que reemplaza el de `lot_id`. Los demás de §3.2 ya existían.
  - Tabla `security.known_permission`, con los 36 permisos existentes como base.
  - **La semilla otorga un permiso nuevo una sola vez** a los roles de sistema que lo incluyen y lo registra, para no pisar lo que el cliente cambie en sus roles. Verificado en la BD de desarrollo: solo esos cuatro roles.
  - Parámetro `traceability.max_nodes` (100–10,000, 2,000).
  - `AuditAction.Queried`: cada consulta queda en la bitácora (RN-109).
- **`/traceability/graph`** (RN-100..RN-109):
  - Entradas: lote, OC, OP, traspaso o remisión, con la dirección por omisión de RN-100.
  - `TraceGraphBuilder` arma el grafo en memoria por niveles: hacia atrás (cierre que produjo, lotes que consumió, recepciones con OC y proveedor, ajuste o conteo de origen) y hacia adelante (cierres que consumieron, lotes producidos, traspasos con lo recibido y el motivo, remisiones y clientes).
  - Existencia por lote en cada planta o sucursal, agrupando sus subalmacenes y sin vales internos: entradas, salidas por tipo, existencia y kardex (máx. 50).
  - OP como grupos (historial de estados y pedidos que atiende), bitácora cronológica, y resumen de retiro: orígenes, lotes terminados, ubicaciones, clientes y pérdida en tránsito.
  - Avisos `no_lots`, `truncated`, `unlotted_components` y `missing_receipt_link`.
  - Campos de la ficha de `trazabilidad-ui.md` §8. Costos y precios en null sin `production.view` o `purchasing.view`.
  - No filtra por el alcance del usuario (RN-109).
- **`TraceabilityQueries`:** una consulta por tipo de liga y nivel (`= ANY(@ids)`). Lookups `/traceability/lots/lookup` y `/traceability/sources/lookup` (folios OC-, OP-, TR-, RM- o número de lote).
- **Pruebas:**
  - **Unitarias:** ciclo, `maxDepth`, límite de nodos, consultas en lote, resumen con existencia y pérdida en tránsito, sin lote, eventos con empate por folio, costos sin permiso y dirección por entrada.
  - **Integración** (`TraceabilityTests`, escenario §9 por API):
    - Hacia atrás desde TR2: las dos OC de harina con 62, 28.1 y 85.0944 kg, el azúcar 10 bultos = 500 kg, el agua sin lote.
    - Hacia adelante desde la harina más antigua: TR1 1,200 y TR2 600, SUC-01 y SUC-02, sin SUC-03; desde su OC, el mismo grafo.
    - Resumen de la OP: PLANTA 400, SUC-01 1,200, SUC-02 990, SUC-03 900, pérdida 10 en el lote -02.
    - Dos niveles hasta el cliente.
    - 403 al encargado; 200 al almacén con solo la planta y sin costos; lookups; 404 y 400; bitácora; semilla D-11; OP sin cierres → `no_lots`.
  - **Rendimiento:** 802 nodos en ~200 ms (`docs/rendimiento.md`).
  - Backend: 282 unitarias y 167 de integración en verde.
- **Desviaciones del spec, anotadas:**
  - `transfer_line_lot` es `transfer_line` (un lote por línea).
  - El nodo de recepción es por recepción y lote.
  - El origen sin proveedor se llama `InitialStock` y cubre ajustes y conteos.
  - Los ≈ 1,500 nodos estimados son 802 con el mismo volumen.
- Specs actualizados según trazabilidad §8: `dominio.md` (glosario, `LotId` de la recepción, RN-100..RN-109, permiso, roles, parámetro y D-11), `backend.md` (índices, endpoints, pruebas, B-28) y `frontend.md` (rutas, componentes, tokens, E2E 17, F-26).
- Frontend: tipos regenerados, etiquetas de los enums de trazabilidad y de la acción "Consulta" en la bitácora.
- Sin paquetes nuevos.

### F-26 (2026-10-18)

- **Rutas y menú:** `/inventario/trazabilidad` (búsqueda) y `/inventario/trazabilidad/:tipo/:id?direccion=atras|adelante|ambas` (resultado), con [inventory.traceability]; entrada "Trazabilidad" en el menú de Inventario (ícono `account_tree`).
- **Búsqueda:** un campo con autocompletado (`/traceability/sources/lookup`) que muestra el tipo de cada resultado; la dirección se pone sola según RN-100 al elegir la entrada.
- **Resultado:**
  - Encabezado con la entrada, "Estado al", los avisos (`truncated`, `unlotted_components`, `missing_receipt_link`), "Otra búsqueda" y "Exportar CSV".
  - Estados: skeleton, vacío con `no_lots` ("Esta OC todavía no tiene recepciones", "Esta OP todavía no tiene cierres"), error con "Reintentar" y "No se encontró".
  - Tres pestañas (Mapa, Resumen, Bitácora); en celular abre en Resumen.
  - Cambiar la dirección solo cambia el resaltado y reescribe `?direccion=`. Si la respuesta era de una sola dirección, vuelve a consultar con ambas.
- **Mapa** (`trazabilidad-ui.md`), lógica en funciones puras con pruebas:
  - `trace-layout.ts`: carriles fijos, con los de semiterminado por nivel; compactación de §4.4; orden por baricentro, con los grupos juntos y paso mínimo; puertos apilados; grosor por `maxQty`; etiquetas en la curva.
  - `trace-selection.ts`: cadena hacia atrás, hacia adelante o completa, sin mezclar ramas; selección de grupo; barra de selección; flechas.
  - `trace-text.ts`: los cuatro renglones de cada tarjeta.
  - `trace-detail-model.ts`: las estadísticas y secciones de cada ficha.
  - `trace-events.ts`: bitácora por día y CSV con BOM (eventos y resumen).
- **Componentes:**
  - `app-trace-graph`: SVG con `role="img"` y `aria-label` que resume la cadena; zoom de 45 a 130 % y "Ver todo", que es el inicial en pantallas de 1,400 px o más; zoom recordado en `localStorage` con try/catch; arrastre con el mouse, sin que el arrastre cuente como clic; vista previa al pasar el cursor; Esc en dos pasos.
  - Ficha: overlay conectado en escritorio y tableta (derecha, si no izquierda, si no abajo o arriba, empujada dentro de la ventana); `MatBottomSheet` en celular. El foco va al título al abrir y regresa a la tarjeta al cerrar.
  - `app-trace-card`: `button` con `aria-pressed`.
  - `app-trace-detail` con `app-trace-stats`, `app-trace-meter` y `app-trace-stack`.
  - `app-trace-summary`: en celular cada fila es tarjeta.
  - `app-trace-log`: renglón enfocable que lleva a su tarjeta en el mapa.
  - Tokens `--pan-trace-*` en claro y oscuro.
- **Accesos directos "Rastrear"** (`app-trace-link`, solo con el permiso): encabezados de OP, OC, traspaso y remisión despachada; cada cierre de la línea de tiempo de la OP; cada línea con lote de la recepción; lotes de Existencias y filas con lote del kardex.
  - Para el de los cierres, `ProductionCloseListItemDto` ganó `OutputLotId` (campo opcional al final; sin migración).
- **Ayuda** para las dos rutas y video `trazabilidad.webm` (`npm run help:record`; solo consulta, usa la cadena que deja la E2E 24).
- **Pruebas:**
  - Unitarias (frontend 187): `trace-layout.spec.ts` y `trace-detail.spec.ts`.
    - Carriles, compactación, orden del escenario de referencia, separación, grupos, diferencia "390 de 400 pza", grosor, puertos y semiterminados en dos niveles.
    - Grafo solo hacia adelante: todos los carriles bajo el encabezado (regresión).
    - Selección desde HT-2609-C: 1 cierre, 1 lote terminado, 2 traspasos, SUC-01 y SUC-02, 1,800 pza. Sin mezclar ramas, grupo y flechas.
    - Fichas de cada tipo; sin permiso de costos no hay estadística ni columna de costo.
    - Textos de tarjeta, bitácora en hora de la planta, CSV, avisos, lado de la ficha.
    - Componente: Enter, flechas, Esc en dos pasos y regreso del foco.
  - **E2E 24 `24-traceability`** (es la "E2E 17" del spec; el 17 ya era el de requerimiento de materiales). Arma por API:
    - Dos lotes de harina en dos OC.
    - Una OP con dos cierres (FEFO toma primero la harina vieja).
    - Tres traspasos a SUC-TZ1..3, sin dejar saldo.

    Después:
    - Busca la OP y abre el mapa.
    - La ficha de la harina vieja muestra 5 kg en su cierre.
    - "Destino" deja SUC-TZ3 atenuada y la barra suma 50 pza enviadas.
    - axe sin violaciones serias con la ficha abierta, en claro y oscuro.
    - Esc cierra y el foco vuelve a la tarjeta; el segundo Esc quita la selección.
    - A 1024 px la ficha de una tarjeta del carril 7 abre a la izquierda.
    - La Bitácora lleva a la tarjeta.
    - A 390 px abre en Resumen, sin scroll horizontal, y la ficha es hoja inferior que se cierra con el fondo.

    **Mueve inventario.**
- **Errores encontrados con las pruebas y corregidos:**
  - `daysTo` no restaba 1 al mes.
  - Un grafo solo hacia adelante dejaba sus primeros carriles sin ordenar.
  - Un lote sin cierre en el grafo mostraba 0 pza.
  - El Esc del overlay y el del mapa se sumaban.
  - Un clic en los controles cerraba la ficha.
  - La ficha prefería abrir arriba en tableta.
  - **Barra de acciones (todas las pantallas):** en tableta y escritorio, el botón de ayuda tapaba el botón de la derecha cuando la barra quedaba al fondo de la ventana. La E2E 7 lo mostró con "Liberar". Ahora la barra deja libre la columna del botón de ayuda (`padding-right: 64px` desde 768 px).
- **Desviaciones del spec, anotadas:**
  - **Componentes de la ficha:** en vez de un componente por tipo hay una función por tipo (`trace-detail-model.ts`) y un solo componente que pinta el modelo, con las tres piezas compartidas. Es igual de probable por tipo y evita nueve plantillas casi iguales.
  - **Encabezado del cierre:** la tarjeta dice "Cierre · #1" y la etiqueta Parcial o Final, para que no se corte.
  - **Contraste de lo atenuado:** lo que la selección atenúa lleva la clase `dimmed` y axe lo excluye. Es contenido incidental fuera de la cadena (WCAG 1.4.3); lo resaltado y la ficha sí se revisan.
  - **Alerta de caducidad en la tarjeta:** usa el default de `inventory.expiry_alert_days` (3), porque el grafo no trae el parámetro.
- Sin paquetes nuevos.

### D-07: un solo SKU por artículo (2026-10-18)

- **Cambio pedido por el usuario:** el artículo deja de tener SKU y SKU interno; queda solo `Sku`, que hace todo lo que hacía el SKU interno.
- **Backend:**
  - `Item`, `ItemDefinition`, DTOs, `ItemRules` (sin `NormalizeInternalSku`), búsqueda y validación de unicidad sin `InternalSku`.
  - Importación de OP: la columna `sku_interno` pasa a `sku` (plantilla e instrucciones incluidas). Archivos viejos con `sku_interno` fallan por columna obligatoria faltante (decisión del usuario).
  - CSV de artículos: sin columna `sku_interno` ni filas omitidas; `ItemImportResult` pierde `Skipped`.
  - Migración `RemoveInternalSku`: copia `internal_sku` a `sku` (decisión del usuario; el SKU anterior se pierde), reconstruye `ix_item_sku` alrededor del `UPDATE` para que los valores cruzados entre artículos no choquen y borra la columna. `Down` repone `internal_sku` con el SKU actual. Probada en la BD local, con dos artículos de SKU cruzados, hacia arriba y hacia abajo.
- **Frontend:** formulario sin el campo (la nota "El código de Paníssimo; la importación de OP lo usa." pasa al SKU), lista sin la columna, guía del CSV, ayuda, tipos regenerados y fixtures E2E (CSV y los dos `.xlsx`, regenerados con `scripts/e2e-fixtures.py`). La etiqueta de auditoría `InternalSku` se conserva para el historial anterior.
- **Plantilla CSV de artículos** (`items-import-page.ts`): las filas de ejemplo todavía traían el SKU interno en la 2.ª posición y corrían todas las columnas. Ahora usan como SKU el antiguo código (`MP-001`, `PT-010`, `PT-011`) y el empaquetado apunta a `PT-010`. `items-import-page.spec.ts` revisa que cada fila tenga un valor por columna, que solo existan `sku` y `sku_granel` y que el `sku_granel` exista en la plantilla.
- **Pruebas:** backend 282 unitarias en verde; frontend 190 unitarias, lint y build en verde. **Integración y E2E no se corrieron:** Docker no está instalado en esta máquina (Testcontainers). Correrlas antes de dar por cerrado.

### Existencias: filtro por ubicación (2026-10-18)

- **Pedido del usuario:** filtrar Existencias por ubicación.
- **Backend:** `GET /stock` acepta `rowLocationId`, que deja solo los renglones de esa ubicación: el total de la planta o sucursal, o uno de sus subalmacenes (RN-46). Si no está entre las ubicaciones de la consulta, se valida el alcance con `EnsureStockAccess` (403 si no hay acceso). Sin migración.
- **Frontend:** select "Ubicación" en `/inventario/existencias` con "Todas", "Total de <ubicación activa>" y cada subalmacén (`código · nombre`). Solo aparece si la ubicación activa tiene subalmacenes y se limpia al cambiar de ubicación activa. Tipos regenerados.
- **Pruebas:** `WarehouseTotalsTests` revisa el filtro (solo el total de la planta y solo un subalmacén); no se corrió (sin Docker). Frontend 190 unitarias y lint en verde. Verificado contra la API local: Planta 45 renglones, con el filtro 9 de PLANTA o 9 de PLANTA-MP; una ubicación ajena da 403.

### Menú lateral: secciones plegables (2026-10-18)

- **Pedido del usuario:** cada sección del menú (General, Inventario, Producción…) se pliega y despliega con animación.
- **`shell.html` / `shell.ts` / `shell.scss`:**
  - El encabezado de cada sección es un `button` dentro del `h2`, con `aria-expanded` y `aria-controls`, y un chevron SVG que gira (sin ligadura de ícono, para no ensuciar el nombre accesible).
  - El grupo anima su altura con `grid-template-rows` (0fr → 1fr, 280 ms, `cubic-bezier(0.2, 0, 0, 1)`). Los renglones aparecen escalonados (opacidad y desplazamiento, 25 ms por renglón). Plegado queda `inert`, fuera del orden de tabulación.
  - Estado por dispositivo en `localStorage` (`pan.sidebar.closed`, con try/catch).
  - Al navegar a una página de una sección plegada, esta se abre (`sectionOf`, gana la ruta más larga). Si el usuario pliega la sección actual, un punto lo indica.
  - Con el sidebar contraído a íconos no hay encabezados: todas las secciones quedan abiertas.
  - `prefers-reduced-motion`: sin transiciones.
- **Pruebas:** `app.spec.ts` suma plegar y desplegar (`aria-expanded`, `inert`, `localStorage`) y `sectionOf`. Frontend 192 unitarias, lint y build en verde. Revisado en Chrome: plegar General e Inventario, punto en la sección actual, se reabre al volver a Existencias y el modo de íconos muestra todo. La E2E 01 (encabezados por rol) debería seguir en verde porque los encabezados conservan su texto; no se corrió.

### Tipo de ubicación Fábrica, RN-48 (2026-10-18)

- **Decisión del usuario:** la Fábrica es el piso de producción, **hija de la Planta**. La OP sigue siendo de la Planta. Con fábrica activa, los cierres consumen **solo** de la fábrica y dejan el producto **solo** en ella; materia prima y producto se mueven con vales internos. La ubicación existente `FABRICA` ("Fabrica PT") se convirtió a Fábrica.
- **Backend:**
  - `LocationType.Factory` (se guarda como texto en `varchar(20)`: sin migración; `has-pending-model-changes` limpio).
  - `Location.Factory(...)`: solo con padre `Plant` (`factory_parent_invalid`, `factory_parent_required`). `IsWarehouse` ahora cubre subalmacén y fábrica (existencia de su padre, vales internos, desactivar con existencia); `IsFactory` nuevo.
  - `Location.EnsureProductionFloor` + `WarehousePicker.EnsureProductionFloor`: el cierre rechaza con 422 `close_requires_factory` el consumo o la salida fuera de una fábrica cuando la planta tiene una activa.
  - Alta de ubicación: `parentLocationId` obligatorio para `Factory`; el lookup de plantas y sucursales excluye fábricas; `WarehouseDto` gana `Type` (al final). Trazabilidad: la fábrica cuenta como parte de su planta.
- **Frontend:**
  - Catálogo de ubicaciones: tipo "Fábrica" con el campo "Planta" (solo plantas).
  - Etiqueta `Factory: 'Fábrica'`. La fábrica no aparece como ubicación activa ni como destino de traspasos.
  - Cierre: con fábrica, "Consume del subalmacén" y "El producto entra a" solo ofrecen fábricas (se preseleccionan si hay una sola), con una nota sobre los vales internos.
  - Vales internos, existencias y kardex la incluyen sin cambios, por ser hija de la Planta.
- **BD local:** `FABRICA` pasó de `Warehouse` a `Factory` con un `UPDATE` directo (no tenía existencia; sin renglón de auditoría). No es migración: en otra BD, convertir a mano o dar de alta la fábrica.
- **Pruebas:**
  - Backend: 284 unitarias en verde (`LocationTests`: padre de la fábrica y `EnsureProductionFloor`).
  - Integración: `WarehouseProcessTests.With_a_factory_a_close_consumes_from_it_and_delivers_to_it` (mueve inventario; no se corrió, sin Docker).
  - Frontend: 192 unitarias, lint y build en verde.
  - API local: los subalmacenes de PLANTA listan `FABRICA` como `Factory`; una fábrica sin padre da 400; un cierre desde PLANTA-MP da 422 `close_requires_factory` y desde FABRICA pasa la regla (falla por existencia, como debe). La OP de prueba quedó cancelada.

### Receta ligada a fábrica, RN-49 (2026-10-18)

- **Decisiones del usuario:**
  - La receta se liga a una fábrica, que define el origen de los componentes y el destino del producto.
  - Es obligatoria cuando la planta tiene fábrica.
  - Cambiarla no crea versión.
  - El cierre no puede elegir otra ubicación.
- **Backend:**
  - `Recipe.FactoryId` (FK a `org.location`, restrict), `AssignFactory` y `HasFormula`.
  - `RecipeRules.EnsureFactory` y `ProductionFloor.EnsureAsync`.
  - Recetas: `factoryId` opcional al final de `CreateRecipeRequest`/`UpdateRecipeRequest`. Debe ser una fábrica activa y es obligatoria si `PLANTA` tiene una activa.
    - Si solo cambia la fábrica de una receta usada, se queda en su versión, y la fábrica se copia a todas las versiones del artículo.
    - `RecipeDto` gana `FactoryId/Code/Name` y la lista, `FactoryCode`.
  - OP: crear (manual, plan e importación, una revisión por planta y fábrica) y editar el borrador validan RN-49. `ProductionOrderDto` gana `FactoryId/Code/Name`. La disponibilidad de las líneas y de la explosión sale de la fábrica.
  - Cierre: usa la fábrica de la receta para el consumo y la entrada del producto. Otra ubicación da 422 `close_factory_fixed`.
  - Migración `AddRecipeFactory`: columna, índice, FK y llenado con la fábrica de PLANTA cuando hay exactamente una activa. Probada en la BD local, hacia abajo y hacia arriba: la receta de PT-020-DONA quedó con FABRICA.
  - RN-48 se conserva como respaldo; con RN-49, una OP sin fábrica ya no llega al cierre en una planta con fábrica.
- **Frontend:**
  - Receta: campo "Fábrica" (obligatorio si la planta tiene fábricas; preseleccionado si hay una sola) y columna en la lista.
  - Al guardar, la confirmación de nueva versión solo sale si cambió la fórmula; el aviso lo explica.
  - Nueva OP: "Se produce en FABRICA: la disponibilidad es la de esa fábrica" y el aviso de faltantes nombra la fábrica.
  - Cierre: con fábrica en la receta, en vez de los dos selectores muestra "Se produce en … la fábrica de la receta".
- **Pruebas:**
  - Backend 286 unitarias en verde (`RecipeTests`: `HasFormula` y `EnsureFactory`).
  - Integración `WarehouseProcessTests.A_recipe_with_a_factory_consumes_from_it_and_delivers_to_it`: receta sin fábrica rechazada en OP, disponibilidad de la fábrica, `close_factory_fixed`, cierre sin elegir que usa la fábrica, cambio de fábrica sin versión y vale interno de salida. Mueve inventario; no se corrió (sin Docker).
  - Frontend 192 unitarias, lint y build en verde.
  - Revisado en Chrome: receta con su fábrica, nueva OP con la leyenda y el faltante de la fábrica.
- **Pendiente:**
  - La E2E corre contra la BD de desarrollo. Si esa BD tiene fábrica en PLANTA (la local sí, FABRICA), las E2E que crean recetas sin `factoryId` (`e2e/support/api.ts`) fallarán. Hay que mandar la fábrica o correrlas en una BD limpia.
  - La importación de OP no marca RN-49 por renglón en la vista previa; el error sale al importar.

### Origen por renglón, reserva y vales de ingredientes, RN-110..112 (2026-10-19)

- **Pedido del usuario:** elegir el subalmacén de origen por componente de la OP, reservar lo necesario para que otro proceso no lo tome, y generar vales hacia la fábrica para que el panadero pida los ingredientes.
- **Decisiones del usuario:**
  - Se reserva y se generan los vales **al liberar** (no al crear el borrador). Así la importación de planes futuros sigue funcionando.
  - Sin existencia libre no se libera.
  - Un vale por origen.
  - Flujo enviar/recibir.
  - Origen por omisión según el tipo del componente, editable.
- **Numeración:** RN-50 ya era el requerimiento de materia prima y RN-107..109 estaban ocupadas; las reglas nuevas son RN-110 (reserva), RN-111 (origen) y RN-112 (vale).
- **Backend:**
  - `StockReservation` (`inventory.stock_reservation`), `ProductionOrderLine.SourceLocationId`, `Transfer.ProductionOrderId` y `Location.SuppliesTypes` (`text[]`).
  - `InventoryPostingService`: después de calcular, rechaza (422 `stock_reserved`) cualquier salida que deje un (ubicación, artículo) por debajo de lo reservado, salvo el conteo físico. Las reservas borradas en la misma unidad de trabajo, como el envío del vale, ya no cuentan.
  - `LockAsync` nuevo: bloquea las mismas filas (`item_location_cost`, en el mismo orden) para serializar la liberación con las salidas.
  - `ComponentSources`: valida el origen elegido (subalmacén activo de la planta, no fábrica) y da el de omisión por tipo. Lo usan alta y edición manual, plan e importación (`Sources` opcional en los requests).
  - `ReleaseInTransactionAsync` (liberar y "Liberar al importar"): con fábrica en la receta, completa los orígenes faltantes y exige que todos los renglones tengan uno (`production_source_required`). Bloquea, calcula lo libre (sin vencidos − reservado), rechaza con `release_insufficient_stock` y crea un vale por origen con sus reservas. Sin fábrica libera como antes.
  - Cancelar la OP cancela sus vales en borrador y libera las reservas. Enviar o cancelar el vale libera su reserva. Un vale de OP no se edita (`transfer_from_production_order`).
  - `GET /production-orders/component-sources?locationId&recipeId`: opciones por componente con lo libre y la de omisión.
  - DTOs: OP con `Vouchers` y renglones con `SourceLocationId/Code` (en borrador, `Available` = libre en el origen). Vale con `ProductionOrderId/Folio`. Existencias con `Reserved`. Ubicación con `SuppliesTypes`; `UpdateLocationRequest.SuppliesTypes` (null conserva) con un tipo por planta (`supplies_taken`).
  - Migración `AddProductionSupply`: columnas, tabla, índices y FK; `supplies_types` con default `'{}'`. El seed y la migración asignan MP→materia prima, INS→insumo y SEMI→semiterminado en PLANTA.
- **Frontend:**
  - Nueva OP: columna "Origen" por renglón (`código · libre N`), "Libre en origen", faltante contra el origen y aviso de que no se podrá liberar. Sin subalmacenes, la tabla de antes.
  - Detalle de OP: columna Origen y pestaña "Vales de ingredientes" con enlace a cada vale. La confirmación de liberar y de cancelar explica la reserva.
  - Vale: "Orden de producción" con enlace y sin "Editar" si es de OP.
  - Ubicaciones: "Surte por omisión a producción" (selección múltiple; `RecordField.multiple`) y "· surte …" en la lista.
  - Existencias: "N reservado · libre M" bajo la existencia.
- **Migración probada en BD limpia:** `dotnet ef` sin `deploy/.env` usó el respaldo de diseño (`Host=localhost;Database=panissimo_design_time`) y creó esa BD en el Postgres local. Ahí corrieron las 29 migraciones desde cero, y la nueva hacia abajo y hacia arriba. Esa BD sobra: se puede borrar. Después se aplicó a la BD de desarrollo.
- **Pruebas:**
  - Backend 293 unitarias en verde (`StockReservationTests`).
  - Integración `WarehouseProcessTests.Releasing_an_order_reserves_its_ingredients_and_asks_for_them_with_vouchers` (mueve inventario): orígenes por omisión y elegidos, reserva, `stock_reserved`, `release_insufficient_stock`, vale no editable, envío y recepción, cancelación. También se ajustó la de RN-49. No se corrieron (sin Docker).
  - Frontend 192 unitarias, lint y build en verde.
  - API local: 32 opciones de origen para la receta de la dona (MP e INS por omisión); liberar rechazado porque falta IN-001 en PLANTA-INS. La OP de prueba (OP-000002) quedó cancelada.
  - Revisado en Chrome: tabla de orígenes de la nueva OP.
- **Pendiente:**
  - La vista previa de la importación no avisa de la falta de existencia libre; "Liberar al importar" falla al importar.
  - El aviso de faltantes de la nueva OP se calcula en el navegador con las opciones; la validación real es la del backend al liberar.

### Catálogo de vehículos y choferes, RN-113 (2026-10-19)

- **Decisiones del usuario:** campos mínimos, solo del catálogo al despachar y un permiso nuevo de logística.
- **Backend:**
  - Entidades `Vehicle` (placas únicas, normalizadas en mayúsculas y sin espacios; no cambian) y `Driver` (nombre y teléfono opcional), con baja lógica. `FleetRules.EnsureCanDispatch`.
  - `FleetService` y controladores `/vehicles` y `/drivers` (listar con `logistics.view` o `sales.view`; alta y edición con el nuevo `logistics.fleet.manage`, que reciben Administrador, Almacén planta y Distribución con `GrantNewPermissionsAsync`).
  - Despacho: `DispatchTransferRequest` y `DispatchCustomerShipmentRequest` cambian `VehicleDescription/DriverName` por `VehicleId/DriverId`. El documento guarda la liga (`Transfer`/`CustomerShipment.VehicleId/DriverId`) y su copia de texto ("Descripción · PLACAS" y el nombre). El vale interno sigue sin vehículo. Vehículo o chofer inactivo o inexistente: 422 `vehicle_not_available` / `driver_not_available`.
  - Migración `AddFleet` (tablas y FK opcionales). Probada hacia arriba y abajo en `panissimo_design_time` y aplicada a la de desarrollo. Ejemplos OpenAPI.
- **Frontend:**
  - `/logistica/flotilla` "Vehículos y choferes", con pestañas, diálogo de alta y edición y "Mostrar inactivos". Menú de Logística con el ícono `person_check`, porque el subconjunto de íconos es fijo y `local_shipping` ya es de Traspasos. Ayuda de la pantalla.
  - Diálogo de despacho de traspasos y página de remisión: selectores de vehículo y chofer activos (`activeFleet()`), con aviso si el catálogo está vacío.
  - E2E 05, 13, 15 y 24: `api.ensureFleet()` crea "E2E-01 · Camioneta E2E" y "Chofer E2E", y las pruebas los eligen en los selectores.
- **Pruebas:**
  - Backend 296 unitarias en verde (`FleetTests`).
  - Integración nueva `Logistics/FleetTests` (normalización, placas repetidas, inactivo no despacha, copia de texto, permisos). Las pruebas que despachan ahora usan `ApiFactory.VehicleId/DriverId`, sembrados al iniciar. No se corrieron (sin Docker).
  - Frontend 192 unitarias, lint y build en verde; E2E compilan (no se corrieron).
  - Revisado en Chrome: pantalla y diálogo de alta (sin guardar).

### B-29 y F-27: entrega de remisión, RN-114 (2026-10-19)

- **Definición con el usuario:**
  - Destino por renglón: regresa o es merma.
  - Lo rechazado reabre el pedido.
  - Permiso nuevo `sales.shipments.deliver`.
  - Sin evidencia adjunta.
  - Se reutiliza el ajuste `CustomerReturn` de D-08 para lo que regresa.
  - Specs: `dominio.md` (RN-114, entidad `CustomerShipmentRejection`), `backend.md` (B-29) y `frontend.md` (F-27).
- **Backend:**
  - `CustomerShipmentStatus` agrega `Delivered` y `DeliveredWithDiscrepancies` (la columna `status` pasa de 20 a 30 caracteres). Enums `ShipmentRejectionReason` y `RejectionDisposition`.
  - `CustomerShipment.Deliver`:
    - Solo desde `Dispatched`; fecha entre el despacho y ahora; quién recibió es obligatorio.
    - Rechazos por lote, o por línea sin lotes: lo rechazado no excede lo enviado, `Other` exige nota y el destino es coherente con el subalmacén.
    - La entrega es final. `IsDispatched` cubre los tres estados.
  - `CustomerOrder.RegisterRejection`: baja `ShippedQty` y recalcula el estado (`Shipped` pasa a `PartiallyShipped`); un pedido cerrado o cancelado no se toca.
  - `POST /customer-shipments/{id}/deliver` (`sales.shipments.deliver`; Administrador, Almacén planta y Distribución):
    - El regreso se resuelve con `WarehousePicker` (RN-45).
    - Lo que regresa crea, en la misma transacción, un ajuste `CustomerReturn` por subalmacén, con mismo lote y costo de salida (`AdjustmentService.CreateInTransactionAsync`, vía el motor).
    - La merma no mueve nada; se valúa al costo de salida.
  - DTO con `DeliveredAt`, `DeliveredByName` y `Rejections` (lote, motivo, destino, ajuste, valor). El "remisionado previo" descuenta lo rechazado. Pestaña `ToDeliver`. La trazabilidad incluye las remisiones entregadas.
  - Migración `AddShipmentDelivery`, probada arriba y abajo en `panissimo_design_time` y aplicada a la de desarrollo. Ejemplo OpenAPI.
- **Frontend:**
  - `DeliveryDialog` (fecha y hora, recibió y, por lote enviado, rechazado con motivo, destino, subalmacén y nota; validador `rejectionValidator`) y confirmación con resumen.
  - "Registrar entrega" en la remisión despachada.
  - Sección "Rechazos en la entrega", con enlace al ajuste de devolución y el valor oculto al imprimir; "Entregada" y "Recibió" en los datos y en la impresión.
  - Pestaña "Por entregar", etiquetas y colores de estado y ayuda de la remisión.
- **Pruebas:**
  - Backend 300 unitarias en verde (`ShipmentDeliveryTests`).
  - Integración en `CustomerShipmentTests` (100 pza: 10 regresan y 5 de merma; ajuste de +10 a 2.5; pedido con 85 remisionadas en `PartiallyShipped`; entrega sin rechazos; permisos; segunda entrega rechazada). No se corrió (sin Docker).
  - Frontend 194 unitarias, lint y build en verde.
  - E2E 15 ampliada con la entrega y 1 pieza que regresa (compila; no se corrió).
  - API local: `deliver` con fecha futura sobre RM-000001 → 422 sin cambios.
  - Chrome: diálogo revisado y cancelado; RM-000001 sigue despachada.

### Trazabilidad: rechazo en la entrega (2026-10-19)

- **Pedido del usuario:** que el retorno de lo rechazado se vea en el mapa. Diseño elegido: una tarjeta de rechazo en el carril Destino, sin arista hacia atrás.
- **Backend:**
  - `TraceNodeType.Rejection` y `TraceEdgeKind.Rejected`.
  - `TraceShipmentLot` gana `DeliveredAt`, `ReturnedQty`, `LostQty`, `ReturnLocationCodes` y `ReturnFolios`. `ShipmentLotsAsync` los llena con los `CustomerShipmentRejection` del lote, el subalmacén y el folio del ajuste.
  - El grafo:
    - "Entregado" al cliente lleva solo lo aceptado.
    - La arista `Rejected` va a `rej:{remisión}`, con lo que regresó y lo que fue merma.
    - La remisión gana `DeliveredAt`.
    - La bitácora agrega el evento "Rechazo de {cliente}".
  - `TraceNodeDto` gana `ReturnedQty`, `LostQty`, `ReturnLocationCodes` y `ReturnFolios`.
- **Frontend:**
  - Tarjeta `rejection` en Destino (ícono `move_to_inbox`; "Regresó" o "Merma"; "15 pza rechazadas"; "10 pza a PLANTA-PT · 5 pza merma"). La arista se dibuja como diferencia; la leyenda dice "Diferencia o rechazo".
  - La remisión muestra la etiqueta "Entregada" o "Con rechazo".
  - Ficha "Rechazo en la entrega" (rechazado, regresó, merma, entrega, ajuste de devolución) con enlace a la remisión. Etiquetas de los enums.
- **Specs:** `trazabilidad.md` §4 (regla) y `trazabilidad-ui.md` (arista y tarjeta).
- **Pruebas:**
  - Backend 301 unitarias en verde (`TraceGraphBuilderTests`: tarjeta, aristas y evento).
  - La integración de la entrega ahora revisa también el mapa (85 al cliente, 15 rechazadas, 10/5 y el folio del ajuste); no se corrió.
  - Frontend 196 unitarias (`trace-rejection.spec.ts`: carril, tipo de arista, textos y ficha), lint y build en verde.
  - No se revisó en Chrome con datos reales: la base local no tiene remisiones entregadas con rechazo (RM-000001 sigue despachada).

### Corrida de integración y E2E (2026-10-19)

- **Docker:** Colima instalado con Homebrew (`brew install colima docker`, `colima start --cpu 4 --memory 6`). Para Testcontainers:
  `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 dotnet test`.
- **Integración: 172 en verde y 1 omitida (volumen).** La primera corrida dio 20 fallas (`vehicle_not_available`): `ApiFactory.VehicleId/DriverId` eran estáticos y la colección de volumen, con su propia fábrica y BD, los sobrescribía. Ahora se siembran con ids fijos en cada BD.
- **E2E contra la BD de desarrollo (con FABRICA): 46 en verde y 22 omitidas por diseño.** Ajustes:
  - **Error real:** "Registrar entrega" mandaba la hora con precisión de minuto. En el mismo minuto del despacho quedaba "antes" que él (el despacho guarda microsegundos y `Date` solo milisegundos). `deliveryInstant` manda el milisegundo siguiente al despacho; prueba en `delivery-dialog.spec.ts`.
  - **RN-49:** `api.factoryId()`. Las recetas de las E2E 06, 07, 08, 16, 17, 19 y 24 mandan la fábrica de la Planta si tiene una.
  - **RN-112:** `api.sendIngredients(orderId)` envía y recibe los vales de una OP liberada. Las E2E 07 y 24 lo usan con fábrica, cierran sin elegir subalmacén y la 24 despacha desde la fábrica.
  - **E2E 06:** el texto del aviso de versión cambió ("… creará la versión N").
  - **Limpieza de restos de corridas fallidas en la BD de desarrollo:** se canceló OP-000010 ("E2E 24", liberada con reserva) y se dio de baja la harina E2E-TZ sobrante de PLANTA-MP con el ajuste AJ-000013. Si no, FEFO la tomaba antes que la de la corrida.
- **Otros:** backend 301 unitarias y frontend 197 unitarias, lint y build en verde. Sin commit de estos ajustes todavía.


### Ajustes de UI y RN-115: qué viaja en un traspaso (2026-10-19)

- **RN-115 (nueva, decidida con el usuario):** un traspaso entre ubicaciones, en cualquier ruta (también sucursal → sucursal y devoluciones), solo lleva producto terminado (granel o empaquetado) e insumos; 422 `transfer_item_not_allowed` al crear o editar con materia prima o semiterminado. Los vales internos (RN-47, RN-112) no se limitan. `dominio.md` §Logística.
  - Backend: `TransferRoutes.IsShippable` y la validación en `TransferService.ValidatePlanAsync`.
  - Frontend: el buscador del formulario de traspaso filtra a `FinishedGood` y `Supply` y se llama "Producto o insumo".
- **Menú lateral:** `mat-sidenav-container` con `autosize`: el contenido se recorre al cambiar entre menú completo y solo iconos (antes quedaba tapado).
- **OP, campo Origen:** el selector de subalmacén de origen se dibuja como control (borde, fondo, flecha en color primario, hover y foco) para que se note que se puede cambiar.
- **Pruebas:** backend 305 unitarias (`Transfers_carry_finished_goods_and_supplies`) y 173 de integración en verde (+1 omitida); `Transfers_reject_raw_materials_and_semi_finished_goods_on_every_route` es nueva y cuatro pruebas de traspaso pasaron de harina a insumos. Frontend 197 unitarias y `ng lint` en verde. La E2E 05 usa un insumo y la nueva etiqueta; no se corrió.
- **Pendiente:** `npm run lint` marca CRLF en archivos de Windows (`core.autocrlf=true`); falta `* text=auto eol=lf` en `.gitattributes`.

### Catálogos base de desarrollo y demo; las E2E trabajan sobre ellos (2026-10-19)

- **Decisiones del usuario:** los catálogos actuales de la BD de desarrollo son la base que se conserva; se cargan al arrancar solo en desarrollo y demo; las E2E corren contra la misma BD de desarrollo y usan esos registros; se quitan las pruebas de alta (proveedor, cliente, importación válida de artículos).
- **Seed:** `deploy/seed/sample-data.json` (exportado de la BD: 6 ubicaciones hijas y sucursal, 8 categorías, 11 artículos, 2 recetas con fábrica, 2 proveedores con 9 ofertas, 1 cliente con su punto de entrega, 5 vehículos y 5 choferes). `SampleDataSeeder` lo inserta si falta (por código, SKU, RFC, placa o nombre) y nunca sobrescribe; `PAN__Seed__SampleDataFile` en `docker-compose.dev.yml` y en el overlay de demo, vacío en producción. Con el archivo, los subalmacenes de la planta salen de él (ya no se crea PLANTA-SEMI).
- **E2E:** `e2e/support/base-data.ts` con los registros base; `ensureCategory/ensureItem/ensureBranch/ensureSupplierOffer/ensureFleet` se reemplazaron por búsquedas que fallan si falta el dato (`itemId`, `requireLocation`, `supplierOffer`, `fleet`). `addStock` acepta lote. Se borró `10-supplier`, la importación válida de la 02 y el alta de cliente de la 14. La 07 y la 24 se rehicieron sobre la receta de la dona (8 componentes, fábrica FABRICA-PT, una sola sucursal); la 16 y la 17 limpian en `finally`; la 20 solo sube fotos si los artículos no tienen y las quita al final. Fixtures de Excel regenerados con PT-020-DONA.
- **Pruebas:** backend 305 unitarias y 174 de integración en verde (+1 omitida; `SampleDataSeedTests` en su propia BD valida el archivo real, idempotencia y que respeta ediciones). E2E 43 en verde y 21 omitidas por diseño, dos corridas seguidas sin crear catálogos (solo crece una versión de receta por corrida, la de la 06). Verificado en una BD vacía aparte: arranca exactamente con esos registros.
- **Limpieza:** se cancelaron documentos que dejaron corridas fallidas (OP-000112/114, PED-000029/031/034/035).
