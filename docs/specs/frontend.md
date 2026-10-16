# Especificación Frontend — SGO AR · Paníssimo Web

> Lee primero `docs/specs/dominio.md` (entidades, estados, reglas y permisos) y la sección de API de `docs/specs/backend.md`.
>
> **Punto de partida.** El frontend es el del **fork del SGO AR** (F-01..F-21 terminadas): Angular 22 + Angular Material, login con fondo plexus, tema claro/oscuro "neón azul", menú con etiqueta, ayuda contextual con videos, tablero, todas las pantallas de inventario, producción, logística y compras. **La interfaz se conserva igual** (decisión del cliente para esta versión): mismos componentes, tokens, estilos y patrones. Este documento define solo lo que cambia y las tareas nuevas, **F-22 en adelante**.

## 1. Objetivo y perfiles

SPA para operar Paníssimo desde computadora, tableta y celular:

- **Oficina** (dirección, compras, ventas a clientes): escritorio; plan, aprobaciones, pedidos de cliente, importación de Excel.
- **Planta** (jefe, supervisores y líderes de producción, almacén, distribución): **tableta** junto a la línea para cierres de producción; escritorio para el plan; despachos y remisiones.
- **Sucursales**: celular o tableta; pedidos, recepción de traspasos, conteos y consumo (sin cambios).
- **Administrador**: usuarios, roles, catálogos y configuración.

## 2. Stack [Heredado]

| Uso | Tecnología | Licencia |
|---|---|---|
| Framework | Angular 22 standalone, signals, `@if/@for`, zoneless | MIT |
| Componentes UI | Angular Material + CDK 22, Material 3 | MIT |
| Fuentes e íconos | `@fontsource/roboto`; subconjunto local de Material Symbols (`npm run icons`) | OFL-1.1 / Apache-2.0 |
| Gráficas | Chart.js 4.5 (carga diferida) | MIT |
| Tipos de la API | `openapi-typescript` | MIT |
| Pruebas | Vitest (runner del CLI), Playwright, `@axe-core/playwright`, Lighthouse | MIT / Apache-2.0 / MPL-2.0 |
| Calidad | `angular-eslint`, Prettier | MIT |

**Sin dependencias nuevas.** El Excel de OP **no se lee en el navegador**: se sube al backend, que valida y devuelve la vista previa; la plantilla la genera el backend. No agregar SheetJS (`xlsx`), ExcelJS ni similares. Prohibidos: PrimeNG v22+ y `@primeuix/*`, AG Grid Enterprise, Kendo, Tailwind (salvo decisión explícita).

## 3. Arquitectura [Heredado]

Igual que el SGO: `core/` (auth, http, context, layout, theme, help), `shared/` (componentes, directivas, pipes), `features/<feature>/{data-access,pages,ui}`, carga diferida por feature, `*.store.ts` con signals, `rxResource` para lecturas, Reactive Forms tipados, tipos de `schema.d.ts` (`npm run api:types`), textos en español y etiquetas de enums en `statusLabel` (un enum nuevo sin etiqueta rompe la compilación).

**Feature nuevo:** `features/sales/` (clientes, pedidos de cliente, remisiones). En `features/production/` se agregan `plan/`, `closes/` e `imports/`.

## 4. UI y experiencia [Heredado con ajustes]

- Layout, tema, formatos `es-MX`, confirmaciones con resumen, diálogos de faltantes y de concurrencia, estados vacíos, skeletons y accesibilidad: **igual que el SGO**.
- **Marca:** el título del sistema pasa a "SGO AR · Paníssimo" en la barra, el login ("Bienvenido / Sistema de Gestión Operativa AR · Paníssimo"), el `<title>` y el manifiesto. Se conserva el logo AR.
- **Etiquetas de ubicación:** `Factory` se muestra como **Planta**. `Commissary` no aparece en filtros ni selectores.
- **Etiquetas nuevas** (`statusLabel`):

| Enum | Valores |
|---|---|
| `ItemType` | Materia prima, **Insumo**, Semiterminado, Producto terminado |
| `ItemPresentation` | Granel, Empaquetado |
| `Shift` | Día, Tarde, Noche |
| `ProductionOrderStatus` | Borrador, Liberada, **En proceso**, Completada, Cancelada |
| `ProductionCloseKind` | Cierre parcial, Cierre final |
| `ShortfallReason` | Falta de insumo, Falta de personal, Falla de equipo, Ajuste de demanda, Otro |
| `ProductionOrderSource` | Manual, Plan, Importación |
| `CustomerOrderStatus` | Borrador, Confirmado, Surtido parcial, Surtido, Cerrado con saldo, Cancelado |
| `CustomerShipmentStatus` | Borrador, Despachada, Cancelada |
| `MovementType` | agrega "Remisión a cliente" |

