# Avance del SGO AR (backend y frontend)

> Bitácora de trabajo para retomar entre sesiones. Última actualización: 2026-10-06 (pendientes técnicos).
> Fuente de verdad de reglas: `docs/specs/dominio.md`; tareas: `docs/specs/backend.md` §12.

## Estado por tarea

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | B-01 Solución, logging, ProblemDetails, health, OpenAPI, Docker | ✅ | `0c4ac5d` |
| 1 | B-02 DbContext, auditoría, timestamps, folios, semilla | ✅ | `fc263ae` |
| 1 | B-03 Login JWT, refresh con rotación, permisos, alcance de ubicación | ✅ | `192bc2f` |
| 1 | B-04 Usuarios, roles, permisos, bitácora (+ ubicaciones GET/PUT) | ✅ | `59e7a8f` |
| 1 | B-05 Unidades, categorías, artículos, mín/máx, CSV de artículos (+ POST ubicaciones) | ✅ | `64b0928` |
| 1 | B-06 Motor de inventario (FEFO, costo promedio, RN-02) | ✅ | `4465c3f` |
| 1 | B-07 Existencias, kardex, alertas, ajustes, CSV de existencias iniciales | ✅ | `7e0c71e` |
| 1 | B-08 Conteo físico y consumo de sucursal | ✅ | `659c74e` |
| 1 | B-09 Traspasos directos (despacho, tránsito, recepción con discrepancias) | ✅ | `64bdfcb` |
| 2 | B-10 Recetas versionadas y explosión teórica | ✅ | `ae9210a` |
| 2 | B-11 Órdenes de producción (completar transaccional) | ✅ | `e12626f` |
| 3 | B-12 Proveedores y artículos de proveedor | ✅ | `3671b24` |
| 3 | B-13 Requisiciones y conversión a OC | ✅ | `150b46d` |
| 3 | B-14 Órdenes de compra, aprobación por umbral, recepción parcial, cierre | ✅ | `dad493a` |
| 3 | B-15 Pedidos de sucursal, sugerido mín/máx, aprobación → traspasos, RN-24 | ✅ | `fa25631` |
| 3 | B-16 Tablero y `/settings` | ✅ | `3f19163` |
| 3 | B-17 Endurecimiento (índices, EXPLAIN, bundle de migraciones, compose prod) | ✅ | (ver `git log`) |

**Backend completo (B-01..B-17).**

### Frontend (`docs/specs/frontend.md` §11) — desde F-03 se trabaja directo en `main`

