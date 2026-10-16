# Especificación Frontend — SGO AR Web

> Lee primero `docs/specs/dominio.md` (entidades, estados, reglas y permisos) y la sección de API de `docs/specs/backend.md`.

## 1. Objetivo

SPA en Angular para operar el SGO AR desde computadora, tableta y celular. La usan cuatro perfiles con necesidades distintas:

- **Oficina** (compras, gerencia): escritorio, tablas grandes, aprobaciones.
- **Comisariato y fábrica**: producción, despacho y recepción de compras. Escritorio o tableta.
- **Sucursales**: pedidos, recepción de traspasos, conteos y consumo. **Celular o tableta**, así que estas pantallas se diseñan primero para móvil.
- **Administrador**: usuarios, roles y configuración.

## 2. Stack

| Uso | Tecnología | Licencia |
|---|---|---|
| Framework | Angular, última versión estable al iniciar: standalone components, signals, control flow `@if/@for`, `provideZonelessChangeDetection()` si es estable en esa versión | MIT |
| Componentes UI | Angular Material + CDK (misma versión que Angular), tema Material 3 | MIT |
| Fuentes e íconos | `@fontsource/roboto` y `material-symbols` (empaquetados localmente, sin CDN) | OFL-1.1 / Apache-2.0 |
| Gráficas del tablero | Chart.js | MIT |
| Tipos de la API | `openapi-typescript`: genera **solo tipos** desde `/openapi/v1.json` | MIT |
| Pruebas unitarias | Runner por defecto del Angular CLI (Vitest en versiones recientes) | MIT |
| Pruebas E2E | Playwright | Apache-2.0 |
| Calidad | `angular-eslint`, Prettier | MIT |

**Prohibido:** PrimeNG v22+ y los paquetes `@primeuix/*` con licencia "PrimeUI" (desde 2026 dejaron de ser MIT: licencia Community con límites de tamaño de empresa y clave anual, o comercial), PrimeNG Blocks o plantillas premium de PrimeTek, AG Grid Enterprise, Kendo UI y cualquier paquete con licencia comercial. **No usar Tailwind** salvo que se decida explícitamente; el layout se resuelve con CSS propio y las utilidades de PrimeFlex **no** se usan (está descontinuado).

## 3. Arquitectura

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/                  # Singleton, se carga una vez
│   │   │   ├── auth/              # AuthService, token store, auth.interceptor, auth.guard, permission.guard
│   │   │   ├── http/              # api-base.interceptor, error.interceptor, problem-details.ts
│   │   │   ├── context/           # LocationContextService (ubicación activa)
│   │   │   ├── layout/            # shell, sidebar, topbar, breadcrumbs
│   │   │   └── api/               # schema.d.ts (generado), tipos auxiliares
│   │   ├── shared/                # Componentes, directivas y pipes reutilizables
│   │   │   ├── components/
│   │   │   ├── directives/        # *hasPermission
│   │   │   └── pipes/             # qty, mxn, status-label
│   │   ├── features/
│   │   │   ├── dashboard/
│   │   │   ├── catalog/           # ubicaciones, artículos, categorías, unidades
│   │   │   ├── inventory/         # existencias, kardex, ajustes, conteos, consumos
│   │   │   ├── production/        # recetas, órdenes de producción
│   │   │   ├── logistics/         # pedidos, traspasos
│   │   │   ├── purchasing/        # proveedores, requisiciones, OC, recepciones
│   │   │   └── admin/             # usuarios, roles, bitácora, configuración
│   │   │       └── <feature>/
│   │   │           ├── data-access/   # <entidad>.api.ts (HttpClient), <entidad>.store.ts (signals)
│   │   │           ├── pages/         # componentes ruteables
│   │   │           ├── ui/            # componentes de presentación
│   │   │           └── <feature>.routes.ts
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/
│   └── styles/                    # _theme.scss (paleta), _tokens.scss, _layout.scss, _material-overrides.scss
└── e2e/
```

**Reglas:**
- Cada feature se carga de forma diferida (`loadChildren`) y cada ruta declara su permiso en `data`.
- **Estado:** servicios `*.store.ts` con `signal`/`computed` por feature. No se usa NgRx. Para lecturas se puede usar `httpResource`/`resource` si es estable en la versión elegida; si no, `HttpClient` + signals.
- Componentes `ChangeDetectionStrategy.OnPush`, con `input()`/`output()` basados en signals.
- **Formularios:** Reactive Forms tipados. Las líneas de documentos usan `FormArray`.
- **Tipos:** el script `npm run api:types` genera `core/api/schema.d.ts` desde `SGO_API_URL` (por defecto `http://localhost:8090`) y se versiona. Los servicios `*.api.ts` usan esos tipos; no se duplican interfaces a mano.
- **Textos:** toda la interfaz está en español. Centralizar etiquetas de estados y enums en `shared/pipes/status-label.pipe.ts`.