- **Colores de estado nuevos:** `InProgress` (OP) azul; `Confirmed` azul; `PartiallyShipped` amarillo; `Shipped` verde; `Closed` (pedido de cliente) verde. El resto como en el SGO.
- **Avance de OP:** `app-progress-meter` (heredado) con producido / planeado; se marca en naranja si supera lo planeado (dentro de la tolerancia).
- **Cantidades en piezas:** `app-qty-input` recibe `decimals = 0` cuando la unidad base es `pza` (RN-03b).

## 5. Autenticación y permisos [Heredado]

Sin cambios: access token en memoria, refresh en cookie HttpOnly, `permissionGuard` con lista de permisos (basta uno), `*hasPermission`, ubicación activa. El menú agrega la sección **Ventas** (`sales.view`) y en **Producción**: Plan, Órdenes, Importar OP, Cierres, Áreas, Resumen.

## 6. Manejo de errores [Heredado]

Igual que el SGO. Códigos 422 nuevos se muestran con su `detail` en español. La importación usa su propia tabla de errores por fila (no el mapeo de formulario).

## 7. Pantallas

Rutas en español. Entre corchetes, el permiso mínimo. ★ = diseño para tableta/móvil prioritario.

### 7.1 Catálogos [Cambia]

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/catalogos/articulos` | Filtros nuevos: tipo **Insumo**, presentación y área. Columna "Presentación" | [catalog.view] |
| `/catalogos/articulos/nuevo`, `/:id` | Datos generales agrega: presentación (solo terminados), "Versión empaquetada de" (`item-picker` filtrado a granel, solo si es empaquetado), piezas por paquete, área de producción, múltiplo de OP y gramaje (g). En el detalle de un granel se listan sus versiones empaquetadas con enlace | [catalog.manage] |
| `/catalogos/articulos/importar` | Plantilla y guía con las columnas nuevas | [catalog.manage] |
| `/produccion/areas` | Lista y diálogo de alta/edición (código, nombre, orden, activa) | [production.view]; editar [production.areas.manage] |

### 7.2 Producción [Cambia]

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/produccion/plan` | **Plan de producción** (7.2.1) | [production.view] |
| `/produccion/ordenes` | Lista con pestañas **Por producir** (Liberadas), **En proceso**, **Borradores**, **Todas**; filtros de fecha, área, turno, origen e importación; columna de avance (`app-progress-meter`) y número de cierres | [production.view] |
| `/produccion/ordenes/nueva`, `/:id/editar` | Igual que el SGO más área (default la del producto) y turno; cantidad entera si es `pza` | [production.orders.manage] |
| `/produccion/ordenes/:id` | Detalle (7.2.2) | [production.view] |
| ★ `/produccion/ordenes/:id/cerrar?tipo=parcial\|final` | **Cierre de producción** (7.2.3). Reemplaza a `/:id/completar` | [production.orders.complete] |
| `/produccion/cierres`, `/:id` | Lista de cierres (fecha, OP, producto, área, turno, tipo, producido, costo, merma) y detalle con consumos y lotes | [production.view] |
| `/produccion/importar` | **Importar OP desde Excel** (7.2.4) | [production.orders.import] |
| `/produccion/importaciones`, `/:id` | Historial de importaciones y sus OP | [production.view] |
| `/produccion/resumen` | **Resumen de producción** por área, producto o día: planeado, producido, % cumplimiento, costo y merma (tabla y barras con Chart.js) | [production.view] |
| `/produccion/recetas…` | Igual que el SGO; el selector de componentes acepta insumos | [production.view] |

#### 7.2.1 Plan de producción

