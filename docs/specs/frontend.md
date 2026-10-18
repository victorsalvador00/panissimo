# Especificación Frontend — SGO Paníssimo Web

> Lee primero `docs/specs/dominio.md` (entidades, estados, reglas y permisos) y la sección de API de `docs/specs/backend.md`.
>
> **Implementación desde cero, fase por fase.** El proyecto Angular es nuevo. La interfaz debe verse y comportarse **igual que la del SGO AR** (decisión del cliente para esta versión); como no se copia su código, el diseño completo está descrito en §4.

## 1. Objetivo y perfiles

SPA para operar Paníssimo desde computadora, tableta y celular:

- **Oficina** (dirección, compras, ventas a clientes): escritorio; tablas grandes, plan, aprobaciones, pedidos de cliente e importación de Excel.
- **Planta** (jefe, supervisores y líderes de producción, almacén, distribución): **tableta** junto a la línea para cierres de producción; escritorio para el plan; despachos, recepciones de compra y remisiones.
- **Sucursales**: **celular o tableta**; pedidos, recepción de traspasos, conteos y consumo. Estas pantallas se diseñan primero para móvil.
- **Administrador**: usuarios, roles, catálogos y configuración.

## 2. Stack

| Uso | Tecnología | Licencia |
|---|---|---|
| Framework | Angular 22: standalone components, signals, control flow `@if/@for`, `provideZonelessChangeDetection()` | MIT |
| Componentes UI | Angular Material + CDK 22, tema Material 3 | MIT |
| Fuentes | `@fontsource/roboto` (empaquetada, sin CDN) | OFL-1.1 |
| Íconos | Material Symbols Outlined como **subconjunto local** generado de `material-symbols` (devDependency) | Apache-2.0 |
| Gráficas | Chart.js 4.5 (carga diferida con `import()`) | MIT |
| Tipos de la API | `openapi-typescript` (solo tipos) | MIT |
| Pruebas unitarias | Runner del Angular CLI (Vitest) | MIT |
| Pruebas E2E | Playwright | Apache-2.0 |
| Accesibilidad | `@axe-core/playwright` (devDependency) y `lighthouse` (devDependency) | MPL-2.0 / Apache-2.0 |
| Calidad | `angular-eslint`, Prettier | MIT |
| Herramienta local de íconos | Python `fonttools` + `brotli` (`pip install fonttools brotli`) | MIT |
| Herramienta local de logo y favicon | Python `pillow` (`pip install pillow`), solo para `scripts/brand-assets.py` | MIT-CMU |
| Herramienta local de fixtures Excel de las E2E | Python `openpyxl` (`pip install openpyxl`), solo para `scripts/e2e-fixtures.py` | MIT |

Node ≥ 24.15 (lo exige Angular 22). Antes de agregar un paquete npm, verifica su licencia en la versión exacta y menciónala en el resumen de la tarea.

**Prohibido:** PrimeNG v22+ y `@primeuix/*` (licencia "PrimeUI"), PrimeNG Blocks, AG Grid Enterprise, Kendo, cualquier paquete con licencia comercial, Tailwind (salvo decisión explícita), PrimeFlex. **No leer Excel en el navegador** (sin SheetJS ni ExcelJS): el `.xlsx` se sube al backend, que valida y devuelve la vista previa. **Sin librerías de imágenes ni de PDF:** las fotos se redimensionan con `canvas` y las remisiones se imprimen con CSS `@media print`.

## 3. Arquitectura

```
frontend/
├── src/
│   ├── app/
│   │   ├── core/                  # Singleton, se carga una vez
│   │   │   ├── auth/              # AuthService, auth.interceptor, auth.guard, permission.guard
│   │   │   ├── http/              # api-base.interceptor, error.interceptor, problem-details.ts
│   │   │   ├── context/           # LocationContextService (ubicación activa)
│   │   │   ├── layout/            # shell, sidebar, topbar, breadcrumbs
│   │   │   ├── theme/             # ThemeService
│   │   │   ├── help/              # HelpService, help-button, help-content.ts
│   │   │   └── api/               # schema.d.ts (generado y versionado), ApiEnum<T>
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── directives/        # *hasPermission
│   │   │   ├── data-access/       # csv.ts, lookups, document-links.ts
│   │   │   ├── forms/             # FormErrors, validadores, date-range
│   │   │   └── pipes/             # qty, mxn, statusLabel
│   │   ├── features/
│   │   │   ├── dashboard/
│   │   │   ├── catalog/           # ubicaciones, artículos, categorías, unidades
│   │   │   ├── inventory/         # existencias, kardex, ajustes, conteos, consumos, análisis
│   │   │   ├── production/        # recetas, áreas, OP, cierres, plan, importación, resumen
│   │   │   ├── logistics/         # pedidos de sucursal, traspasos
│   │   │   ├── sales/             # clientes, pedidos de cliente, remisiones
│   │   │   ├── purchasing/        # proveedores, requisiciones, OC, recepciones, requerimiento
│   │   │   └── admin/             # usuarios, roles, bitácora, configuración
│   │   │       └── <feature>/{data-access,pages,ui}, <feature>.routes.ts
│   │   ├── app.config.ts
│   │   └── app.routes.ts
│   ├── environments/
│   └── styles/                    # _theme, _tokens, _dark, _ui, _nav-tag, _help, _material-symbols
├── public/help/                   # videos del manual (*.webm)
├── scripts/                       # subset de íconos, grabación de videos
└── e2e/                           # Playwright, fixtures (.csv, .xlsx), support/
```