## 4. UI y experiencia

- **Layout:**
  - Sidebar colapsable con el menú por módulo, **filtrado por permisos**.
  - Topbar con el selector de ubicación activa, el nombre del usuario y el menú (cambiar contraseña, salir).
  - En móvil, el sidebar se vuelve un drawer.
- **Tema:** Material 3 (`mat.theme`) con la paleta primaria configurable en `styles/_theme.scss`; tokens propios en `styles/_tokens.scss`. Neutro y sobrio; modo claro, oscuro o según el sistema (elegido por dispositivo, ver `ThemeService`).
- **Formatos (locale `es-MX`):**
  - Moneda: `$1,234.56`.
  - Cantidades: hasta 4 decimales sin ceros sobrantes, con la unidad al lado (`12.5 kg`).
  - Fechas: `dd/MM/yyyy` y `dd/MM/yyyy HH:mm`.
- **Colores de estado** (componente `app-status-tag`):

| Color | Estados |
|---|---|
| Gris | Draft |
| Azul | Submitted, Released, InProgress |
| Amarillo | PendingApproval, Dispatched (en tránsito), PartiallyReceived, PartiallyFulfilled |
| Verde | Approved, Received, Completed, Fulfilled, Closed, Posted |
| Naranja | ReceivedWithDiscrepancies |
| Rojo | Cancelled, Rejected |

- **Acciones irreversibles** (despachar, recibir, completar OP, cerrar conteo, aprobar o cancelar): diálogo de confirmación con un resumen de lo que se va a registrar.
- **Móvil (< 768 px):** en las pantallas de sucursal, las tablas se convierten en tarjetas por línea. Las cantidades se capturan con input numérico grande (`inputmode="decimal"`) y la barra de acción queda fija abajo.
- **Estados vacíos y de carga:**
  - Skeletons en tablas.
  - Mensajes con acción sugerida ("No hay traspasos por recibir").
  - Los botones de guardar se deshabilitan mientras hay una petición en curso, para evitar doble envío.
- **Accesibilidad:** labels en todos los inputs, foco visible, navegación con teclado en las tablas de captura (Enter pasa a la siguiente cantidad).

## 5. Autenticación y permisos

- **Login:** `/login` con email y contraseña. Muestra el mensaje del backend en bloqueo o credenciales inválidas.
- **Tokens:**
  - El access token vive **solo en memoria**, en un signal de `AuthService`. El refresh token está en la cookie HttpOnly y no se toca desde JS.
  - Al iniciar la app (`provideAppInitializer`) se llama a `POST /auth/refresh`. Si responde, se carga `/me`; si no, se redirige a `/login`.
- **Interceptor de autenticación:**
  - Agrega `Authorization: Bearer`.
  - Ante un 401 hace **un solo** refresh, compartido entre peticiones concurrentes, y reintenta. Si el refresh falla, cierra sesión y redirige a `/login?returnUrl=`.
- **`/me`** carga el usuario, `permissions: string[]` y `locations`. `AuthService.can(permission)` es un `computed`.
- **Guardas:** `authGuard` y `permissionGuard`. `permissionGuard` lee `route.data.permission` y, si falta el permiso, redirige a `/sin-acceso`.
- **Directiva** `*hasPermission="'purchasing.po.approve'"` para ocultar botones o secciones.
- **Ubicación activa (`LocationContextService`):**
  - Signal con la ubicación seleccionada, persistida en `localStorage`, default `DefaultLocationId`.
  - Las pantallas operativas de sucursal y almacén filtran por ella.
  - Si el usuario tiene solo una ubicación, el selector se oculta.
  - El backend es la fuente de verdad de los permisos: el frontend solo oculta, no protege.