- Encabezado: ubicación (la Planta por omisión), rango de fechas (hoy + `production.plan_default_days`), área, búsqueda.
- Tabla agrupada por **fecha** y luego por **área**: SKU (con foto), producto, presentación, demanda (sucursales, clientes, stock, OP padre), existencia, OP pendientes, **por producir** (sugerido, resaltado si > 0). Cada renglón se expande para ver las líneas de pedido que lo originan (folio con enlace, sucursal o cliente, fecha, cantidad).
- Selección múltiple (`app-data-table` `selectable`) de los renglones con sugerido > 0; en cada renglón seleccionado, cantidad editable (prellenada con el sugerido; entero si es `pza`; múltiplo como pista, no como bloqueo) y turno opcional.
- Botón **"Generar OP (n)"** ([production.orders.manage]): confirmación con la tabla producto / fecha / área / cantidad → diálogo con los folios creados (enlaces) y botón "Ver órdenes del día".
- Los semiterminados aparecen con la etiqueta "Semiterminado" y la demanda de "OP padre".
- Estado vacío: "No hay nada por producir en este rango".

#### 7.2.2 Detalle de OP

- Encabezado con folio, estado, producto, receta (versión con enlace), área, turno, fecha, origen (con enlace a la importación si aplica) y `app-progress-meter` (producido / planeado).
- Acciones por estado y permiso (`productionOrderActions`): Liberar, Editar, Cancelar (borrador); Cancelar (liberada sin cierres); **Cierre parcial** y **Cierre final** (liberada o en proceso).
- Pestañas:
  - **Componentes**: teórico de lo planeado, consumo real acumulado, merma acumulada; mientras está abierta, disponibilidad actual (explosión, como el SGO).
  - **Cierres**: línea de tiempo con cada cierre (folio, tipo, fecha y hora, turno, usuario, producido, lote con caducidad, costo unitario, merma en $). Al expandir: consumo por componente y lotes.
  - **Pedidos**: pedidos que atiende (sucursal o cliente, folio con enlace, fecha, cantidad ligada).
  - **Historial**: `app-audit-panel`.
- Completada: resumen final (producido vs planeado, motivo de faltante si aplica, costo total y unitario promedio, merma total).

#### 7.2.3 ★ Cierre de producción (parcial o final)

Pensada para **tableta en la línea** (también funciona en celular de 390 px):

- Título "Cierre parcial — OP-000123 · BOMBAS" o "Cierre final — …"; producido hasta ahora y pendiente.
- **Cantidad producida en este cierre** con input grande (`inputmode="numeric"` si es `pza`). Prellenado: en parcial vacío; en final, el pendiente. En final se admite 0 si ya hay cierres (texto: "No se produjo más; solo cerrar la orden").
- Turno (default el de la OP) y notas.
- **Consumo real por componente**: tarjetas con el teórico para la cantidad capturada (lo trae `GET /production-orders/{id}/close-preview?qty=`, recalculado al dejar de escribir), consumo real prellenado y editable, existencia disponible y "Elegir lotes" opcional (reutiliza `lot-split`). Al cambiar la cantidad solo se recalculan las líneas que el usuario no tocó (igual que el SGO).
- **Cierre final con faltante**: si el total quedará por debajo de lo planeado aparece el selector de motivo (obligatorio) y notas (obligatorias con "Otro").
- **Aviso de sobreproducción**: si el total supera lo planeado se avisa en naranja; si supera la tolerancia se bloquea con el límite ("Máximo permitido: 3,300 pza").
- Barra de acción fija abajo con costo estimado, costo unitario y merma; botón "Registrar cierre parcial" o "Cerrar orden". Confirmación con resumen (producido, lote que se creará con su caducidad, consumos). 409 de faltantes → `shortages-dialog`; 409 de concurrencia → `concurrency-dialog`.
- Al terminar: aviso con el folio del cierre y del lote; regresa al detalle de la OP.

#### 7.2.4 Importar OP desde Excel

Mismo patrón visual que `app-csv-import`, pero la vista previa viene del servidor:

1. **Paso 1 — Archivo:** botón "Descargar plantilla" (`GET /production-order-imports/template`), selector de archivo `.xlsx` (máx. 5 MB; arrastrar y soltar en escritorio). Al elegirlo se envía a `/validate`.
2. **Paso 2 — Revisión:**
   - Con errores: tabla de errores (fila, columna, mensaje), filtrable; botón "Elegir otro archivo". No se puede continuar.
   - Sin errores: resumen "N filas → M órdenes", avisos (archivo ya importado, OP existentes) con casilla **"Entiendo los avisos y quiero continuar"**, tabla de órdenes a crear (fecha, SKU, producto, área, turno, cantidad, filas de origen), y la opción **"Liberar las órdenes al importar"** (visible con [production.orders.manage]).