**Reglas:**
- Cada feature se carga en diferido (`loadChildren`); cada ruta declara en `data` su permiso o lista de permisos (basta uno).
- Estado con servicios `*.store.ts` (`signal`/`computed`); lecturas con `rxResource`. Sin NgRx.
- Componentes `OnPush` con `input()`/`output()`.
- Reactive Forms tipados; líneas de documentos con `FormArray`.
- Tipos de `schema.d.ts` (`npm run api:types` desde `PAN_API_URL`, default `http://localhost:8090`). No se duplican interfaces a mano. Los enums que .NET marca como anulables se usan con `ApiEnum<'X'>`.
- Toda la interfaz en español. Etiquetas de estados y enums centralizadas en el pipe `statusLabel`, tipadas contra el OpenAPI: un enum nuevo sin etiqueta rompe la compilación.

## 4. Diseño visual (igual al SGO AR)

### 4.1 Base

- **Layout:** sidebar colapsable (estado recordado en `localStorage`) con el menú por módulo **filtrado por permisos**; en móvil es un drawer. Topbar de color (verde en claro, azul marino en oscuro) con la marca "SGO Paníssimo" (en < 600 px solo el ícono con `aria-label`), el **selector de ubicación activa** en píldora sin etiqueta flotante (`aria-label="Ubicación activa"`; se oculta si el usuario tiene una sola ubicación) y el menú del usuario (perfil, tema, salir). Migas de pan automáticas con área táctil de 24 px.
- **Paleta del claro en verde** (decisión del usuario, 2026-10-17): el tema claro usa tonos verdes (primario `$green-palette`, terciario `$chartreuse-palette`, barra #2E7D32, fondo #EEF5EE), no azules; el oscuro conserva el "neón azul" (paleta `$azure-palette`).
- **Trazabilidad** (F-26): tokens `--pan-trace-*` para carriles, cintas y estados del mapa, en claro y oscuro (`trazabilidad-ui.md`).
- **Tema:** Material 3 con `theme-type: color-scheme`; los tokens usan `light-dark()` y el tema se aplica con `html[data-theme]`. Modos **Claro, Oscuro y Según el sistema** (default), elegidos por dispositivo (`localStorage` `pan.theme`; "Según el sistema" borra la clave y sigue `prefers-color-scheme` en vivo). Un script en `index.html` aplica el tema antes de que arranque Angular (sin destello).
- **Estilo de pantallas** (`styles/_ui.scss` y tokens `--pan-page-bg`, `--pan-card-*`, `--pan-row-*`, `--pan-pill-*`, `--pan-soft-bg`, `--pan-topbar-*`): en claro, fondo verde suave, tarjetas blancas con sombra suave, campos de Material en **píldora rellena** (radio 12 px dentro de tablas de captura), botón principal con sombra, secundario en píldora suave sin contorno, botones de ícono del contenido en círculo, pestañas con subrayado de 3 px, títulos de página en negrita. `app-data-table` con renglones de 64 px, divisores suaves, alternancia y hover; en celular cada renglón es una tarjeta.
- **Oscuro "neón azul"** (`styles/_dark.scss`): en el menú lateral, la barra superior y la ayuda, texto #90BEFE, secundario #6F9DFF, líneas #2A63FF / #1F4FD6, primario #4F86FF con texto negro, elemento activo #0B2A73 y resplandor sutil (`--pan-glow`, `--pan-focus-glow`). El **contenido** de las pantallas y las capas emergentes usan texto blanco y líneas grises de Material, sin resplandor; botones principales, enlaces y pestañas en el primario azul. Fondo gris oscuro de Material (no negro). Los estados conservan rojo, verde, naranja y amarillo con variante oscura.
- **Menú lateral con "etiqueta"** (`styles/_nav-tag.scss`, solo CSS): barra inclinada tenue con resplandor radial, bloque inclinado tras el ícono y tres cuadritos a la derecha en la página actual; hover y foco la iluminan; menú contraído: solo el bloque. Un tono por estado para contraste ≥ 3:1. Sin el indicador activo ni las capas de estado de Material en esos items. Respeta `prefers-reduced-motion`.
- **Login:** "Bienvenido / Sistema de Gestión Operativa · Paníssimo" a la izquierda y tarjeta translúcida a la derecha (apilados en celular). Claro: verdes, en línea con la paleta del claro (tonos exactos en F-02); oscuro: azul neón (botón #19D3FF → #3D7BFF con texto #001233). Campos nativos en píldora con etiqueta arriba, errores con `aria-describedby`. Sin "Recordarme", "Registrarse" ni "¿Olvidaste tu contraseña?". Fondo **plexus** en `canvas` sin librerías (nodos que flotan unidos por líneas; cantidad según el tamaño; cuadro fijo con "reducir movimiento"; colores por tema). Botón de tema en la esquina. Logo de Paníssimo (`logo.png`) en el login y como título de la barra superior; favicon e íconos a partir de `ico.png` (originales en la raíz del repositorio; `python scripts/brand-assets.py` genera las versiones web en `public/`).
- **Íconos:** subconjunto de Material Symbols Outlined (FILL 0, wght 400, opsz 24) generado por `npm run icons` (script Node que busca íconos en `<mat-icon>` y propiedades `icon:`, ignorando comentarios, más `scripts/subset-material-symbols.py`). `npm run lint` incluye `icons:check`, que falla si se usa un ícono fuera del subconjunto.

### 4.2 Formatos y estados

- **Locale `es-MX`:** moneda `$1,234.56`; cantidades hasta 4 decimales sin ceros sobrantes con la unidad al lado (`12.5 kg`, `3,200 pza`); fechas `dd/MM/yyyy` y `dd/MM/yyyy HH:mm` (`EsMxDateAdapter`).
- **Colores de estado** (`app-status-tag`; los verdes llevan una palomita dibujada con CSS):

| Color | Estados |
|---|---|
| Gris | Draft |
| Azul | Submitted, Released, InProgress, Confirmed |
| Amarillo | PendingApproval, Dispatched (en tránsito), PartiallyReceived, PartiallyFulfilled, PartiallyShipped |
| Verde | Approved, Received, Completed, Fulfilled, Shipped, Closed, Posted |
| Naranja | ReceivedWithDiscrepancies |
| Rojo | Cancelled, Rejected |

- **Etiquetas de enums:** `ItemType` (Materia prima, Insumo, Semiterminado, Producto terminado), `ItemPresentation` (Granel, Empaquetado), `LocationType` (Planta, Sucursal), `Shift` (Día, Tarde, Noche), `ProductionCloseKind` (Cierre parcial, Cierre final), `ShortfallReason` (Falta de insumo, Falta de personal, Falla de equipo, Ajuste de demanda, Otro), `ProductionOrderSource` (Manual, Plan, Importación), estados de cada documento y tipos de movimiento (incluye "Remisión a cliente").

### 4.3 Comportamiento

- **Acciones irreversibles** (despachar, recibir, cerrar producción, cerrar conteo, aprobar, cancelar, generar OP, importar): diálogo de confirmación con resumen de lo que se registrará.
- **Móvil (< 768 px):** tablas como tarjetas; cantidades con input grande (`inputmode="decimal"`, o `numeric` si es `pza`); **barra de acción fija abajo** (`.pan-action-bar`); sin scroll horizontal a 360 y 390 px.
- **Tableta (1024 px):** la pantalla de cierre de producción se diseña para este tamaño.
- **Carga y vacíos:** skeletons en tablas (`role="status"`); estados vacíos con acción sugerida según permiso y pestaña; botones de guardar deshabilitados durante la petición.
- **Accesibilidad:** WCAG 2.1 AA; labels en todos los inputs (`ariaLabel` explícito en tarjetas repetidas), foco visible, Enter pasa a la siguiente cantidad en tablas de captura, nombres accesibles iguales al texto visible.
- **Ayuda contextual:** botón flotante abajo a la derecha (anillos tipo HUD en SVG que giran y se detienen al abrir; sube si hay barra de acción; quieto con "reducir movimiento"). El panel muestra el manual de la pantalla actual (`HelpService` resuelve el patrón de ruta): descripción, pasos, campos, consejos y, en pantallas de captura, un video en bucle (`public/help/*.webm`, se descarga solo al abrir). Se cierra con X, Esc, el botón o al navegar; el foco regresa al botón. **Toda ruta tiene ayuda** (una prueba unitaria lo verifica).

## 5. Autenticación y permisos

- **Login** `/login` con email y contraseña; muestra el mensaje del backend en bloqueo o credenciales inválidas.
- **Tokens:** access token **solo en memoria** (signal en `AuthService`); el refresh está en cookie HttpOnly. Al iniciar (`provideAppInitializer`) se llama a `POST /auth/refresh`; si responde, se carga `/me`; si no, `/login`.
- **Interceptor:** agrega `Authorization: Bearer`; ante un 401 hace **un solo** refresh compartido entre peticiones concurrentes y **serializado entre pestañas** con Web Locks; si falla, cierra sesión y redirige a `/login?returnUrl=`.
- `AuthService.can(permission)` (`computed`), `authGuard`, `permissionGuard` (lee `route.data.permission`, cadena o lista; sin permiso → `/sin-acceso`) y directiva `*hasPermission`.
- **Ubicación activa (`LocationContextService`):** signal persistido en `localStorage`, default `DefaultLocationId`. Las pantallas operativas filtran por ella; las de producción, ventas y compras usan la Planta.
- El backend protege; el frontend solo oculta.

## 6. Manejo de errores

`error.interceptor` interpreta `ProblemDetails`:

- **400:** `FormErrors` asigna `errors` a los controles, incluidas las líneas (`lines[2].quantity`); lo que no se puede mapear va a un aviso.
- **403:** aviso "No tienes permiso para esta acción".
- **404:** página o aviso según el contexto.
- **409 `concurrency`:** `concurrency-dialog` ("Otro usuario modificó este documento", botón **Recargar**).
- **409 `insufficient_stock`:** `shortages-dialog` (artículo, lote, solicitado, disponible).
- **409 `duplicate`** y **422:** aviso con `detail`.
- **500 o red:** aviso genérico con `traceId`.
- La importación de Excel y de CSV muestran su propia tabla de errores por fila.

## 7. Pantallas

Rutas en español. Entre corchetes, el permiso mínimo. ★ = diseño móvil o tableta prioritario.

### 7.1 General

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/login` | Inicio de sesión | — |
| `/` | Tablero de la ubicación activa (7.9) | autenticado |
| `/perfil` | Cambiar contraseña (al guardar se cierra sesión con aviso) | autenticado |
| `/sin-acceso` | Mensaje sin permiso | — |

### 7.2 Catálogos

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/catalogos/ubicaciones` | Lista y diálogo (nombre y dirección editables) | [locations.view] |
| `/catalogos/articulos` | Lista con foto, filtros (tipo, presentación, categoría, área, activo) y búsqueda por SKU o nombre | [catalog.view] |
| `/catalogos/articulos/nuevo`, `/:id` | Datos generales (tipo, categoría, unidades y factor, lotes y vida útil, almacenamiento, IVA 0/16 %, presentación, "Versión empaquetada de", piezas por paquete, área, múltiplo de OP, gramaje); pestañas **Foto** (elegir o tomar con la cámara), **Mín/Máx por ubicación** (guardado propio), versiones empaquetadas (si es granel) e historial | [catalog.manage] |
| `/catalogos/articulos/importar` | CSV: plantilla generada en el navegador (con BOM), guía de valores, vista previa de 20 filas y tabla de errores por fila | [catalog.manage] |
| `/catalogos/articulos/fotos` | Importación masiva de fotos por SKU (`TRENZA.jpg`), redimensionadas y subidas una por una | [catalog.manage] |
| `/catalogos/categorias`, `/catalogos/unidades` | Listas con diálogo | [catalog.view] |
| `/produccion/areas` | Lista y diálogo (código, nombre, orden, activa) | [production.view]; editar [production.areas.manage] |

### 7.3 Inventario

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/inventario/existencias` | Existencias de la ubicación activa: cantidad, unidad, costo promedio, valor, `app-stock-level`, lotes al expandir (vencidos en rojo), "Solo bajo mínimo", sección "Lotes por caducar", enlace al kardex | [inventory.view] |
| `/inventario/kardex` | Filtros (ubicación, artículo, tipo, fechas); saldo corrido; folio con enlace al documento; usuario | [inventory.view] |
| `/inventario/ajustes`, `/nuevo`, `/:id` | Motivo; líneas (salidas en positivo que se envían negativas; Corrección con signo, lote, caducidad y costo en entradas; lote elegido o FEFO en salidas) | [inventory.adjust] |
| ★ `/inventario/conteos`, `/:id` | Crear (ubicación, categoría opcional) → iniciar → **captura a ciegas** por tarjetas (buscador fijo, filtros Todas/Pendientes/Contadas, **autoguardado** 1 s después de la última tecla, al salir del campo o al ocultar la app, en serie con la versión anterior) → "Agregar artículo" → revisar diferencias → cerrar ("Faltan N" si hay pendientes) | [inventory.count] |
| ★ `/inventario/consumos/nuevo`, `/consumos`, `/:id` | Solo sucursales: día (hoy o anterior), captura rápida artículo → cantidad → Enter (suma el mismo artículo), lote opcional, confirmación | [inventory.consumption] |
| ★ `/inventario/vales-internos`, `/nuevo`, `/:id` | **Vales internos entre subalmacenes** de la ubicación activa (RN-47): pestañas Por enviar / En tránsito / Recibidos / Todos; formulario con subalmacén origen y destino (solo los de la ubicación activa, distintos) y líneas con lote planeado opcional; **Enviar** (lotes FEFO, confirmación con resumen) y **Recibir** con tarjeta por línea prellenada con lo enviado, como la recepción de traspasos; Cancelar solo en borrador | [inventory.view]; enviar y recibir [inventory.internal_transfers] |
| `/inventario/existencias-iniciales` | CSV de existencias iniciales | [inventory.adjust] |
| `/inventario/analisis-consumo` | Promedio diario, barras por día de la semana, tendencia, mín/máx actual y sugerido con **Aplicar sugerido** ([catalog.manage]) | [inventory.view] |
| `/inventario/trazabilidad` | Búsqueda de punto de entrada (lote, OC, OP, traspaso o remisión) y dirección (`trazabilidad.md` §6.2) | [inventory.traceability] |
| `/inventario/trazabilidad/:sourceType/:sourceId?direccion=` | Resultado: mapa con ficha emergente (`trazabilidad-ui.md`), resumen de retiro y bitácora; exportar CSV | [inventory.traceability] |

### 7.4 Producción

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/produccion/recetas` | Recetas activas (interruptor "Incluir versiones anteriores") | [production.view] |
| `/produccion/recetas/nueva`, `/:id` | Editor: producto (semiterminado o terminado), rendimiento, componentes (materia prima, insumo o semiterminado; cantidad y % merma). Si ya se usó: "Guardar creará la versión N+1" con confirmación. Desactivar / Activar esta versión. Pestaña **Costos** por versión con alzas de insumos. Historial de versiones | [production.view]; editar [production.recipes.manage] |
| `/produccion/plan` | **Plan de producción** (7.4.1) | [production.view] |
| `/produccion/ordenes` | Lista con pestañas **Por producir**, **En proceso**, **Borradores**, **Todas**; filtros de fecha, área, turno, origen e importación; avance (`app-progress-meter`) y número de cierres | [production.view] |
| `/produccion/ordenes/nueva`, `/:id/editar` | Planta, producto con su receta activa (o aviso y enlace para crearla), cantidad (entera si es `pza`), fecha, área (default la del producto), turno, notas; explosión con disponibilidad que se recalcula al dejar de escribir | [production.orders.manage] |
| `/produccion/ordenes/:id` | Detalle (7.4.2) | [production.view] |
| ★ `/produccion/ordenes/:id/cerrar?tipo=parcial\|final` | **Cierre de producción** (7.4.3) | [production.orders.close] |
| `/produccion/cierres`, `/:id` | Lista (fecha, OP, producto, área, turno, tipo, producido, costo, merma) y detalle con consumos y lotes | [production.view] |
| `/produccion/importar` | **Importar OP desde Excel** (7.4.4) | [production.orders.import] |
| `/produccion/importaciones`, `/:id` | Historial de importaciones y sus OP | [production.view] |
| `/produccion/resumen` | Resumen por área, producto o día: planeado, producido, % de cumplimiento, costo y merma (tabla y barras) | [production.view] |

#### 7.4.1 Plan de producción

- Encabezado: Planta, rango de fechas (hoy + `production.plan_default_days`), área y búsqueda.
- Tabla (`app-plan-table`) agrupada por **fecha** y luego por **área**: foto, SKU, producto, tipo y presentación, demanda (sucursales, clientes, stock, OP padre), existencia, OP pendientes y **por producir** (resaltado si > 0). Al expandir: líneas de pedido que lo originan (folio con enlace, sucursal o cliente, fecha, cantidad).
- Selección de renglones con sugerido > 0; cantidad editable (prellenada con el sugerido; múltiplo como pista, no como bloqueo) y turno opcional.
- **"Generar OP (n)"** ([production.orders.manage]): confirmación con producto / fecha / área / cantidad → diálogo con los folios creados y "Ver órdenes del día".
- Vacío: "No hay nada por producir en este rango".

#### 7.4.2 Detalle de OP

- Encabezado: folio, estado, producto, receta (versión con enlace), área, turno, fecha, origen (enlace a la importación) y `app-progress-meter` (producido / planeado; naranja si supera lo planeado).
- Acciones (`productionOrderActions`): Liberar, Editar, Cancelar (borrador); Cancelar (liberada sin cierres); **Cierre parcial** y **Cierre final** (liberada o en proceso).
- Pestañas: **Componentes** (teórico, real acumulado, merma; disponibilidad mientras está abierta), **Cierres** (`app-close-timeline`: folio, tipo, fecha y hora, turno, usuario, producido, lote y caducidad, costo unitario, merma; al expandir, consumos y lotes), **Pedidos** (que atiende, con enlaces) e **Historial**.
- Completada: producido vs planeado, motivo de faltante, costo total y unitario, merma total.

#### 7.4.3 ★ Cierre de producción (parcial o final)

Para **tableta en la línea** (también 390 px):

- Título "Cierre parcial — OP-000123 · BOMBAS" o "Cierre final — …"; producido hasta ahora y pendiente.
- **Cantidad producida en este cierre** con input grande. En parcial empieza vacía; en final, con el pendiente. En final se admite 0 si ya hay cierres ("No se produjo más; solo cerrar la orden").
- Turno (default el de la OP) y notas.
- **Consumo real por componente:** tarjetas con el teórico para la cantidad capturada (`close-preview`, recalculado al dejar de escribir), consumo real prellenado y editable, existencia y "Elegir lotes" (reparto que debe sumar el consumo). Al cambiar la cantidad solo se recalculan las líneas que el usuario no tocó.
- **Faltante en cierre final:** motivo obligatorio (y notas con "Otro").
- **Sobreproducción:** aviso naranja si supera lo planeado; si supera la tolerancia, aviso destacado con el máximo ("Máximo permitido: 3,300 pza") **sin bloquear**: el cierre se registra marcado (D-03, tolerancia solo informativa).
- Barra fija con costo estimado, costo unitario y merma; botón "Registrar cierre parcial" o "Cerrar orden"; confirmación con producido, lote y caducidad, consumos. 409 → diálogos de faltantes o concurrencia.
- Al terminar: aviso con folios del cierre y del lote; regresa al detalle.

#### 7.4.4 Importar OP desde Excel (`app-xlsx-import`)

1. **Archivo:** "Descargar plantilla"; selector `.xlsx` (máx. 5 MB; arrastrar y soltar en escritorio). Al elegirlo se envía a `/validate`.
2. **Revisión:** con errores, tabla filtrable (fila, columna, mensaje) y "Elegir otro archivo" (no se puede continuar). Sin errores: "N filas → M órdenes", avisos con casilla **"Entiendo los avisos y quiero continuar"**, tabla de órdenes a crear y opción **"Liberar las órdenes al importar"** (con [production.orders.manage]).
3. **Resultado:** folio `IMP-…`, número de OP y "Ver órdenes" (lista filtrada por la importación).

El archivo se guarda en memoria del componente para reenviarlo en el alta (el servidor revalida).

### 7.5 Logística

| Ruta | Pantalla | Permiso |
|---|---|---|
| ★ `/logistica/pedidos` | Pedidos de la sucursal activa; con aprobación, todos los del alcance, filtro de ubicación y pestaña **Por aprobar** | [logistics.view] |
| ★ `/logistica/pedidos/nuevo`, `/:id/editar` | Sucursal (la activa), fecha requerida (mañana), notas; artículos (granel e insumos) con existencia de la sucursal; **"Sugerir por mín/máx"** (agrega solo lo que falta y muestra mín, máx, existencia, en camino y pedido) | [logistics.orders.create] |
| `/logistica/pedidos/:id` | Solicitado / aprobado / despachado, traspasos ligados ("Ir a despachar"), motivo de rechazo. **Aprobar** en la misma pantalla con existencia en origen, cantidad aprobada (0 a solicitado; aviso si pasa de la existencia), sin permitir todo en 0. Rechazar con motivo | [logistics.view] |
| `/logistica/traspasos` | Pestañas Por despachar / En tránsito / Recibidos / Todos; botón **Recibir** en los que llegan a la ubicación activa | [logistics.view] |
| `/logistica/traspasos/nuevo`, `/:id` | Origen, destino (filtrado por ruta, RN-25), líneas con lote planeado opcional. **Despachar**: vehículo, chofer, "Elegir lotes" por línea, confirmación. Cancelar un traspaso de pedido advierte que cancela el pedido | [logistics.transfers.dispatch] |
| ★ `/logistica/traspasos/:id/recibir` | Tarjeta por línea prellenada con lo enviado; si llega menos, motivo y notas; nunca más de lo enviado; barra fija; confirmación | [logistics.transfers.receive] |

### 7.6 Ventas a terceros

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/ventas/clientes` | Búsqueda por código, nombre o RFC; "Mostrar inactivos" | [sales.view] |
| `/ventas/clientes/nuevo`, `/:id` | **Datos generales**, **Puntos de entrega** (lista y diálogo), **Artículos** (SKU del cliente y precio informativo, solo empaquetados) e historial | [sales.view]; editar [sales.customers.manage] |
| `/ventas/pedidos` | Pestañas **Por surtir**, **Borradores**, **Todos**; filtros de cliente, fecha y estado; avance | [sales.view] |
| `/ventas/pedidos/nuevo`, `/:id/editar` | Cliente, punto de entrega, fecha requerida, referencia del cliente, notas; líneas de empaquetados con cantidad y precio opcional. "Guardar borrador" o "Guardar y confirmar" | [sales.orders.manage] |
| `/ventas/pedidos/:id` | Pedido / remisionado / pendiente, remisiones, OP ligadas con avance; Confirmar, Editar, Cancelar, **Nueva remisión**, Cerrar con saldo | [sales.view] |
| `/ventas/remisiones` | Pestañas **Por despachar** y **Todas**; filtros de cliente y fecha | [sales.view] |
| ★ `/ventas/remisiones/:id` | Borrador: cantidades (máx. saldo + tolerancia), vehículo, chofer, recibe, "Elegir lotes"; **Despachar** con confirmación. Despachada: solo lectura y **Imprimir** (hoja carta con `@media print`) | [sales.view]; despachar [sales.shipments.dispatch] |

### 7.7 Compras

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/compras/proveedores`, `/nuevo`, `/:id` | Búsqueda por razón social o RFC; **Datos generales** (RFC en mayúsculas con validación, días de crédito, activo; desactivar avisa que pierde los preferidos) y **Artículos** (clave, precio por unidad de compra y por unidad base, días de entrega, preferido) | [purchasing.view]; editar [purchasing.suppliers.manage] |
| `/compras/requisiciones`, `/nueva`, `/:id` | Lista con selección de aprobadas → **Convertir a OC (n)**; formulario con fecha requerida (+7 días), líneas en unidad de compra con proveedor sugerido (preferido) e importe; acciones por estado; rechazar con motivo | [purchasing.view] |
| `/compras/requerimiento` | Requerimiento de materia prima: horizonte; por comprar, por producir y cubiertos; **Crear requisición sugerida** | [purchasing.view] o [production.view] |
| `/compras/ordenes` | Pestañas Todas, **Por aprobar**, Por recibir; búsqueda por folio o proveedor | [purchasing.view] |
| `/compras/ordenes/nueva`, `/:id` | Proveedor (fijo al guardar), entrega, fecha esperada; líneas del catálogo del proveedor con precio editable, IVA y totales en vivo (mismo redondeo que el backend); acciones Enviar, Aprobar, Rechazar, Cancelar, Cerrar con saldo, Recibir; requisición de origen por línea | [purchasing.view]; editar [purchasing.po.manage] |
| ★ `/compras/recepciones/nueva?oc=` | Tarjeta por línea con saldo, lote y caducidad, **"Otro lote"**, factura; aviso si excede lo pendiente; barra fija con costo | [purchasing.receive] |
| `/compras/recepciones`, `/:id` | Historial y detalle | [purchasing.view] |

### 7.8 Administración

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/admin/usuarios`, `/:id` | Datos, roles, ubicaciones, ubicación default, activar/desactivar, restablecer contraseña (con generador) | [security.users.manage] |
| `/admin/roles`, `/:id` | Matriz de permisos por módulo (Administrador bloqueado) | [security.roles.manage] |
| `/admin/bitacora` | Filtros por entidad, usuario y fechas; detalle con cambios formateados | [security.audit.view] |
| `/admin/configuracion` | Formulario armado desde `/settings` | [settings.manage] |
| `/demo/componentes` | Demostración de componentes compartidos | [settings.manage] |

### 7.9 Tablero (`/`)

Tarjetas según permisos y tipo de ubicación (`dashboardCards`); cada una enlaza a su lista filtrada por URL. Las alertas con conteo > 0 se resaltan en naranja. Skeleton, error con "Reintentar" y estado vacío.

- Bajo mínimo y lotes por caducar.
- Traspasos por recibir (sucursal) o por despachar (Planta); pedidos en curso (sucursal); pedidos por aprobar (Planta).
- OC por aprobar.
- **Producción de hoy por área** (barras horizontales planeado vs producido) y **OP en proceso**.
- Recetas con alza de insumos.
- Pedidos de cliente por surtir hoy o vencidos; remisiones por despachar.
- Con `locations.all`: barras de artículos bajo mínimo por ubicación (un tono, sin leyenda, tabla oculta para lector de pantalla); tocar una barra cambia de ubicación y abre Existencias filtradas.
- **Acciones rápidas en móvil** (hasta 4 según ubicación y permisos): "Recibir traspaso" y "Contar inventario" abren directo el único pendiente; "Cerrar producción" abre las OP en proceso.

Filtros por URL que usan las tarjetas: `?bajoMinimo=1`, `?porCaducar=1`, `?pestana=…`, `?estado=…&fecha=hoy`.

## 8. Componentes compartidos

| Componente | Responsabilidad |
|---|---|
| `app-page-header` | Título, migas (`BreadcrumbsService`) y acciones |
| `app-data-table` | `mat-table` + paginador (en español) + orden en modo servidor (`ListQuery` → `page/pageSize/sort/q`); plantillas `appCell`/`appCardDef`; filas expandibles (`appRowDetail`); selección (`selectable`, `[(selection)]`, conservada entre páginas); skeleton y vacío; tarjetas en móvil |
| `app-status-tag` | Etiqueta con color por estado |
| `app-item-picker` | Autocompletado de artículos (`/items/lookup`) por SKU o nombre, con foto, unidad y existencia opcional; filtros `type`, `presentation`, `areaId` |
| `app-lookup-picker` | Autocompletado genérico con búsqueda en servidor (proveedores, clientes) |
| `app-location-picker` | Selector de ubicaciones permitidas, filtrable por tipo |
| `app-qty-input` | Input decimal con unidad; `decimals` (0 automático si la unidad es `pza`), `max`, `allowZero`, salida `(entered)`; muestra el error del control padre |
| `app-lines-editor` | Líneas editables (`appLineColumn`), validadores de mínimo y únicos, totales; tarjetas en móvil |
| `app-confirm-summary` | Confirmación con resumen (`ConfirmService`) |
| `app-shortages-dialog`, `app-concurrency-dialog` | Diálogos de 409 (`ConflictHandler.handle(error)`) |
| `app-reason-dialog` | Motivo obligatorio (máx. 500) para rechazos y cierres con saldo |
| `app-audit-panel` | Historial de cambios (`/audit-log?entityId=`) |
| `app-stamp` | "fecha · nombre" en detalles |
| `app-item-photo` | Miniatura del artículo o sus iniciales; descarga con token y caché por revisión |
| `app-progress-meter` | Barra de avance accesible (`progressbar`) |
| `app-trace-graph`, `app-trace-card`, `app-trace-detail` | Mapa de trazabilidad por carriles con cintas proporcionales, tarjetas y ficha emergente por tipo de nodo (`trazabilidad-ui.md`; tokens `--pan-trace-*`) |
| `app-stock-level` | Existencia contra mín/máx |
| `app-csv-import` | Importación CSV (lector RFC 4180 con `,`/`;`, plantilla con BOM, vista previa, errores por fila) |
| `app-xlsx-import` | Importación de Excel en 3 pasos con validación en servidor |
| `app-shift-select` | Turno (Día, Tarde, Noche, sin turno) |
| `app-plan-table`, `app-close-timeline`, `app-explosion-list` | Componentes de producción (en `features/production/ui`) |
| `lot-split` | Reparto manual de lotes (`lotsSumValidator`), compartido por despacho, remisión y cierre |

Pipes: `qty`, `mxn`, `statusLabel`.

## 9. Pruebas

- **Unitarias obligatorias:** `AuthService` (refresh único ante 401 concurrentes), `permissionGuard` y `*hasPermission`, `error.interceptor` (400 → controles), pipes, `app-lines-editor`, `ThemeService`, acciones por estado de cada documento (`*Actions`), cierre (pendiente, máximo con tolerancia, recálculo de líneas no tocadas), `app-xlsx-import` (errores bloquean, avisos exigen casilla), y la prueba de que toda ruta tiene ayuda.
- **E2E (Playwright, escritorio y 390 px; tableta 1024 px en el cierre)** contra el backend con la semilla de desarrollo. Credenciales del admin de `PAN_E2E_ADMIN_EMAIL`/`PAN_E2E_ADMIN_PASSWORD` o de `deploy/.env`. Cada prueba documenta si mueve inventario.
  1. Login y menú filtrado (admin vs encargado de sucursal).
  2. Importación CSV de artículos con errores.
  3. Ajuste sin existencia → diálogo de faltantes.
  4. Conteo y consumo en 390 px sin scroll horizontal.
  5. Traspaso directo: despachar y recibir con faltante.
  6. Receta: nueva versión al editar una receta usada.
  7. **OP: liberar → cierre parcial (tableta y celular) → cierre final con faltante → lotes en Existencias.**
  8. **Importación de OP:** archivo con errores; archivo válido con aviso → confirmar → OP creadas (`e2e/fixtures/*.xlsx`).
  9. Compra: OC → aprobar → recibir → la existencia aumenta.
  10. Pedido de sucursal → aprobar → despachar → recibir con faltante (móvil).
  11. Pedido de cliente → confirmar → remisión parcial → despachar.
  12. Plan: pedido enviado → sugerido → generar OP ligada.
  13. Tablero por rol.
  14. Accesibilidad: axe (WCAG 2.1 A/AA, falla con serious/critical) en claro y oscuro en login, tablero, listas y flujos de captura.
  15. Tema: persistencia y "según el sistema".
  16. Ayuda: abrir, video, Esc y foco.
  17. Trazabilidad (`trazabilidad.md` §6.4, `trazabilidad-ui.md` §11): busca la OP, abre el mapa, selecciona el lote más antiguo de harina y la sucursal que no lo recibió queda atenuada; en celular, pestaña Resumen sin scroll horizontal; axe en claro y oscuro. Mueve inventario.
- **Lighthouse** (`npm run lighthouse`, accesibilidad con emulación móvil, ≥ 90): login, tablero, recepción de traspaso y cierre de producción.

## 10. Build y despliegue

- `environment.ts` con `apiBaseUrl: '/api/v1'`. En desarrollo, `proxy.conf.mjs` redirige `/api` y `/health` a `PAN_API_URL` (default `http://localhost:8090`).
- Scripts: `start`, `build`, `test`, `lint` (incluye `icons:check`), `e2e`, `api:types`, `icons`, `lighthouse`, `help:record` (graba con Playwright los videos de ayuda a 1024×640 sin guardar nada; los documentos de prueba que crea se cancelan).
- `frontend/Dockerfile` multi-stage: `node:24-alpine` (`npm ci && npm run build`) → `caddy:2-alpine` con `dist/.../browser` en `/srv`.
- `deploy/Caddyfile`:

```
{$PAN_DOMAIN} {
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

Assets con hash `immutable`; `index.html` `no-cache`.

## 11. Plan de implementación (tareas para Claude Code)

Cada tarea deja `npm run lint` y `npm test` en verde. **Una tarea por sesión, empezando en modo plan.** Cada tarea se hace después de su tarea de backend (regenerar tipos con `npm run api:types`). Las secciones que aún no existen muestran "Esta sección estará disponible pronto".

**Fase 1: base, administración, catálogos e inventario**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-01 | Proyecto Angular 22, Angular Material + tema Material 3 claro/oscuro (`ThemeService`), locale `es-MX`, fuentes e íconos locales (subconjunto), ESLint/Prettier, proxy, carpetas, Dockerfile | B-01 | `npm start` muestra el shell vacío con el tema; cambio de tema sin destello |
| F-02 | `api:types`, interceptores, `AuthService` (refresh al iniciar, Web Locks), login con fondo plexus, guardas, `*hasPermission`, `LocationContextService`, `/perfil` | B-03 | Login funcional; menú filtrado; la sesión sobrevive a F5 y a dos pestañas |
| F-03 | Layout (sidebar con etiqueta, topbar, drawer), estilos de §4.1, componentes compartidos base (`page-header`, `data-table`, `status-tag`, `item-picker`, `lookup-picker`, `location-picker`, `qty-input`, `lines-editor`, `confirm-summary`, diálogos de 409, `reason-dialog`, `stamp`) y `/demo/componentes` | F-02 | La demo muestra todos los componentes en claro y oscuro, escritorio y 390 px |
| F-04 | Administración: usuarios, roles, bitácora (`app-audit-panel`), configuración | B-04 | E2E 1 en verde |
| F-05 | Catálogos: ubicaciones, categorías, unidades, áreas, artículos (todos los campos y mín/máx), importación CSV | B-05 | E2E 2 en verde; alta de granel y su empaquetado ligado |
| F-06 | Inventario: existencias con lotes, kardex, ajustes, existencias iniciales | B-07 | E2E 3 en verde |
| F-07 | ★ Conteo físico (captura a ciegas, autoguardado) y consumo | B-08 | E2E 4 en verde |
| F-08 | Traspasos directos con despacho y ★ recepción | B-09 | E2E 5 en verde |

**Fase 2: producción**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-09 | Recetas con editor, versiones y componentes de tipo insumo | B-10 | E2E 6 en verde |
| F-10 | Órdenes de producción: lista con pestañas y avance, formulario con explosión, detalle con pestañas | B-11 | Las acciones cambian por estado y permiso (unitarias) |
| F-11 | ★ Cierre parcial y final, línea de tiempo de cierres, lista y detalle de cierres | B-12 | E2E 7 en escritorio, tableta y 390 px |
| F-12 | Importación de OP desde Excel (`app-xlsx-import`) e historial | B-13 | E2E 8 en verde |
| F-25 | ★ Vales internos entre subalmacenes (lista, formulario, enviar y recibir) y entrada "Vales internos" en el menú de Inventario | B-26b, F-08 | Vale de PLANTA-MP a PLANTA-PT: enviar → recibir con faltante; las existencias por subalmacén cambian (E2E, escritorio y 390 px) |

**Fase 3: compras**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-13 | Proveedores y artículos de proveedor | B-14 | Alta con RFC y precio preferido |
| F-14 | Requisiciones y conversión a OC | B-15 | Convertir varias requisiciones muestra las OC generadas |
| F-15 | Órdenes de compra y ★ recepciones | B-16 | E2E 9 en verde |

**Fase 4: pedidos, ventas y planeación**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-16 | ★ Pedidos de sucursal con sugerido y aprobación | B-17 | E2E 10 en verde |
| F-17 | Clientes y pedidos de cliente | B-18 | Alta de cliente con puntos de entrega; pedido confirmado |
| F-18 | ★ Remisiones con despacho, lotes e impresión | B-19 | E2E 11 en verde; impresión en una hoja carta |
| F-19 | Plan de producción con generación de OP; pestaña Pedidos del detalle de OP | B-20 | E2E 12 en verde |
| F-20 | Requerimiento de materia prima y requisición sugerida | B-21 | Faltante de harina → requisición en borrador |

**Fase 5: tablero, análisis y pulido**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-21 | Tablero (tarjetas, gráficas con Chart.js diferido, acciones rápidas) y resumen de producción | B-22 | E2E 13 en verde |
| F-22 | Costos de receta y análisis de consumo | B-23 | La receta muestra su costo por versión |
| F-23 | Fotos de artículos (`app-item-photo`, pestaña Foto, importación masiva por SKU) | B-24 | Subir desde el artículo y verla en el selector |
| F-24 | Pulido: ayuda contextual con videos, revisión móvil y tableta de todas las pantallas, accesibilidad (axe y Lighthouse), estados vacíos, build de producción con Caddy | todas | E2E 14–16 en verde; Lighthouse ≥ 90; sin scroll horizontal a 360 px |

**Ampliación: trazabilidad de lotes**

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-26 | Pantalla de trazabilidad (búsqueda, mapa y ficha emergente según `trazabilidad-ui.md`, resumen, bitácora, CSV) y accesos directos | B-28, F-11, F-15, F-16, F-18 | `trazabilidad.md` §6.5 y `trazabilidad-ui.md` §12 |