## 6. Manejo de errores

`error.interceptor` interpreta `ProblemDetails`:

- **400:** el componente de formulario recibe `errors` y los asigna a los controles, incluidas las líneas (`lines[2].quantity`). Si no se puede mapear un error, se muestra un toast.
- **403:** toast "No tienes permiso para esta acción".
- **404:** página o toast según el contexto.
- **409 `concurrency`:** diálogo "Otro usuario modificó este documento" con botón **Recargar**.
- **409 `insufficient_stock`:** diálogo con una tabla de faltantes (artículo, lote, solicitado, disponible).
- **422:** toast con `detail`.
- **500 o red:** toast genérico con `traceId` para soporte.

## 7. Pantallas

Rutas en español. Entre corchetes, el permiso mínimo. ★ = diseño móvil prioritario.

### 7.1 General

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/login` | Inicio de sesión | — |
| `/` | **Tablero** de la ubicación activa (ver 7.8) | autenticado |
| `/perfil` | Cambiar contraseña | autenticado |
| `/sin-acceso` | Mensaje sin permiso | — |

### 7.2 Catálogos

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/catalogos/ubicaciones` | Lista y formulario en diálogo | [locations.view] |
| `/catalogos/articulos` | Lista con filtros (tipo, categoría, activo) y búsqueda por SKU o nombre | [catalog.view] |
| `/catalogos/articulos/nuevo`, `/:id` | Formulario: datos generales, unidades y factor, lote/caducidad, pestaña **Mín/Máx por ubicación** | [catalog.manage] |
| `/catalogos/articulos/importar` | Carga de CSV con plantilla descargable, vista previa y errores por fila | [catalog.manage] |
| `/catalogos/categorias`, `/catalogos/unidades` | Listas simples con edición en diálogo | [catalog.view] |

### 7.3 Inventario

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/inventario/existencias` | Existencias por artículo de la ubicación activa: cantidad, unidad, costo promedio, valor, indicador bajo mínimo. Al expandir una fila se ven los lotes con caducidad. Filtro "solo bajo mínimo" | [inventory.view] |
| `/inventario/kardex` | Filtros (ubicación, artículo, tipo, fechas) y tabla paginada. El documento origen es un enlace | [inventory.view] |
| `/inventario/ajustes`, `/nuevo`, `/:id` | Ajuste: motivo, líneas (artículo, lote, cantidad con signo) | [inventory.adjust] |
| ★ `/inventario/conteos`, `/:id` | Conteo físico: crear (ubicación y categoría opcional) → iniciar → capturar `CountedQty` por línea (en móvil, buscar por nombre o SKU) → revisar diferencias → cerrar | [inventory.count] |
| ★ `/inventario/consumos/nuevo` | Registro de consumo del día: agregar artículos y cantidades rápido, confirmar | [inventory.consumption] |
| `/inventario/existencias-iniciales` | Importación CSV de existencias iniciales | [inventory.adjust] |

### 7.4 Producción

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/produccion/recetas` | Lista de productos con receta activa y versión | [production.view] |
| `/produccion/recetas/:id` | Editor: rendimiento y líneas (componente, cantidad, % merma). Aviso: "Guardar creará la versión N+1" si la receta ya se usó. Historial de versiones | [production.recipes.manage] |
| `/produccion/ordenes` | Lista con filtros por estado y fecha | [production.view] |
| `/produccion/ordenes/nueva` | Elegir producto → carga receta activa → cantidad planeada → vista previa de **explosión teórica con disponibilidad** (en rojo lo faltante) | [production.orders.manage] |
| `/produccion/ordenes/:id` | Detalle. Acción **Completar**: captura de cantidad producida y consumo real por componente (prellenado con el teórico), asignación de lotes opcional y resumen de costo y merma antes de confirmar | [production.orders.complete] |

### 7.5 Logística