| Fase | Tarea | Estado | Commit |
|---|---|---|---|
| 1 | F-01 Proyecto Angular 22, Angular Material, es-MX, ESLint/Prettier, proxy, carpetas, Dockerfile | ✅ | (ver `git log`) |
| 1 | F-02 api:types, interceptores, AuthService, login, guardas, `*hasPermission`, ubicación activa | ✅ | (ver `git log`) |
| 1 | F-03 Layout y componentes compartidos | ✅ | (ver `git log`) |
| 1 | F-04 Administración (+ E2E #1 con Playwright) | ✅ | (ver `git log`) |
| 1 | F-05 Catálogos (+ E2E de importación con errores) | ✅ | (ver `git log`) |
| 1 | F-06 Inventario (+ `/items/lookup` en backend, E2E de faltantes) | ✅ | (ver `git log`) |
| 1 | F-07 Conteo físico y consumo (móvil, + E2E en 390 px) | ✅ | (ver `git log`) |
| 1 | F-08 Traspasos directos (+ E2E #3 sin pedido) | ✅ | (ver `git log`) |
| 2 | F-09 Recetas con editor y versiones (+ E2E de nueva versión) | ✅ | (ver `git log`) |
| 2 | F-10 Órdenes de producción con explosión y completar (+ E2E #4) | ✅ | (ver `git log`) |
| 3 | F-11 Proveedores y artículos de proveedor (+ E2E de alta y precio) | ✅ | (ver `git log`) |
| 3 | F-12 Requisiciones y conversión a OC (+ `GET /items/{id}/supplier-offers`, E2E) | ✅ | (ver `git log`) |
| 3 | F-13 Órdenes de compra y recepciones (+ E2E #2) | ✅ | (ver `git log`) |
| 4 | F-14 Pedidos de sucursal con sugerido y aprobación (+ E2E #3 completo) | ✅ | (ver `git log`) |
| 4 | F-15 Tablero (+ Chart.js, filtros por URL en listas, E2E) | ✅ | (ver `git log`) |
| 4 | F-16 Pulido: móvil, accesibilidad (axe + Lighthouse), estados vacíos, build de producción, subconjunto de íconos | ✅ | (ver `git log`) |

**Frontend completo (F-01..F-16).**

**Siguiente paso (al retomar):** backend (B-01..B-17) y frontend (F-01..F-16) terminados. No hay más tareas en
`docs/specs/backend.md` §12 ni en `docs/specs/frontend.md` §11. Pendiente decidir con el cliente: piloto en una sucursal,
contratación del hosting (DigitalOcean, ver `deploy/README.md`) y los puntos de "Pendientes y notas técnicas".
Antes: `API_PORT=8090 docker compose -f deploy/docker-compose.dev.yml up -d` y `npm start` en `frontend/` (Node ≥ 24.15).
La base de desarrollo tiene existencias de ejemplo: AJ-000006 (SUC-01 AZU-001 25 kg) y AJ-000007 (COM HAR-001 lote L-2409 100 kg).

Pruebas al cierre de B-17: **460 en verde** (322 unitarias, 138 de integración, incluida la de rendimiento), sin warnings.
Migraciones (en orden): `InitialCreate`, `AddRefreshTokens`, `AddRoleSystemKey`, `AddCatalog`, `AddInventory`,
`AddAdjustments`, `AddCountsAndConsumptions`, `AddTransfers`, `AddRecipes`, `AddProductionOrders`, `AddSuppliers`, `AddRequisitionsAndPurchaseOrders`, `AddGoodsReceipts`, `AddBranchOrders`, `TuneKardexIndexes`.

## Decisiones acordadas con el cliente

**Decisiones abiertas del dominio (§7)** — ver estado en `dominio.md`:
- ✅ Salidas en sucursal: consumo diario (solo sucursales) + conteo físico.
- ✅ Costeo: promedio ponderado por ubicación.
- ✅ Traspasos especiales permitidos con `logistics.transfers.special` (Administrador, Almacén, Gerente de operaciones).
- ✅ Lotes: por artículo (`TracksLots`).
- ✅ Umbral de OC: **configurable** en `AppSetting` (`purchasing.po_approval_threshold`), comparado contra el
  **subtotal sin IVA**; default `0` (toda OC requiere aprobación) hasta configurarlo en `/settings` (B-16).
- ✅ Días de alerta de caducidad: default 3, editable en `/settings` (B-16).

**Decisiones de implementación aprobadas:**
- Identity (usuarios/roles) se creó en B-02; los roles de sistema se identifican por `system_key` (se pueden renombrar).
- El rol **Administrador** siempre conserva todos los permisos. Anti-escalamiento: nadie otorga/quita permisos o ubicaciones que no tiene, ni administra usuarios con más acceso.
- El rol **Consulta** no ve la bitácora (`*.view` excluye `security.audit.view`).
- Restablecer contraseña: el admin captura una temporal; **sin** cambio forzado al siguiente login.
- Nombres de ubicaciones editables; en el frontend esa pantalla va en el **módulo de Usuarios y permisos**.
- CSV de artículos: encabezados en español (`sku,nombre,tipo,categoria,unidad_base,unidad_compra,factor_compra,maneja_lotes,vida_util_dias,almacenamiento,iva`); categoría inexistente = error (las categorías tienen su pantalla de alta/edición/desactivación); SKU existente se actualiza.
- Motivos de ajuste: Corrección (±, `Adjustment`); Merma/Caducado/Dañado (solo salidas, `Waste`); Uso interno (solo salida, `Adjustment`).
- CSV de existencias iniciales: `ubicacion,sku,cantidad,costo_unitario,lote,caducidad`; un ajuste por ubicación; se rechaza si el artículo ya tiene movimientos ahí.
- Lotes vencidos: se rechazan en despacho, producción y consumo; se permiten en ajustes, mermas y conteos.
- Conteo físico: líneas sin contar al cerrar = error; diferencias contra snapshot (los movimientos durante el conteo se respetan).
- Recetas: explosión de **un nivel**; editar una receta usada crea versión N+1 (`recipeVersion` en JSON; `version` es concurrencia).
- Producción: merma (RN-13) contra el teórico de lo **producido**; consumo real por defecto = ese teórico.
- Proveedores (B-12): RFC con formato SAT (12 moral / 13 física, fecha válida), en mayúsculas y **único**, salvo los
  genéricos `XAXX010101000` y `XEXX010101000` (varios proveedores extranjeros comparten el RFC genérico).
- Artículos de proveedor: baja lógica con `IsActive` (sin DELETE); un artículo por proveedor; solo artículos activos
  (de cualquier tipo); precio por unidad de compra (o unidad base si el artículo no tiene) sin IVA, ≥ 0.
- **Un solo proveedor preferido por artículo** (índice único parcial): marcar uno desmarca el anterior. Una fila
  inactiva nunca es preferida; desactivar un proveedor quita su preferencia en todos sus artículos, y sus artículos
  no se editan hasta reactivarlo. B-13 usará el preferido como proveedor sugerido.
- Requisiciones (B-13): solo **Fábrica y Comisariato** (`Location.CanPurchase`); `NeededBy` no puede ser pasada;
  cantidades en unidad de compra. Línea sin proveedor → toma el **preferido**; un proveedor indicado debe estar activo
  y tener el artículo activo en su catálogo. **Enviar exige proveedor en todas las líneas.** Aprobar y rechazar
  requieren `purchasing.po.approve`; rechazar pide motivo. Cancelar: en Draft, Submitted o Approved.
- Conversión (RN-34): OC agrupadas por **proveedor + ubicación de entrega**; **una línea de OC por línea de
  requisición** (sin sumar, conserva `RequisitionLineId`); precio = `SupplierItem.Price`, IVA = el del artículo;
  fecha esperada = la `NeededBy` más próxima; OC en `Draft`. Todo o nada; proveedor o artículo inactivo lo bloquea.
- La OC en B-13 es mínima (entidad, líneas, totales a 2 decimales redondeados por línea, `GET /purchase-orders`).
  Editar, enviar, aprobar/rechazar, cancelar, cerrar y recibir llegan en B-14.
- OC (B-14): estado nuevo **`Rejected`, final** (desde PendingApproval, con motivo). Cancelar solo en Draft,
  PendingApproval o Approved sin nada recibido; **cerrar solo desde PartiallyReceived**. Solo artículos del
  **catálogo activo del proveedor**; precio vacío = precio de catálogo (editable). Proveedor fijo al editar; las líneas
  que conservan `lineId` mantienen su liga con la requisición. Entrega solo en Fábrica/Comisariato.
- Recepción (B-14): factura opcional; una línea de OC puede repetirse (varios lotes); lote obligatorio si el artículo
  maneja lotes; sin caducidad → la del lote existente o hoy + vida útil; lotes vencidos se rechazan. Costo base =
  precio / factor (sin IVA). Tolerancia de sobre-recepción desde `AppSetting` (default 0 %). Se bloquea la OC
  (`poVersion` + lock de fila): recepciones simultáneas → una 201 y otra 409.
- Pedidos de sucursal (B-15): solo sucursales piden, a Fábrica o Comisariato; cualquier artículo activo; fecha
  requerida no pasada; cantidades en unidad base. Aprobar crea **un** traspaso Draft ligado (`branch_order_id`, ahora con
  FK) con lo aprobado (0..solicitado; todo en 0 → rechazar). El origen puede editar ese traspaso sin cambiar destino,
  sin artículos ajenos y sin pasar de lo aprobado. Cancelar ese traspaso **cancela el pedido**. RN-24 cuenta lo
  **despachado** (faltante en tránsito queda en el traspaso) → `Fulfilled`; si se mandó menos → `PartiallyFulfilled`
  (final). Sugerido: proyectado = existencia + en tránsito + pedidos enviados/aprobados sin despachar; si ≤ mín →
  máx − proyectado. Visibilidad: sucursal u origen en alcance; aprobar/rechazar exige alcance sobre el origen.
- `/settings` (B-16): lista tipada (clave, etiqueta, tipo, límites, decimales, versión) de los 3 parámetros; PUT
  parcial con versión por parámetro (409). Límites: umbral OC 0–99,999,999 (2 dec.), tolerancia 0–100 % (2 dec.),
  días de caducidad 0–365 enteros. Sin migración.
- `/dashboard` (B-16): solo autenticado (spec); cada bloque es `null` sin su permiso (`inventory.view`,
  `logistics.view`, `logistics.orders.approve`, `logistics.orders.create`, `purchasing.po.approve`, `production.view`);
  gráfica de bajo mínimo por ubicación solo con `locations.all`. Sin `locationId` suma todas las ubicaciones del alcance.
- Despliegue (B-17): imágenes construidas **en el Droplet** (sin registro); `deploy/docker-compose.yml` con `api`, `web`
  (Caddy: HTTPS automático, SPA desde `SPA_DIST`, proxy `/api` y `/health`, página de mantenimiento 503 sin build) y
  `migrate` (bundle de EF, target `migrator` del Dockerfile, perfil `tools`). Procedimiento en `deploy/README.md`.
- Rendimiento (B-17): prueba `Category=Performance` dentro de `dotnet test`; resultados y EXPLAIN en `docs/rendimiento.md`.
  Saldo corrido del kardex por SUM sobre índice cubriente (antes ventana sobre todo el historial).

**Frontend (F-01):**
- **Angular Material en lugar de PrimeNG** (2026-09-25): PrimeNG 22 y `@primeuix/themes` 3 cambiaron a la licencia
  "PrimeUI" (Community solo para <10 empleados/<1 MDD con clave anual; si no, de pago). PrimeNG 21.1.10 sigue MIT pero
  es la última versión libre y ata a Angular 21. Se eligió Angular Material/CDK 22 (MIT) + Chart.js para el tablero.
  Spec y CLAUDE.md actualizados.
- Angular 22.2 requiere Node ≥ 24.15 (se actualizó Node LTS a 24.19 en esta máquina).
- Proxy de desarrollo: `SGO_API_URL` o, por defecto, `http://localhost:8090`.
- Fuentes (Roboto) e íconos (Material Symbols) empaquetados localmente: funciona sin internet.
- `frontend/Dockerfile` (node:24-alpine → caddy:2-alpine con `/srv`) probado; el compose de producción **no se cambió**
  (sigue montando `frontend/dist/sgo/browser`). Decidir al contratar DigitalOcean si `web` se construye del Dockerfile.

**Frontend (F-02):**
- **Backend `fix(api)`:** MVC y el serializador de OpenAPI (`ConfigureHttpJsonOptions`) comparten opciones JSON:
  números estrictos (antes 215 campos salían `number | string`) y enums como texto (antes el OpenAPI los documentaba como
  enteros aunque la API manda texto). La API ya no acepta números entre comillas (400). Prueba `JsonOptionsTests`.
- `openapi-typescript` 7.13 declara peer `typescript@^5`; se usa `overrides` en package.json para TS 6 (genera bien).
  `schema.d.ts` se versiona. .NET 10 agrega `null` a la unión de cada enum: usar `ApiEnum<'X'>` (quita el null).
- Menú y rutas de todas las secciones con su permiso real; las que no existen muestran "Esta sección estará disponible
  pronto" (`placeholderRoute`). Cada F-xx reemplaza su placeholder.
- `/perfil` (cambiar contraseña) incluido. Tras cambiarla el backend cierra las sesiones → login con aviso.
- La traducción del paginador (`SpanishPaginatorIntl`) **no** se provee global (sumaba ~150 kB al arranque): la debe
  proveer `app-data-table` en F-03. Shell y login se cargan en diferido; carga inicial ≈ 121 kB comprimidos.
- 409 (`concurrency`, `insufficient_stock`): el interceptor los reenvía; los diálogos se hacen en F-03.

**Frontend (F-03):**
- **Backend `fix(api)`:** `DefaultSuccessResponseConvention` documenta el `200` con el tipo real en toda acción sin
  respuesta exitosa declarada (el 401/403 a nivel de clase impedía que .NET lo infiriera): 88 operaciones pasaron a
  tener tipo de respuesta; solo quedan 3 con `204` (correcto). Prueba `OpenApiResponseTests`.
- Componentes en `shared/components`: `page-header` (migas automáticas por `BreadcrumbsService`), `data-table`
  (servidor: `ListQuery` → `toHttpParams`; plantillas `appCell`/`appCardDef`; provee el paginador en español),
  `status-tag`, `item-picker` (valor = `ItemListItemDto`), `location-picker` (valor = id), `qty-input`,
  `lines-editor` (`appLineColumn` + `[appLineColumnOf]` para tipar la línea; validadores `minLinesValidator`,
  `uniqueLinesValidator`), `confirm-summary` (`ConfirmService`), `shortages-dialog` y `concurrency-dialog`
  (`ConflictHandler.handle(error)`). Pipes `qty`, `mxn`, `statusLabel` (etiquetas de todos los enums, tipadas contra el
  OpenAPI: un enum nuevo rompe la compilación).
- Controles propios (CVA) muestran el error del control del padre con `outerControlErrorState` (MatInput/MatSelect no
  recalculan su error sin `NgControl` propio).
- Fechas `dd/MM/yyyy`: `EsMxDateAdapter` provisto en el shell (`provideAppDates`).
- Menú lateral colapsable (se recuerda en localStorage). Demo en `/demo/componentes` (menú Administración, permiso
  `settings.manage`, visible también en producción).
- `MatSnackBar` se carga al mostrar el primer aviso: carga inicial ≈ 98 kB comprimidos.
- `app-audit-panel` pasa a F-04 (junto con la bitácora).

**Frontend (F-04):**
- Pantallas en `features/admin`: usuarios (lista con filtros, alta/edición, activar/desactivar, restablecer contraseña
  con generador), roles (lista, alta/edición con matriz de permisos; Administrador bloqueado), bitácora (filtros de
  entidad, usuario y fechas; detalle con cambios formateados) y configuración (formulario armado desde `/settings`).
- `app-audit-panel` (shared) en el detalle de usuario y de rol. Carga de datos con `rxResource` (estable en Angular 22).
- Decisiones: sin `security.roles.manage` el campo de roles se deshabilita (la lista de roles exige ese permiso);
  sin `security.users.manage` la bitácora no filtra por usuario. No hay "cambiar contraseña al entrar" (fuera de alcance).
- **Playwright 1.63 (Apache-2.0)** configurado: `npm run e2e` (escritorio y celular 390 px). Credenciales del admin de
  `SGO_E2E_ADMIN_EMAIL`/`SGO_E2E_ADMIN_PASSWORD` o, si faltan, de `deploy/.env`. E2E #1 en verde: el admin crea un
  encargado de sucursal que entra y solo ve su menú. Cada corrida deja un usuario `e2e.encargado.*@sgo.test`
  **desactivado** en la base de desarrollo.

**Frontend (F-05):**
- `features/catalog`: ubicaciones, categorías y unidades (lista + diálogo), artículos (lista con filtros; formulario con
  unidades/factor, lotes/vida útil, IVA 0/16 %, pestaña Mín/Máx por ubicación con guardado propio, historial) e
  importación CSV (plantilla generada en el navegador con BOM, guía de valores, vista previa de 20 filas, tabla de
  errores por fila que además marca las filas en la vista previa). Detalle de artículo solo con `catalog.manage`.
- `shared/data-access/csv.ts` (lector RFC 4180 con `,`/`;`) y `FormErrors` (manejo estándar de 400/409 al guardar).
- E2E `02-item-import-errors`: CSV con errores → tabla por fila; no importa nada. El backend no evalúa las reglas del SKU
  en filas que ya tienen errores de formato (se reportan en la siguiente corrida).

**Frontend (F-06):**
- **Backend:** `GET /items/lookup` (búsqueda ligera de artículos activos: id, sku, nombre, tipo, unidad base, lotes,
  vida útil; `?q=&type=&id=&limit=` ≤ 50) con `[RequireAnyPermission]` (catalog/inventory/logistics/production/
  purchasing `.view`): Encargado de sucursal y Almacén no tienen `catalog.view`. `app-item-picker` la usa.
  `PermissionRequirement` ahora es "cualquiera de" (una sola para `[RequirePermission]`).
- Compose de desarrollo: `SGO__RateLimiting__LoginPermitLimit=60` (producción sigue en 10) para las E2E.
- `features/inventory`: existencias de la ubicación activa (lotes al expandir, "Por caducar" según `/alerts`,
  vencidos en rojo, enlace a kardex), kardex (filtros; folio enlaza al documento si su pantalla existe —
  `shared/data-access/document-links.ts`), ajustes (lista, alta con confirmación y diálogo de faltantes, detalle con
  movimientos) y existencias iniciales (CSV). Motivos de salida: cantidad positiva que se envía negativa; Corrección
  con signo, lote/caducidad y costo en entradas; en salidas con lotes, lote elegido o FEFO.
- `app-data-table` con filas expandibles (`appRowDetail`) y `app-csv-import` compartido (artículos y existencias
  iniciales). Selector de la barra renombrado "Ubicación activa".
- E2E `04-adjustment-shortages` (no registra nada). La base de desarrollo no tiene existencias: los lotes, el kardex
  con datos y un ajuste registrado no se revisaron en pantalla (sí con pruebas unitarias).

**Frontend (F-07):**
- **Backend:** `GET /item-categories` ahora acepta `catalog.view` **o** `inventory.view` (conteos parciales por
  categoría y filtro de existencias para Encargado de sucursal, que no tiene `catalog.view`). Prueba de integración.
- Conteos (`/inventario/conteos`, `/:id`): lista con avance, "Nuevo conteo" (ubicación, categoría opcional, notas),
  borrador → Iniciar → captura por tarjetas (buscador fijo por nombre/SKU/lote, filtros Todas/Pendientes/Contadas,
  barra inferior fija con avance y estado del guardado) → Revisar diferencias → Cerrar (confirmación con resumen);
  Cancelar en borrador y en captura; vista de cerrado/cancelado con líneas, ajustes registrados e historial.
  - **Autoguardado:** 1 s después de la última tecla, al salir del campo o al ocultar la app; guardados en serie con
    la versión que devolvió el anterior (`PendingCounts`); 409 → diálogo de recarga. Una cantidad ya guardada no se
    puede "borrar" (el backend no lo admite): dejar vacío el campo no envía nada.
  - **Captura a ciegas** (decisión propia, fácil de cambiar): la existencia del sistema no se muestra al capturar,
    solo al revisar, para no influir en lo contado.
  - "Agregar artículo" para lo que no estaba en el snapshot (con lote obligatorio si el artículo maneja lotes).
  - Al cerrar, si faltan líneas, el botón dice "Faltan N" y filtra las pendientes (no hay "poner en 0").
- Consumo (`/inventario/consumos/nuevo`): solo si la ubicación activa es sucursal; día (hoy, sin futuro), captura
  rápida artículo → cantidad → Enter (el mismo artículo sin lote elegido se suma), lote opcional (FEFO), confirmación
  con resumen, faltantes con el diálogo de ajustes. Lista y detalle de solo lectura (`/consumos`, `/consumos/:id`).
  El kardex enlaza folios de conteos y consumos.
- Compartidos: `app-qty-input` con `allowZero` y salida `(entered)`; `app-item-picker` limpia sugerencias al
  reiniciarse y ya no usa `distinctUntilChanged` (repetir el mismo artículo no buscaba); **arreglo** del
  `app-audit-panel` en celular (el texto caía en la columna del ícono y desbordaba la pantalla).
- E2E `05-count-consumption-mobile` (escritorio y 390 px, verifica que no haya scroll horizontal): crea, inicia,
  captura, agrega artículo, revisa y **cancela** el conteo; el consumo se detiene en el resumen. No mueve inventario.
  Al inicio cancela conteos en captura de SUC-02 que haya dejado una corrida fallida.

**Frontend (F-08):**
- **Backend:** `GET /locations/lookup` (todas las ubicaciones activas: id, código, nombre, tipo) con
  `[RequireAnyPermission]` (`locations.view` o `logistics.view`): el Almacén no tiene `locations.view` y `/locations`
  solo devuelve las ubicaciones propias, así que no podía elegir la sucursal destino. Filtro `received=true` en
  `GET /transfers` (recibidos con y sin diferencias, pestaña "Recibidos"). Ambos con prueba de integración.
- `features/logistics`: lista con pestañas Por despachar / En tránsito / Recibidos / Todos (según la ubicación activa;
  quien no despacha no ve "Por despachar") y botón **Recibir** en los traspasos en tránsito hacia la ubicación activa;
  nuevo / editar borrador (origen, destino filtrado por ruta: sin `logistics.transfers.special` solo
  fábrica/comisariato → sucursal; líneas con lote planeado opcional); detalle (Despachar, Editar, Cancelar; datos de
  envío, recibido/faltante por línea, pérdida en tránsito, historial); ★ recepción móvil (tarjeta por línea
  prellenada con lo enviado, motivo y notas si llega menos, nunca más de lo enviado, barra inferior fija, confirmación).
- Despacho: diálogo con vehículo, chofer y, por línea con lotes, "Elegir lotes" (reparto manual que debe sumar la
  cantidad); sin reparto se usa el lote planeado o FEFO. Confirmación con resumen y diálogo de faltantes (409).
- Compartidos: `LocationLookupService` (caché por sesión); `app-qty-input` usa `ariaLabel` explícito aunque haya
  etiqueta visible (cada tarjeta "Recibido de HAR-001" tiene nombre accesible propio). El kardex enlaza traspasos.
- E2E `06-transfer-dispatch-receive` (E2E #3 sin pedido; escritorio y celular): **sí mueve inventario** — registra
  por API +5 kg de HAR-001 en COM (lote E2E-TR-2099, caducidad fija 31/12/2099), traspasa 5 a SUC-01 eligiendo ese lote y recibe 4 en 390 px con
  faltante. COM queda igual y SUC-01 gana 4 kg por corrida.
- En la base de desarrollo quedó TR-000009 (COM → SUC-01, recibido completo) de las capturas de pantalla.

**Frontend (F-09):**
- Sin cambios de backend ni migración (los endpoints de B-10 ya cubrían todo).
- `features/production`: lista `/produccion/recetas` (activas; interruptor "Incluir versiones anteriores") y
  `/produccion/recetas/nueva` y `/:id` en una sola página:
  - Nueva (`production.recipes.manage`): producto (solo intermedios y terminados; avisa si ya tiene receta activa
    con enlace), rendimiento en la unidad base del producto, notas, componentes (cantidad por rendimiento y % merma
    0–100 con 2 decimales). Valida repetidos y que el producto no sea su propio componente.
  - Versión activa con permiso: editor. **Si ya se usó en una OP** muestra "Guardar creará la versión N+1; las
    órdenes existentes conservan la versión N", el botón dice "Guardar como versión N+1" y pide confirmación; al
    guardar navega a la nueva versión. Sin cambios no envía nada. Botón **Desactivar receta**.
  - Versión anterior (inactiva) o sin `production.recipes.manage` (decisión: solo lectura con `production.view`):
    vista de solo lectura; en la inactiva, **Activar esta versión** (el backend exige desactivar antes la activa).
  - Historial de versiones con enlace a cada una y bitácora.
- Compartidos: `app-item-picker` con entrada `filter`; `app-qty-input` con `max` y `decimals` (y
  `qtyLimitsValidator`); clase global `.notice-warn`; **arreglo** en `app-lines-editor` para celular: los campos de
  cada tarjeta se enciman (etiqueta sobre el borde del anterior); ahora llevan separación. Afectaba también
  traspasos, ajustes y consumos en 390 px.
- E2E `07-recipe-versions` (escritorio y celular): crea el terminado E2E-PT si no existe, desactiva sus recetas,
  crea la receta en pantalla, la marca como usada con una OP en borrador por API que cancela enseguida (no mueve
  inventario), verifica el aviso y la confirmación, y que la versión anterior quede inactiva y de solo lectura.
  Cada corrida deja una versión más de la receta de E2E-PT y una OP cancelada.
- **Arreglo del E2E 06:** registraba el lote con caducidad "hoy + 60 días" y fallaba desde el segundo día (un lote
  existente no admite otra caducidad). Ahora usa lote y caducidad fijos.
- Entorno: con Docker/Hyper-V encendido, Windows reserva rangos de puertos que pueden incluir el 4200
  (`netsh int ipv4 show excludedportrange protocol=tcp`). Si `npm start` falla con `EACCES`, usar otro puerto
  libre (ej. `npm start -- --port 4300`) y `SGO_E2E_BASE_URL=http://localhost:4300 npm run e2e`.

**Frontend (F-10):**
- Sin cambios de backend ni migración (B-10/B-11 ya cubrían todo).
- `features/production`:
  - Lista `/produccion/ordenes`: órdenes de la ubicación activa, filtros por estado y fecha programada; las más
    recientes primero.
  - Nueva / editar borrador (`/nueva`, `/:id/editar`, `production.orders.manage`): ubicación = la activa si es
    fábrica o comisariato (si no, selector limitado a esos tipos, RN-14); producto (intermedio o terminado) con su
    receta activa (o aviso y enlace para crearla); cantidad planeada, fecha programada y notas; **explosión teórica
    con disponibilidad** (faltante en rojo, costo estimado) que se recalcula al dejar de escribir.
  - Detalle: Liberar, Editar y Cancelar (borrador); Completar y Cancelar (liberada). Mientras está abierta muestra
    la explosión con la disponibilidad actual; completada muestra producido, lote de salida (folio y caducidad),
    costo total y unitario, costo de la merma y, por componente, teórico, real, merma, costo y lotes consumidos.
  - ★ Completar (`/:id/completar`, `production.orders.complete`, página propia): cantidad producida (prellenada
    con la planeada), consumo real por componente prellenado con el teórico **para lo producido** (RN-13, lo trae
    `GET /recipes/{id}/explode`); al cambiar lo producido solo se recalculan las líneas que el usuario no tocó.
    "Elegir lotes" opcional por componente (debe sumar el consumo real). Barra inferior con costo estimado, costo
    unitario, merma y componentes sin existencia; confirmación con resumen; 409 → diálogo de faltantes.
- `ui/explosion-list` (lista, cabe en celular). `lot-split.ts` en `inventory/ui` con `round4`, `lotsTotal`,
  `lotsSumValidator` (ahora acepta una función) y `chosenLots`, compartido por el despacho de traspasos y producción.
  `fromDateOnly` en `shared/forms/date-range.ts`. El kardex enlaza las órdenes de producción.
- E2E `08-production-order` (E2E #4, escritorio y celular): asegura E2E-PT con receta activa, registra por API en
  FAB 10 kg de HAR-001 (lote E2E-OP-2099) y 2 kg de AZU-001; en pantalla crea la OP, revisa la explosión, la libera,
  la completa produciendo 8 (harina repartida al lote de la prueba) y verifica el lote OP-xxxx en Existencias de
  FAB. **Sí mueve inventario:** FAB gana E2E-PT y un poco de HAR-001/AZU-001 en cada corrida. Los helpers de
  producción de los E2E están en `e2e/support/production.ts`.
- Pruebas unitarias: con relojes simulados de vitest, `whenStable` no termina (Angular agenda con timers); usar
  `vi.advanceTimersByTimeAsync` + `TestBed.tick()` (ver `production-orders.spec.ts`). `debounceTime` necesita que
  también se simule `Date` (el `vi.useFakeTimers()` por defecto lo hace).

**Frontend (F-11):**
- Backend: `SupplierItemDto` trae además `baseUomCode` (sin migración) para mostrar el precio por unidad base.
- `features/purchasing`:
  - Lista `/compras/proveedores` (`purchasing.view`): búsqueda por razón social o RFC, "Mostrar inactivos",
    orden por razón social, RFC o días de crédito; tarjetas en celular.
  - Alta `/nuevo` (`purchasing.suppliers.manage`) y detalle `/:id` (`purchasing.view`; sin `manage` se ve en
    solo lectura). Pestaña **Datos generales**: RFC (se guarda en mayúsculas; mismo formato que `TaxIdRules`,
    con fecha AAMMDD válida), razón social, contacto, teléfono, correo, días de crédito (0–365, 0 = contado) y
    activo. Desactivar pide confirmación ("dejará de ser el proveedor preferido de sus artículos"). Historial.
  - Pestaña **Artículos** (se carga al abrirla): SKU, artículo, clave del proveedor, precio sin IVA por unidad de
    compra, **precio por unidad base** (precio ÷ factor), días de entrega, preferido y estado. Diálogo para
    agregar (con `item-picker`) o editar; inactivo nunca es preferido. Con el proveedor inactivo no se editan
    (lo exige el backend) y se avisa que hay que reactivarlo.
  - Los 422 (artículo inactivo o ya ligado) llegan como aviso del interceptor; el diálogo queda abierto.
- E2E `09-suppliers` (escritorio y celular): crea un proveedor con RFC único (`EDE` + fecha + sufijo), liga
  HAR-001 como preferido a $412.50, cambia el precio a $450 y lo busca por RFC. No mueve inventario, pero **cada
  corrida deja un proveedor nuevo que queda como preferido de HAR-001** (dato para F-12/F-13).

**Frontend (F-12):**
- Backend: `GET /items/{id}/supplier-offers` (`purchasing.view`, sin migración): proveedores activos que venden el
  artículo (preferido primero, luego por precio) con precio, clave y días de entrega, más la unidad de compra del
  artículo. Prueba de integración en `SupplierTests`.
- Compartido: `app-data-table` admite selección (`selectable`, `selectionLabel`, `[(selection)]`): casilla por fila
  elegible y en la tarjeta en celular; la del encabezado elige o quita las de la página y la selección se conserva
  al cambiar de página. `ConfirmSummary` acepta `showCancel: false` (avisos de resultado).
- `features/purchasing`:
  - Lista `/compras/requisiciones`: filtros por estado y ubicación (solo las de compra del usuario), búsqueda
    por folio; con `purchasing.po.manage`, selección de las *Aprobadas* y **"Convertir a OC (n)"** (confirmación
    con las requisiciones → OC en borrador → diálogo con folio, proveedor, entrega y total de cada OC).
  - Nueva / editar (`purchasing.requisitions.manage`; solo borrador): ubicación = la activa si compra (si no,
    selector de fábrica/comisariato); fecha requerida (no pasada, por omisión en 7 días) y notas; líneas con
    artículo, cantidad en **unidad de compra**, **proveedor sugerido** (el preferido por omisión; lista con
    precio) e importe; total estimado sin IVA. "Guardar borrador" o "Guardar y enviar" (exige proveedor en
    todas las líneas; si el envío falla queda como borrador).
  - Detalle: fechas de cada paso, OC generadas (folio; el enlace llega con F-13), líneas con proveedor, precio e
    importe estimados, aviso si falta proveedor, motivo de rechazo e historial. Acciones por estado y permiso
    (`requisitionActions`): Enviar/Editar/Cancelar (borrador), Aprobar/Rechazar con motivo (`po.approve`),
    Convertir a OC (`po.manage`), Cancelar (enviada o aprobada).
  - `ui/reason-dialog` (motivo obligatorio, máx. 500) para rechazar; se reutilizará en OC.
- Rol "Compras" no tiene `purchasing.po.approve`: aprueba el Gerente de operaciones o el administrador.
- E2E `10-requisitions` (escritorio y celular): asegura proveedor preferido de HAR-001 (`e2e/support/purchasing.ts`),
  crea en COM una requisición de 4 cajas, la envía, la aprueba y la convierte desde la lista. **Cada corrida deja
  una OC en borrador.**

**Frontend (F-13):**
- Backend (sin migración): `SupplierItemDto` trae `taxRate` y `tracksLots` (IVA en vivo en el editor de OC) y
  `GET /purchase-orders?pendingReceipt=true` (aprobadas o parcialmente recibidas). Pruebas en `SupplierTests` y
  `PurchaseOrderTests`.
- `features/purchasing`:
  - Lista `/compras/ordenes` con pestañas Todas (filtro de estado), **Por aprobar** (solo con
    `purchasing.po.approve`) y Por recibir; filtro de ubicación de entrega y búsqueda por folio o proveedor.
  - Nueva / editar (`purchasing.po.manage`, solo borrador): proveedor con autocompletado (queda fijo al guardar;
    cambiarlo antes limpia las líneas), entrega = la activa si compra, fecha esperada opcional y notas. Líneas
    solo del catálogo activo del proveedor (RN-30) con precio sugerido editable (muestra el de catálogo si se
    cambia), IVA por línea e importe; subtotal, IVA y total en vivo con el mismo redondeo que el backend.
    "Guardar borrador" o "Guardar y enviar" (RN-31: por aprobar o aprobada según el umbral).
  - Detalle (`purchasing.view`; almacén lo ve en solo lectura y con **Recibir**): líneas con pedido, precio, IVA,
    recibido/pendiente y la requisición de origen (enlace); totales; recepciones de la OC (enlaces); acciones
    por estado (`purchaseOrderActions`): Enviar, Editar, Aprobar, Rechazar con motivo (final), Cancelar, Cerrar
    con saldo (confirma con lo pendiente) y Recibir.
  - ★ Recepción `/compras/recepciones/nueva?oc=` (`purchasing.receive`): tarjeta por línea con saldo (prellenada
    con lo pendiente), lote y caducidad opcional si maneja lotes, **"Otro lote"** para repartir, factura del
    proveedor; aviso (no bloqueo) si se recibe más de lo pendiente (el backend aplica la tolerancia); barra
    inferior con el costo; confirmación con resumen.
  - Recepciones: lista (fechas, ubicación, búsqueda por folio o factura) y detalle (cantidad en unidad de compra
    y base, lote, costo unitario base, importe, estado de la OC).
  - `ui/lookup-picker`: autocompletado genérico con búsqueda en el servidor (proveedor y catálogo del proveedor).
  - Enlaces: OC en el detalle de la requisición; "Recepción de compra" en el kardex. El diálogo de "Convertir a
    OC" muestra los folios sin enlace (texto de `ConfirmSummary`).
- E2E `11-purchase-order` (**E2E #2**, escritorio y celular): OC en COM con HAR-001 → enviar → aprobar → recibir
  con lote → la existencia de HAR-001 en COM aumenta (API) y el lote aparece en Existencias. **Mueve
  inventario:** cada corrida suma 2 cajas de HAR-001 a COM.

**Frontend (F-14):**
- Backend (sin migración): `TransferDto` y `TransferListItemDto` traen `branchOrderFolio` (enlace al pedido desde el
  traspaso). Prueba en `BranchOrderTests`.
- `features/logistics`:
  - ★ Lista `/logistica/pedidos`: sin `logistics.orders.approve` muestra los de la ubicación activa (sin pestañas);
    con él, todos los que están a su alcance, filtro de ubicación y pestaña **Por aprobar** (enviados, filtrados
    por origen). Filtro de estado y búsqueda por folio.
  - ★ Nuevo / editar (`logistics.orders.create`, solo borrador): sucursal = la activa si es sucursal (si no, se
    elige), "Pedir a" fábrica o comisariato (se elige solo si hay uno), fecha requerida (mañana por omisión),
    notas y artículos en unidad base con la existencia de la sucursal. **"Sugerir por mín/máx"** agrega solo los
    artículos que faltan (ocupa primero las líneas vacías) y muestra bajo la cantidad mín, máx, existencia, en
    camino y pedido. "Guardar borrador" o "Guardar y enviar".
  - Detalle: solicitado / aprobado / despachado por artículo, traspasos ligados (enlace y **"Ir a despachar"** si
    está en borrador y se puede despachar), motivo de rechazo, aviso de surtido parcial, historial. Acciones
    (`branchOrderActions`): la sucursal edita/envía (borrador) y cancela (borrador o enviado); el origen aprueba o
    rechaza (enviado). **Aprobar** abre la captura en la misma pantalla: existencia en origen, cantidad aprobada
    prellenada con lo solicitado (0 a lo solicitado), aviso en rojo si pasa de la existencia (no bloquea), no
    permite aprobar todo en 0 y confirma con la tabla solicitado/aprobado. Rechazar reutiliza `ReasonDialog`.
  - Traspasos: el detalle enlaza el pedido; cancelar un borrador de pedido advierte que **también cancela el
    pedido**; al editarlo el destino queda bloqueado y un aviso explica las restricciones de RN-20.
- E2E `12-branch-order` (**E2E #3 completo**, escritorio y celular; captura y recepción en 390 px): por API, entrada
  de 3 kg de HAR-001 en COM (lote E2E-PED-2099) y mín/máx de HAR-001 en SUC-01 ajustado para que el sugerido sea
  3 kg; SUC-01 pide con el sugerido → COM aprueba 2 kg → despacha (FEFO) → SUC-01 recibe con 1 kg de faltante →
  el pedido queda "Surtido". **Mueve inventario** y **cambia el mín/máx de HAR-001 en SUC-01** en cada corrida.

**Frontend (F-15):**
- Paquete nuevo: **chart.js 4.5.1 (MIT)**, con su dependencia @kurkle/color 0.3.4 (MIT). Se carga con `import()`
  solo cuando aparece la gráfica (chunk diferido de ~61 kB gzip; el bundle inicial no cambia).
- Backend (sin migración): `ExpiringLotAlertDto` trae `baseUomCode` (cantidad con unidad en la lista de lotes por
  caducar). Prueba en `InventoryApiTests`.
- `features/dashboard`: tablero `/` con `GET /dashboard?locationId=` de la ubicación activa (se vuelve a consultar
  al cambiarla). Tarjetas según los bloques que llegan (permisos) y el tipo de ubicación (`dashboardCards`):
  bajo mínimo y lotes por caducar (inventario); traspasos **por recibir** (sucursal) o **por despachar** (fábrica o
  comisariato); pedidos en curso (sucursal); pedidos por aprobar, OC por aprobar y OP liberadas para hoy (fábrica o
  comisariato). Las alertas con conteo > 0 se resaltan en naranja. Skeleton de carga, error con "Reintentar" y
  estado vacío. Con `locations.all`: gráfica de barras horizontales de artículos bajo mínimo por ubicación (un solo
  tono validado, sin leyenda, tooltip, tabla oculta para lector de pantalla); tocar una barra cambia a esa
  ubicación y abre Existencias con "Bajo mínimo". Si ninguna ubicación está bajo mínimo, lo dice en lugar de la
  gráfica.
- Filtros iniciales por URL (los usan las tarjetas): Existencias `?bajoMinimo=1` y `?porCaducar=1` (nueva sección
  "Lotes por caducar" con lote, caducidad, días y cantidad; también con un interruptor), Traspasos
  `?pestana=por-despachar|en-transito|recibidos|todos`, Pedidos `?pestana=por-aprobar`, OC
  `?pestana=por-aprobar|por-recibir`, OP `?estado=Released&fecha=hoy`.
- E2E `13-dashboard` (escritorio y celular): el administrador ve "Por despachar" en COM y "Por recibir" en SUC-01,
  más la gráfica; la tarjeta abre Existencias filtrada; un encargado de sucursal (creado por API y desactivado al
  final) no ve OC ni pedidos por aprobar ni la gráfica. No mueve inventario; **deja un usuario desactivado** por
  corrida.

**Frontend (F-16):**
- Paquetes nuevos (devDependencies): **@axe-core/playwright 4.13.0 (MPL-2.0)**, que trae axe-core 4.13.0 (MPL-2.0), y
  **lighthouse 13.5.0 (Apache-2.0)**. `material-symbols` 0.47.5 (Apache-2.0) pasa a devDependency: solo es la fuente
  de origen del subconjunto. Herramienta local, no npm: **fonttools + brotli (MIT)**, `pip install fonttools brotli`.
- **Íconos:** subconjunto de Material Symbols Outlined (ejes fijos FILL 0, wght 400, opsz 24) con los 55 íconos usados:
  **~4 MB → 7.6 kB**. `src/styles/fonts/material-symbols-outlined.subset.woff2` + `material-symbols.icons.json`
  versionados; `styles/_material-symbols.scss` reemplaza al CSS del paquete. `npm run icons` regenera (script Node que
  busca los íconos en `<mat-icon>` y en propiedades `icon:` + `scripts/subset-material-symbols.py`, que poda las
  ligaduras por texto, porque el nombre del glifo no siempre es el del ícono). `npm run lint` corre `icons:check`, que
  falla si se usa un ícono fuera del subconjunto.
- **Móvil:** barra de acción fija abajo (`.sgo-action-bar` global, antes `.bottom-bar` duplicada en 4 pantallas) también
  en consumo nuevo y pedido nuevo/editar. Barra superior < 600 px: se oculta el texto "SGO AR" (queda el ícono con
  `aria-label`) y el selector de ubicación usa el espacio libre ("Ubicación activa" ya no se corta en 360 px); el
  enlace de la marca mide 48 px. Migas de pan con área táctil de 24 px (WCAG 2.5.8). Revisión a 360 y 390 px de todas
  las pantallas: sin scroll horizontal.
- **Accesibilidad:** axe (WCAG 2.1 A/AA, falla con serious/critical) en el E2E nuevo `14-accessibility` (login con y
  sin error, tablero y 10 listas, escritorio y celular) y dentro de los flujos de captura: conteo y consumo (E2E 05),
  recepción de traspaso (06) y pedido y aprobación (12). Helper `e2e/support/a11y.ts` (espera a que terminen las
  animaciones finitas). Las tarjetas del tablero ya no tienen `aria-label`: su nombre es el texto visible (WCAG 2.5.3).
- **Lighthouse** (`npm run lighthouse`, accesibilidad con emulación de celular, falla < 90): **login 100, tablero 100,
  recepción 100**, tanto en el servidor de desarrollo como en el build de producción servido por Caddy. Usa un
  traspaso en tránsito y, si no hay, crea uno por API (1 kg de HAR-001, lote LH-2099, COM → SUC-01): esa corrida
  **mueve inventario**. Reportes en `frontend/lighthouse-report/` (no se versiona).
- **Estados vacíos:** acción sugerida en 11 listas más (consumos, conteos, ajustes, traspasos, pedidos, OC, OP,
  usuarios, roles, ubicaciones, unidades), según el permiso y la pestaña (por ejemplo, "Nuevo traspaso" no aparece en
  "En tránsito"). Todos los botones que guardan ya se deshabilitaban durante la petición; los diálogos solo devuelven
  datos.
- **Build de producción:** `ng build` sin avisos (inicial 377 kB, 103 kB transferidos). Imagen `frontend/Dockerfile`
  construida y servida con `deploy/Caddyfile` en HTTP local, conectada a la API de desarrollo: rutas profundas con F5
  → `index.html`; `/api` y `/health` pasan a la API; zstd/gzip; assets con hash `immutable` y HTML `no-cache`; E2E 01 y
  14 en verde contra esa imagen. `.dockerignore` excluye los reportes.
- Pruebas: 212 unitarias, lint y **32 E2E** en verde.

**Frontend (tema claro/oscuro, 2026-10-06, después de F-16):**
- `ThemeService` (`core/theme`): Claro, Oscuro o **Según el sistema** (default). Se guarda **en el navegador**
  (`localStorage` `sgo.theme`, por dispositivo); "Según el sistema" borra la clave y sigue `prefers-color-scheme` en vivo.
  Un script en `index.html` aplica el tema antes de que arranque Angular (sin destello claro).
- Material 3 con `theme-type: color-scheme`: los tokens usan `light-dark()` y el tema lo decide `color-scheme`
  (`html[data-theme]`). Los colores de estado y avisos (`_tokens.scss`) tienen variante oscura con `light-dark()`.
- Selector en el menú del usuario (sección "Tema", `menuitemradio` con marca) y botón de ícono en la esquina del login.
- La gráfica del tablero resuelve los colores con un elemento de prueba (los tokens ya no son colores literales) y se
  vuelve a dibujar al cambiar de tema.
- Íconos nuevos: `light_mode`, `dark_mode`, `brightness_auto`, `check` (59 en el subconjunto). `npm run icons` ahora
  ignora los comentarios HTML (uno que mencionaba `<mat-icon>` ocultaba el ícono siguiente).
- **Oscuro "neón azul"** (pedido del cliente con imagen de referencia: líneas de circuito azul): `styles/_dark.scss`
  sobrescribe solo en oscuro los tokens de texto, líneas y controles: texto #90BEFE, secundario #6F9DFF, líneas
  #2A63FF / #1F4FD6, primario #4F86FF con texto negro, elemento activo del menú #0B2A73. Fondo gris oscuro de Material
  (el cliente lo prefirió al negro puro); estados y errores conservan rojo/verde/naranja/amarillo. Resplandor sutil
  (`--sgo-glow`, `--sgo-focus-glow`) en tarjetas, contornos de campos, tabla, barra de acción y foco (no en el texto ni
  dentro de los campos).
- **Menú lateral con "etiqueta"** (pedido del cliente con imagen de referencia de pngtree: con marca de agua y licencia de
  pago, así que **se recreó con CSS puro**, sin usar el archivo): `styles/_nav-tag.scss` + tokens `--sgo-tag-*` en
  `_tokens.scss` (claro y oscuro con `light-dark()`). Barra inclinada tenue con resplandor radial, bloque inclinado tras
  el ícono y tres cuadritos a la derecha en la página actual; hover y foco la iluminan (contorno de foco visible); menú
  contraído: solo el bloque. Un tono por estado (no opacidad) para mantener contraste ≥ 3:1 del ícono. Se desactivaron
  el indicador activo y las capas de estado de Material en esos items. Respeta `prefers-reduced-motion`.
- **Login rediseñado** (referencia del cliente, sin la imagen de fondo): "Bienvenido / Sistema de Gestión Operativa AR" a
  la izquierda y tarjeta translúcida a la derecha (en celular, apilados). Claro: morados de la referencia
  (#3D12A0 → #9C218B, tarjeta #440A70, botón #9B3CC9 → #5A0A85); oscuro: azul neón (botón #19D3FF → #3D7BFF con
  texto #001233). Campos nativos en píldora con etiqueta arriba, errores con `aria-describedby` y contorno de error;
  sin "Recordarme", "Registrarse" ni "¿Olvidaste tu contraseña?" (sin función en el SGO AR). Fondo: red de partículas
  **plexus** (`shared/components/plexus`, canvas sin librerías: nodos que flotan unidos por líneas; cantidad según el
  tamaño, cuadro fijo con "reducir movimiento", colores por tema).
- **Estilo de pantallas** (referencia del cliente; acento azul conservado): `styles/_ui.scss` + tokens `--sgo-page-bg`,
  `--sgo-card-*`, `--sgo-row-*`, `--sgo-pill-*`, `--sgo-soft-bg`, `--sgo-topbar-*`. Fondo lavanda, tarjetas blancas con
  sombra suave (en oscuro: resplandor), campos de Material en píldora rellena (radio 12 px dentro de tablas de captura
  para no ensancharlas), botón principal con sombra, secundario en píldora suave sin contorno, botones de ícono del
  contenido en círculo, pestañas con subrayado de 3 px. `app-data-table`: renglones de 64 px, divisores suaves,
  alternancia y hover; en celular cada renglón es una tarjeta separada (se desplaza por dentro si su detalle es
  ancho). Etiquetas de estado más grandes, con palomita dibujada con CSS en los estados verdes (no es texto). Barra
  superior de color (azul en claro, azul marino en oscuro) con el selector de ubicación en píldora sin etiqueta
  flotante (`aria-label="Ubicación activa"`). Títulos de página en negrita.
- **Ayuda contextual (manual de usuario)**: botón flotante en la esquina inferior derecha (`core/help/help-button.ts`,
  estilos en `styles/_help.scss`), anillos tipo HUD recreados en SVG (la imagen de referencia no se usó) que giran y se
  detienen al abrir; sube si hay barra de acción fija; quieto con "reducir movimiento". El panel sale de la esquina
  del botón con el manual de la pantalla actual (`HelpService` resuelve el patrón de ruta, p. ej.
  `logistica/traspasos/:id/recibir`): descripción, pasos, campos y consejos (`core/help/help-content.ts`, **todas** las
  rutas; una prueba unitaria falla si una pantalla nueva no tiene ayuda) y video en bucle en las 17 pantallas de
  captura (`public/help/*.webm`, ~13 MB en total, 9–25 s cada uno, se descargan solo al abrir la ayuda). Se cierra con
  X, Esc, el botón o al cambiar de pantalla; el foco regresa al botón.
- **Videos**: `npm run help:record` (API y frontend en marcha) graba con Playwright cada pantalla a 1024×640, menú
  contraído, recuadro naranja y leyenda sobre cada campo, sin guardar nunca. Crea por API y cancela al final un conteo
  en SUC-01, una OP liberada y una OC aprobada (quedan **canceladas** en la base de desarrollo); el de recibir traspaso
  usa uno que ya esté en tránsito. Formato WebM (se ve como GIF y pesa ~10 veces menos). Tras regenerarlos, reiniciar
  `ng serve` para que sirva los archivos nuevos de `public/`.
- E2E `16-help` (abrir, video cargado, Esc y foco, axe en claro y oscuro, todos los videos existen). 42 E2E en verde.
- **Oscuro, ajuste (2026-10-07):** el contenido de las pantallas (`mat-sidenav-content` y capas emergentes: diálogos,
  listas, calendario) vuelve a letras blancas y líneas grises de Material, sin resplandor; el menú lateral, la barra
  superior y la ayuda conservan el azul neón; botones principales, enlaces y pestañas siguen en el primario azul. Los
  tokens que se fijan en `<html>` (color de texto, contorno de campos, tarjetas, pestañas) se redeclaran en ese
  ámbito porque llegarían ya resueltos en azul. Botón de ayuda: rotación a la mitad de velocidad (18/28/10/7 s).
- Pruebas: unitarias de `ThemeService` (219 en total) y E2E `15-theme` (login y app, escritorio y celular: persistencia
  tras F5, "según el sistema" y **axe sin violaciones en modo oscuro**). 36 E2E en verde; Lighthouse 100/100/100.

## Pendientes y notas técnicas

- ✅ **Resuelto (2026-10-06): lote nuevo en recepciones simultáneas y proveedor preferido simultáneo (antes 500).**
  `ITransactionLocks` (`pg_advisory_xact_lock`, se libera al terminar la transacción): `LotRegistry` lo toma por
  (artículo, lote) antes de buscar el lote y `SupplierService` por artículo antes de cambiar el preferido. La segunda
  transacción espera y reutiliza el lote o gana al final. `ILotRegistry` ahora **exige transacción** (la edición de
  conteos ya abre una). Red de seguridad: cualquier otra violación de índice único (`23505`) responde **409
  `duplicate`** en español. Pruebas de integración con 4 recepciones y 4 "preferido" en paralelo (fallaban 3 de 3 sin
  el candado).
- Vigilar el `COUNT(*)` del kardex si una ubicación llega a millones de movimientos (ver `docs/rendimiento.md`).
- ✅ **Resuelto (2026-10-06): nombre de usuario en los documentos.** `IUserDirectory` (una consulta por documento o
  página) y campos `*ByName` junto a cada `*By`: ajustes y consumos (lista y detalle), conteos y recetas (`createdBy`
  nuevo), traspasos, pedidos, OP, recepciones, OC, requisiciones, parámetros (`updatedByName`) y kardex (`userName`,
  sin join para no cambiar el plan de B-17). Frontend: componente `app-stamp` ("fecha · nombre") en todos los
  detalles, "por …" en rechazos, versiones de receta y parámetros, columna "Usuario" en el kardex y "Registró" en
  ajustes y consumos.
- Ajustes y consumos no se cancelan (no hay endpoint en el spec); se corrige con otro ajuste.
- `docs/specs/dominio.md` §6 ahora tiene 29 permisos (se agregó `logistics.transfers.special`).
- ✅ **Resuelto (F-16): fuente de Material Symbols de ~4 MB.** Ahora es un subconjunto de 7.6 kB; un ícono nuevo
  requiere `npm run icons` (Python con fonttools), y `npm run lint` avisa si falta.
- ✅ **Resuelto (2026-09-25): sesión cerrada por "reuse detected".** Dos `/auth/refresh` casi simultáneos con la misma
  cookie (dos pestañas, doble F5) revocaban la sesión. Ahora: ventana de gracia de 30 s en el backend
  (`AuthService.ReuseGracePeriod`, también cubre la carrera `DbUpdateConcurrencyException`) y el frontend serializa el
  refresh entre pestañas con Web Locks (`withLock`). E2E `03-session-tabs`.
- ✅ **E2E y límite de login:** el compose de desarrollo sube el límite a 60/min.
- ✅ **Resuelto (2026-10-06): historial de la bitácora con ids compuestos.** `/audit-log?entityId=X` trae también los
  registros `X|…` (roles y ubicaciones de un usuario, permisos de un rol).
- ✅ **Resuelto (2026-10-06): errores de *model binding* en español.** `ModelStateProblem`: claves en camelCase sin
  `$.` (`lines[0].quantity`), sin la entrada sobrante del parámetro del cuerpo, mensajes de MVC en español, los de
  System.Text.Json ocultos ("El valor no tiene el formato o el tipo esperado."), cuerpo vacío → `body`, y 415 con
  detalle. Pruebas en `ModelBindingErrorTests`.
- `app-data-table`: el skeleton de escritorio tenía `aria-label` sin rol (axe "serious"); ahora `role="status"`.

## Cómo retomar

```bash
# Docker Desktop debe estar abierto.
# En esta máquina un proceso Java ajeno ocupa puertos entre 8080 y 8082 (varía), por eso API_PORT=8090.
# Producción: ver deploy/README.md. Por ahora (sin DigitalOcean) el sistema corre solo local, con respaldos
# automáticos en deploy/backups (servicio `backup` del compose de desarrollo; ver "Uso local" en deploy/README.md).
API_PORT=8090 docker compose -f deploy/docker-compose.dev.yml up -d   # Postgres + API con hot reload
curl http://localhost:8090/health/ready                             # 200 = listo
# OpenAPI/Scalar: http://localhost:8090/scalar/v1

cd backend
dotnet build
dotnet test          # usa Testcontainers (Docker)

cd ../frontend       # requiere Node >= 24.15
npm ci
npm start            # http://localhost:4200, proxy a la API en :8090
npm test && npm run lint
npm run e2e          # con la API y el frontend en marcha
npm run lighthouse   # accesibilidad >= 90 en login, tablero y recepción
npm run icons        # tras usar un ícono nuevo (Python con fonttools y brotli)
```

- Credenciales locales (admin, JWT, Postgres) en `deploy/.env` (no se versiona; copia de `deploy/.env.example`).
- La BD de desarrollo tiene datos de prueba: usuario "Demo Sucursal 3", categoría "Secos", artículos HAR-001 y AZU-001.
- Flujo por tarea (CLAUDE.md): leer tarea → proponer plan y esperar OK → implementar → pruebas en verde → resumen → commit `feat(...): ... [B-xx/F-xx]`.