3. **Paso 3 — Resultado:** folio `IMP-…` con enlace, número de OP creadas y botón "Ver órdenes" (lista filtrada por la importación).

El archivo se conserva en memoria del componente para reenviarlo en el alta (el servidor revalida). Si el usuario cambia de archivo se reinicia el flujo.

### 7.3 Ventas a terceros [Nuevo]

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/ventas/clientes` | Lista con búsqueda por código, nombre o RFC; "Mostrar inactivos" | [sales.view] |
| `/ventas/clientes/nuevo`, `/:id` | Pestañas **Datos generales** (código, nombre, RFC opcional con la validación de proveedores, contacto, teléfono, correo, notas, activo), **Puntos de entrega** (lista y diálogo) y **Artículos** (SKU del cliente y precio informativo, solo empaquetados; D-06). Historial | [sales.view]; editar [sales.customers.manage] |
| `/ventas/pedidos` | Lista con pestañas **Por surtir** (confirmados y surtido parcial), **Borradores**, **Todos**; filtros de cliente, fecha requerida y estado; columna de avance | [sales.view] |
| `/ventas/pedidos/nuevo`, `/:id/editar` | Cliente (`lookup-picker`), punto de entrega (del cliente), fecha requerida (mañana por omisión), referencia del cliente, notas; líneas con `item-picker` filtrado a empaquetados, cantidad (entera si `pza`), precio opcional. "Guardar borrador" o "Guardar y confirmar" | [sales.orders.manage] |
| `/ventas/pedidos/:id` | Detalle: pedido / remisionado / pendiente por línea, remisiones (enlaces), OP ligadas (enlaces y avance), acciones (Confirmar, Editar, Cancelar, **Nueva remisión**, Cerrar con saldo con motivo) | [sales.view] |
| `/ventas/remisiones` | Lista con pestañas **Por despachar** (borradores) y **Todas**; filtros de cliente y fecha | [sales.view] |
| ★ `/ventas/remisiones/:id` | Borrador: cantidades por línea (máx. el saldo más la tolerancia), datos de envío (vehículo, chofer, recibe), "Elegir lotes" por línea; **Despachar** con confirmación y diálogo de faltantes. Despachada: solo lectura con lotes y costo; botón **Imprimir** (vista de impresión con CSS `@media print`, sin librerías de PDF) | [sales.view]; despachar [sales.shipments.dispatch] |

### 7.4 Tablero [Cambia]

Se agregan tarjetas según permisos y la ubicación activa (Planta):

- **OP en proceso** (con avance promedio) → `/produccion/ordenes?pestana=en-proceso`.
- **Producción de hoy por área**: barras horizontales planeado vs producido (Chart.js, mismo estilo del SGO).
- **Pedidos de cliente por surtir hoy o vencidos** → `/ventas/pedidos?pestana=por-surtir`.
- **Remisiones por despachar** → `/ventas/remisiones?pestana=por-despachar`.
- Acciones rápidas en móvil (F-21) agregan "Cerrar producción" (abre la lista En proceso) para el rol de supervisor.

### 7.5 Ayuda contextual [Heredado]

Toda ruta nueva necesita su entrada en `core/help/help-content.ts` (la prueba unitaria falla si falta). Videos (`npm run help:record`) para: cierre de producción, plan de producción, importar OP, pedido de cliente y remisión.

## 8. Componentes compartidos

Se reutilizan todos los del SGO. Nuevos o ajustados:

| Componente | Responsabilidad |
|---|---|
| `app-item-picker` **[Cambia]** | Entradas `presentation` y `areaId` para filtrar |
| `app-qty-input` **[Cambia]** | `decimals` automático a 0 cuando se le pasa `uom = 'pza'` |
| `app-close-timeline` **[Nuevo]** (`features/production/ui`) | Línea de tiempo de cierres de una OP |
| `app-plan-table` **[Nuevo]** (`features/production/ui`) | Tabla del plan agrupada por fecha y área, con selección y cantidad editable |
| `app-xlsx-import` **[Nuevo]** (`shared/components`) | Flujo de 3 pasos con validación en servidor: archivo → revisión (errores, avisos, vista previa) → resultado. Genérico para futuras importaciones de Excel |
| `app-shift-select` **[Nuevo]** | Selector de turno (Día, Tarde, Noche, sin turno) |

## 9. Pruebas

Se conservan las del SGO (ajustando el E2E 08 de producción al nuevo flujo). Nuevas:

- **Unitarias:** `productionOrderActions` por estado y permiso; cálculo del pendiente y del máximo con tolerancia en el cierre; recálculo de líneas no tocadas; agrupación visual del plan; `customerOrderActions`; pasos de `app-xlsx-import` (errores bloquean, avisos exigen casilla).
- **E2E (Playwright, escritorio y 390 px donde hay ★):**
  1. `19-production-partial-close`: OP liberada → cierre parcial (tableta 1024 px y celular) → cierre final con faltante y motivo → lotes en Existencias.
  2. `20-production-plan`: pedido de sucursal enviado → plan muestra el sugerido → generar OP → la OP aparece ligada al pedido.
  3. `21-op-import`: archivo con errores (tabla), archivo válido con aviso de duplicado → confirmar → OP creadas. Los `.xlsx` de prueba se versionan en `e2e/fixtures/`.
  4. `22-customer-order-shipment`: cliente → pedido → confirmar → remisión parcial → despachar → pedido "Surtido parcial".
  5. Axe sin violaciones serias en las pantallas nuevas (claro y oscuro); Lighthouse ≥ 90 en el cierre de producción.

## 10. Build y despliegue [Heredado]

Sin cambios: `environment.ts` con `/api/v1`, proxy de desarrollo, `frontend/Dockerfile` (node → caddy) y `deploy/Caddyfile`. Los archivos de importación pasan por `/api` sin cambios en Caddy (límite de 5 MB en la API).

## 11. Plan de implementación (tareas para Claude Code)

Cada tarea deja `npm run lint` y `npm test` en verde. Una tarea por sesión, empezando en modo plan. El backend de cada tarea debe estar terminado antes (regenerar tipos con `npm run api:types`).

| ID | Tarea | Requiere | Criterio de aceptación |
|---|---|---|---|
| F-22 | Adaptar el fork: marca "SGO AR · Paníssimo" (barra, login, título, manifiesto), etiqueta **Planta**, quitar comisariato de filtros y selectores, menú con las secciones nuevas como "disponible pronto", ajustar E2E heredados a `PLANTA`/sucursales del CSV | B-22 | E2E 01 y 14 en verde; ningún texto "Comisariato" ni "cafetería" visible |
| F-23 | Catálogos: tipo Insumo, presentación, versión empaquetada, área, múltiplo y gramaje en artículos; importación CSV con columnas nuevas; pantalla de áreas; filtros nuevos en `item-picker` y listas | B-23 | E2E: alta de granel y su empaquetado ligado; el pedido de sucursal no ofrece empaquetados |
| F-24 | **OP con cierres**: lista con pestañas y avance, detalle con pestañas (componentes, cierres, pedidos, historial), ★ pantalla de cierre parcial/final, lista y detalle de cierres; área y turno en el formulario; quitar `/completar` | B-24 | E2E 19 en escritorio, tableta (1024 px) y celular (390 px) sin scroll horizontal |
| F-25 | **Plan de producción** con generación de OP; pestaña Pedidos en el detalle de OP | B-25 | E2E 20 en verde |
| F-28 | **Importar OP desde Excel** (`app-xlsx-import`) e historial de importaciones | B-28 | E2E 21 en verde |
| F-26 | **Clientes y pedidos de cliente** | B-26 | Alta de cliente con puntos de entrega; pedido confirmado aparece en el plan |
| F-27 | **Remisiones** con despacho, lotes y vista de impresión | B-27 | E2E 22 en verde; impresión en una hoja carta con datos del cliente, punto de entrega y líneas |
| F-29 | Tablero (tarjetas nuevas y acción rápida) y **Resumen de producción** | B-29 | Las tarjetas cambian por rol; el resumen por área coincide con la API |
| F-30 | Pulido: ayuda contextual y videos de las pantallas nuevas, revisión móvil/tableta, axe y Lighthouse, estados vacíos, subconjunto de íconos actualizado, build de producción | todas | 100 % de rutas con ayuda; Lighthouse ≥ 90 en login, tablero y cierre de producción |

**Orden sugerido:** F-22 → F-23 → F-24 → F-25 → F-28 → F-26 → F-27 → F-29 → F-30, cada una después de su tarea de backend.