| Ruta | Pantalla | Permiso |
|---|---|---|
| ★ `/logistica/pedidos` | Lista de pedidos de la sucursal activa, o de todas si se tiene aprobación | [logistics.view] |
| ★ `/logistica/pedidos/nuevo` | Botón **"Sugerir por mín/máx"** que prellena las líneas; edición de cantidades; enviar | [logistics.orders.create] |
| `/logistica/pedidos/:id` | Detalle. Acción **Aprobar**: tabla con solicitado, existencia en origen y cantidad aprobada editable | [logistics.orders.approve] |
| `/logistica/traspasos` | Pestañas: *Por despachar*, *En tránsito*, *Recibidos*, *Todos* | [logistics.view] |
| `/logistica/traspasos/nuevo`, `/:id` | Traspaso directo. Acción **Despachar**: vehículo, chofer, lotes (FEFO automático u opcional manual) y confirmación | [logistics.transfers.dispatch] |
| ★ `/logistica/traspasos/:id/recibir` | **Recepción en sucursal:** tarjeta por línea con enviado y recibido (prellenado igual a enviado). Si recibido < enviado aparece el selector de motivo y notas. Resumen y confirmación | [logistics.transfers.receive] |

### 7.6 Compras

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/compras/proveedores`, `/:id` | Datos del proveedor y pestaña de artículos (precio, SKU del proveedor, preferido) | [purchasing.view] |
| `/compras/requisiciones`, `/nueva`, `/:id` | Requisición y acciones de estado; selección múltiple → **Convertir a OC** | [purchasing.view] |
| `/compras/ordenes` | Lista con filtros; pestaña **Por aprobar** visible con [purchasing.po.approve] | [purchasing.view] |
| `/compras/ordenes/nueva`, `/:id` | Proveedor → líneas con precio sugerido, IVA por línea, totales en vivo. Acciones: enviar, aprobar/rechazar, cancelar, cerrar. Muestra lo recibido por línea | [purchasing.po.manage] |
| `/compras/recepciones/nueva?oc=:id` | Recepción: líneas con pendiente, cantidad a recibir, lote y caducidad (si aplica) | [purchasing.receive] |
| `/compras/recepciones`, `/:id` | Historial de recepciones | [purchasing.view] |

### 7.7 Administración

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/admin/usuarios`, `/:id` | Usuario: datos, roles, ubicaciones, ubicación default, activar/desactivar, restablecer contraseña | [security.users.manage] |
| `/admin/roles`, `/:id` | Rol: matriz de permisos agrupada por módulo con casillas | [security.roles.manage] |
| `/admin/bitacora` | Filtros por usuario, entidad y fechas. El detalle muestra el JSON de cambios formateado | [security.audit.view] |
| `/admin/configuracion` | Umbral de aprobación de OC, días de alerta de caducidad, tolerancia de recepción | [settings.manage] |

### 7.8 Tablero (`/`)

Tarjetas según los permisos del usuario, para la ubicación activa. Cada tarjeta enlaza a su lista filtrada.

- Artículos bajo mínimo.
- Lotes por caducar.
- Traspasos por recibir (sucursal) o por despachar (origen).
- Pedidos pendientes de aprobar.
- OC por aprobar.
- OP liberadas para hoy.

Para la gerencia (`locations.all`), se agrega una gráfica de barras de artículos bajo mínimo por ubicación.

## 8. Componentes compartidos

| Componente | Responsabilidad |
|---|---|
| `app-page-header` | Título, breadcrumbs y botones de acción |
| `app-data-table` | Envoltura de `mat-table` + `mat-paginator` + `mat-sort` en modo servidor: paginación, orden y filtros de servidor que se traducen a `page/pageSize/sort/q`. Skeleton de carga y estado vacío |
| `app-status-tag` | Etiqueta con color por estado (tabla sección 4) |
| `app-item-picker` | Autocomplete de artículos por SKU o nombre. Muestra unidad base y existencia en la ubicación activa (opcional) |
| `app-location-picker` | Selector de ubicaciones permitidas, filtrable por tipo |
| `app-qty-input` | Input decimal con sufijo de unidad; valida > 0 y hasta 4 decimales |
| `app-lines-editor` | Tabla editable de líneas de documento (agregar, quitar, validar, totales). En móvil se muestra como tarjetas |
| `app-confirm-summary` | Diálogo de confirmación con el resumen de lo que se va a registrar |
| `app-shortages-dialog` | Muestra los faltantes de un 409 `insufficient_stock` |
| `app-audit-panel` | Historial de cambios de un documento (usa `/audit-log?entityId=`). Se implementa en F-04 |

## 9. Pruebas

- **Unitarias**, obligatorias:
  - `AuthService`: refresh único ante 401 concurrentes.
  - `permissionGuard` y `*hasPermission`.
  - `error.interceptor`: mapeo 400 → controles de formulario.
  - Pipes `qty`/`mxn`.
  - `app-lines-editor`: totales y validación.
- **E2E (Playwright)** contra el backend con la semilla de desarrollo:
  1. Login y menú filtrado por permisos (admin vs encargado de sucursal).
  2. OC → aprobar → recibir → la existencia aumenta.
  3. Pedido de sucursal → aprobar → despachar → recibir con faltante (viewport móvil).
  4. OP → completar → aparece el lote del producto en existencias.

## 10. Build y despliegue

- **Entornos:** `environment.ts` con `apiBaseUrl: '/api/v1'`. En desarrollo, `proxy.conf.mjs` redirige `/api` y `/health` a `SGO_API_URL` (por defecto `http://localhost:8090`).
- **Scripts de `package.json`:** `start`, `build`, `test`, `lint`, `e2e`, `api:types`.
- **`frontend/Dockerfile`:** multi-stage. Una etapa `node:lts` ejecuta `npm ci && npm run build`; la imagen final es `caddy:2` con `dist/.../browser` en `/srv`.
- **`deploy/Caddyfile`:**

```
{$SGO_DOMAIN} {
    encode zstd gzip
    handle /api/* {
        reverse_proxy api:8080
    }
    handle /health/* {
        reverse_proxy api:8080
    }
    handle {
        root * /srv
        try_files {path} /index.html
        file_server
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

## 11. Plan de implementación (tareas para Claude Code)

Cada tarea debe dejar `npm run lint` y `npm test` en verde. Hacer una tarea por sesión y empezar en modo plan.

**Fase 1**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| F-01 | Proyecto Angular, Angular Material + tema, locale `es-MX`, ESLint/Prettier, proxy, estructura de carpetas, Dockerfile | `npm start` muestra el shell vacío con el tema aplicado |
| F-02 | `api:types`, interceptores (base, auth, error), `AuthService`, login, refresh al iniciar, guardas, `*hasPermission`, `LocationContextService` | Login funcional; el menú se filtra por permisos; tras un refresh (F5) la sesión se conserva |
| F-03 | Layout (sidebar, topbar, drawer móvil) y componentes compartidos: `page-header`, `data-table`, `status-tag`, `item-picker`, `location-picker`, `qty-input`, `lines-editor`, `confirm-summary`, `shortages-dialog` | Página de demostración interna con todos los componentes (`/demo/componentes`, permiso `settings.manage`) |
| F-04 | Administración: usuarios, roles (matriz de permisos), bitácora, configuración, `app-audit-panel` | Admin crea un usuario de sucursal que entra y solo ve su menú |
| F-05 | Catálogos: ubicaciones, categorías, unidades, artículos con mín/máx e importación CSV | Importación con errores muestra la tabla de errores por fila |
| F-06 | Inventario: existencias con lotes, kardex, ajustes, existencias iniciales | Ajuste sin existencia muestra `shortages-dialog` |
| F-07 | Conteo físico y consumo (móvil) | Flujo completo en viewport de 390 px sin scroll horizontal |
| F-08 | Traspasos directos: despachar y recibir (recepción móvil) | E2E #3 (sin pedido) en verde |

**Fase 2**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| F-09 | Recetas con editor y versiones | Aviso de nueva versión al editar una receta usada |
| F-10 | Órdenes de producción con explosión y completar | E2E #4 en verde |

**Fase 3**

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| F-11 | Proveedores y artículos de proveedor | |
| F-12 | Requisiciones y conversión a OC | |
| F-13 | Órdenes de compra y recepciones | E2E #2 en verde |
| F-14 | Pedidos de sucursal con sugerido y aprobación | E2E #3 completo en verde |
| F-15 | Tablero | Las tarjetas cambian según el rol y la ubicación activa |
| F-16 | Pulido: revisión móvil de todas las pantallas ★, accesibilidad, estados vacíos, build de producción | Lighthouse de accesibilidad ≥ 90 en login, tablero y recepción |
