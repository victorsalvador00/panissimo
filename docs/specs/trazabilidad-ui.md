# Especificación de interfaz — Mapa de trazabilidad (F-26)

> Complementa a `docs/specs/trazabilidad.md` y **reemplaza su §6.3 (pestaña Mapa)**. Describe el diseño aprobado en el prototipo "Trazabilidad MICHAS OP-000412" (versión 2) y cómo llevarlo a Angular 22 con Angular Material, dentro del sistema visual de `frontend.md` §4.
>
> El prototipo usa la marca AR (azul marino y dorado) porque se presentó al cliente. En el sistema, los colores salen de los tokens del tema (§3); la estructura, las medidas y el comportamiento son los del prototipo.

## 1. Objetivo de la pantalla

Que una persona de calidad, producción o dirección responda en menos de un minuto:

1. ¿De dónde viene lo que recibió esta sucursal? (proveedores, OC, lotes de materia prima, cierre de producción)
2. ¿A dónde llegó este lote de materia prima o esta OC? (lotes terminados, sucursales, piezas y existencia actual)

Principios del diseño:

- **Etapas fijas y reconocibles:** la cadena siempre se lee de izquierda a derecha en los mismos carriles, sin importar el punto de entrada.
- **La cantidad se ve, no solo se lee:** el producto viaja como una cinta cuyo grosor es la cantidad de piezas.
- **El detalle está junto al elemento:** al hacer clic, la ficha se abre al lado de la tarjeta, sin perder el mapa de vista.
- **Una sola cifra por tarjeta:** la tarjeta dice qué es y cuánto; el resto vive en la ficha.

## 2. Anatomía

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ app-page-header: "Trazabilidad · OP-000412"           [Exportar CSV]         │
│ Entrada: OP-000412 · MICHAS   Estado al 21/10/2026 07:30   avisos (chips)    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Pestañas:  Mapa | Resumen | Bitácora                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Origen | Cadena completa | Destino]          [−] [100 %] [+] [Ver todo]     │
│ Leyenda: ▬ producto (grosor = piezas)  ─ materia prima  ┄ proveedor  ▬ rojo  │
├──────────────────────────────────────────────────────────────────────────────┤
│ 1 Proveedor │ 2 Orden de compra │ 3 Producción │ 4 Lote │ 5 Almacén │ 6 Envío │ 7 Sucursal │
│  [tarjeta]  │ [tarjeta]         │ ┌OP-000412─┐ │        │ ┌PLANTA─┐ │         │            │
│      ┄┄┄┄┄┄ │ [tarjeta] ───────►│ │[cierre]  │═══►[lote]══►│[exist.]│══►[TR]══►[SUC]       │
│             │ [tarjeta]         │ │[cierre]  │═══►[lote]══►│[exist.]│══►[TR]══►[SUC]       │
│             │      …            │ └──────────┘ │        │ └───────┘ │         │            │
├──────────────────────────────────────────────────────────────────────────────┤
│ Barra de selección: Destino · 1 OC · 1 cierre · SUC-01, SUC-02 · 1,800 pzas  │
└──────────────────────────────────────────────────────────────────────────────┘
                                            ┌ Ficha emergente ───────────────┐
                                            │ ícono  tipo · folio      [X]   │
                                            │ estadísticas 2×2               │
                                            │ secciones propias del tipo     │
                                            │ [Origen][Cadena][Destino]      │
                                            └────────────────────────────────┘
```

## 3. Tokens y tipografía

Agregar a `styles/_tokens.scss`, con `light-dark()` como el resto del tema. Los valores oscuros se ajustan al modo "neón azul" del sistema: el contenido usa grises de Material, así que las cintas conservan el tono cálido para distinguirse del azul de la interfaz.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--pan-trace-lane` | `#F7F8FB` | `#161A22` | Fondo de carriles impares |
| `--pan-trace-lane-alt` | `#EFF2F7` | `#12161D` | Fondo de carriles pares |
| `--pan-trace-flow` | `#C79A55` | `#C79A55` | Cinta de producto (con opacidad 0.5; 0.85 seleccionada) |
| `--pan-trace-edge` | `#A3ABBE` | `#56627F` | Línea de materia prima y de proveedor |
| `--pan-trace-lot` | `#B8863B` | `#D5A75F` | Borde izquierdo de las tarjetas de lote |
| `--pan-trace-lot-tint` | `#F6EDDD` | `#2C2416` | Fondo del ícono de la ficha y de la etiqueta de caducidad |
| `--pan-trace-warn` | estado naranja/rojo del sistema | variante oscura | Recepción con diferencia |
| `--pan-trace-selected` | primario del tema | primario del tema | Contorno de la tarjeta seleccionada y aristas resaltadas de materia prima |

- **Tipografía:** Roboto, la del sistema. Los folios y las cifras van en Roboto de peso 500 con `font-variant-numeric: tabular-nums`. **No se agrega una fuente monoespaciada.**
- **Escala:** etiqueta de carril 12 px en mayúsculas con 0.08 em de espaciado; tipo de tarjeta 11.5 px; folio 13.5 px/500; cifra principal 16 px/600; línea secundaria 12 px; título de la ficha 18 px/500.
- **Formatos:** los de `frontend.md` §4.2 (pipes `qty`, `mxn`; fechas `dd/MM/yyyy HH:mm`). En tarjetas, fecha corta `21-oct 05:40`.

## 4. Mapa

### 4.1 Carriles

Siete carriles fijos, en este orden y con su ícono de Material Symbols (agrégalos al subconjunto con `npm run icons`):

| # | Carril | Nodos que van ahí | Ícono |
|---|---|---|---|
| 1 | Proveedor | `Supplier`, `InitialStock` | `storefront` |
| 2 | Orden de compra | `PurchaseReceipt` + su `Lot` de materia prima (compactados, ver §4.4) | `receipt_long` |
| 3 | Producción | `ProductionClose` dentro del grupo de su OP | `factory` |
| 4 | Lote | `Lot` terminado o semiterminado | `sell` |
| 5 | Almacén | `Stock` en la Planta, dentro del grupo de la ubicación | `inventory_2` |
| 6 | Envío | `Transfer`, `CustomerShipment` | `local_shipping` |
| 7 | Destino | `Stock` en sucursal, `Customer` | `store` |

- **Encabezado del carril** (alto 56 px): número de etapa, ícono, nombre y, a la derecha, el número de nodos del carril. Línea divisoria de 1 px debajo.
- **Fondo alterno** con `--pan-trace-lane` y `--pan-trace-lane-alt`.
- **Semiterminados (varios niveles):** cada nivel adicional inserta a la izquierda del carril 3 un par de carriles "Producción · nivel N" y "Lote · nivel N". Así la cadena siempre avanza a la derecha. Si un carril queda vacío, se oculta.

### 4.2 Medidas

| Constante | Valor | Notas |
|---|---|---|
| Ancho de carril | 248 px | |
| Tarjeta | 184 × 88 px | Centrada en el carril (32 px de margen a cada lado) |
| Paso vertical | 104 px | Distancia entre tarjetas del mismo carril |
| Margen superior | 72 px | Encabezado del carril + 16 px |
| Grupo (OP, ubicación) | carril − 20 px de ancho | Encabezado de 52 px (ubicación) o 112 px (OP con barra de avance) |

### 4.3 Orden vertical

`trace-layout.ts`, funciones puras sin dependencias de Angular:

1. **Orden inicial:** carril 1 por nombre de proveedor; carril 2 agrupado por proveedor y por OC, en orden de fecha.
2. **Baricentro hacia adelante:** del carril 3 en adelante, cada nodo toma el promedio de la fila de sus padres; los empates se resuelven por fecha y luego por folio.
3. **Baricentro hacia atrás:** una pasada de derecha a izquierda para acercar los proveedores a sus OC.
4. **Separación:** dentro de un carril, ninguna tarjeta queda a menos de un paso (104 px) de la anterior. Los grupos reservan su encabezado arriba de su primera tarjeta.
5. **Alto del lienzo:** última fila + 88 + 16 px.

Prueba unitaria con el escenario de `trazabilidad.md` §9: el resultado debe quedar en el mismo orden que el prototipo.

### 4.4 Compactación

Es solo presentación; el JSON de `/traceability/graph` no cambia.

- Un `PurchaseReceipt` con un solo `Lot` se dibuja como **una** tarjeta en el carril 2 (OC, lote, cantidad usada).
- El `Stock` de un lote de materia prima o semiterminado en la Planta no se dibuja: la arista va del lote al cierre.
- `InitialStock` se dibuja en el carril 1 como "Existencia inicial · AJ-…".

### 4.5 Aristas

SVG en una capa debajo de las tarjetas, con `pointer-events: none`. Trazo cúbico del borde derecho del origen al borde izquierdo del destino, con los puntos de control a la mitad de la distancia horizontal.

| Tipo | Cuándo | Trazo | Etiqueta |
|---|---|---|---|
| Proveedor | `Supplier → PurchaseReceipt` | 1.3 px, punteado `2 4`, `--pan-trace-edge` | — |
| Materia prima | `Lot → ProductionClose` | 1.3 px, `--pan-trace-edge` | Cantidad con unidad, **solo** al seleccionar |
| Producto | `ProductionClose → Lot` y todo lo que sigue | Grosor proporcional, `--pan-trace-flow`, opacidad 0.5 | Cantidad siempre visible |
| Diferencia | `Transfer → Stock` con `ReceivedQty < ShippedQty` | Como producto, en `--pan-trace-warn` | "990 de 1,000" |
| Rechazo | `CustomerShipment → Rejection` (RN-114) | Como diferencia, en `--pan-trace-warn` | "15 pza" |

- **Grosor del producto:** `max(2.5, 12 × qty / maxQty)`, donde `maxQty` es la mayor cantidad de una arista de producto en el grafo.
- **Puertos apilados (estilo Sankey):** en cada tarjeta, las aristas de salida se ordenan por la posición vertical del destino y se apilan centradas en la mitad de la tarjeta, cada una con su grosor y 3 px de separación (5 px entre líneas finas). Lo mismo con las de entrada, por la posición del origen. Así las cintas no se enciman.
- **Etiquetas:** texto de 11.5 px con números tabulares y un trazo del color del fondo detrás (`paint-order: stroke`) para que se lean sobre las líneas. Van en el punto medio de la curva (al 30 % en las de materia prima) y 4 px arriba del borde de la cinta.

### 4.6 Tarjetas

`app-trace-card`: un `button` de 184 × 88 px, radio de 10 px, borde de 1 px. Siempre tiene cuatro renglones, sin saltos de línea; lo que no cabe termina en puntos suspensivos y se lee completo en la ficha.

1. **Encabezado:** ícono del tipo en un cuadro de 20 px, tipo o artículo y, a la derecha, una etiqueta de estado opcional.
2. **Título:** folio o nombre.
3. **Cifra principal:** número y unidad en gris.
4. **Línea secundaria:** fecha o dato de contexto.

| Tipo | Encabezado | Etiqueta | Título | Cifra | Línea secundaria |
|---|---|---|---|---|---|
| Proveedor | Código | — | Razón social | `2 OC recibidas` | Artículos |
| OC (recepción + lote) | Artículo | — | Folio OC | `113.19 kg usados` | `Lote HT-2610-A · rec. 10-oct` |
| Cierre | `Cierre parcial · #1` | Parcial / Final (verde) | Folio CP | `1,800 pzas` | Fecha y hora |
| Lote | `Lote terminado` | Días para caducar (dorado; naranja si ya está en alerta, RN-07) | Número de lote | `1,800 pzas` | `Caduca 22-oct-2026` |
| Almacén | `Existencia del lote` | — | Número de lote | `400 pzas de saldo` | `2 salidas a sucursal` |
| Traspaso | `PLANTA → SUC-02` | Recibido (verde) / Diferencia (naranja) | Folio TR | `1,000 pzas enviadas` | `Sale 05:55 · 55 min` |
| Sucursal | `Sucursal` | Completo (verde) / `−10` (naranja) | Código | `990 de 1,000 pzas` | `Recibió 06:50` |
| Remisión | Cliente | Entregada (verde) / Con rechazo (naranja) | Folio RM | Piezas | Fecha |
| Rechazo (carril Destino, RN-114) | `Rechazo del cliente` | Regresó / Merma (naranja) | Folio RM | `15 pza rechazadas` | `10 pza a PLANTA-PT · 5 pza merma` |

- **Lote:** borde izquierdo de 4 px en `--pan-trace-lot`.
- **Diferencia:** borde completo en `--pan-trace-warn`.
- **Grupos:** la OP es un recuadro con encabezado clicable (tipo, folio, producto, fecha y turno, barra de avance de 6 px y "3,500 de 3,500 pzas · Completada"). La ubicación de almacén es un recuadro con nombre, condición y saldo.

### 4.7 Estados visuales

| Estado | Tarjetas | Aristas |
|---|---|---|
| Reposo | Opacidad 1 | Producto 0.5, finas 1 |
| Cursor encima (sin selección) | Cadena 1, resto 0.6 | Cadena 1, resto 0.22 |
| Seleccionado | Cadena 1, resto 0.28; la elegida con contorno de 2 px en `--pan-trace-selected` | Cadena resaltada; las de materia prima se oscurecen y muestran su cantidad; resto 0.1 |
| Ficha abierta | La tarjeta conserva el contorno mientras la ficha está abierta | — |

Transiciones de 180 ms en opacidad, borde y sombra. Con `prefers-reduced-motion` no hay transiciones.

## 5. Interacción

### 5.1 Controles

- **Dirección** (`mat-button-toggle-group`): Origen, Cadena completa y Destino. Al abrir la pantalla toma el valor de la URL (`?direccion=`) o el de RN-100 según el tipo de entrada. Cambiarlo recalcula el resaltado de la selección actual **sin volver a llamar a la API**: el grafo ya trae ambas direcciones cuando la entrada es `Both`. Si la entrada fue de una sola dirección, el botón contrario vuelve a consultar.
- **Zoom:** −, porcentaje (vuelve a 100 %), + y "Ver todo". El rango es de 45 % a 130 % en pasos de 10 %. El lienzo se escala con `transform: scale()` y el contenedor toma el tamaño escalado. En pantallas de 1400 px o más abre en "Ver todo"; en las demás, al 100 %. El último zoom se recuerda en `localStorage` (`pan.trace.zoom`), dentro de `try/catch`.
- **Desplazamiento:** el mapa vive en un contenedor con scroll horizontal propio (la página nunca se desplaza a lo ancho). Con mouse, arrastrar el fondo lo mueve (cursor `grab` / `grabbing`). Un arrastre de más de 3 px no cuenta como clic.

### 5.2 Selección

- **Cursor encima** de una tarjeta: vista previa de su cadena completa (§4.7). No hay vista previa si ya hay una selección.
- **Clic o Enter** en una tarjeta o en el encabezado de un grupo: la selecciona, resalta su cadena según la dirección y abre la ficha. Seleccionar un grupo equivale a seleccionar todos sus cierres o existencias.
- **Clic en la misma tarjeta** con la ficha abierta: cierra la ficha y conserva el resaltado.
- **Clic en el fondo del mapa:** quita la selección y cierra la ficha.
- **Esc:** primero cierra la ficha; un segundo Esc quita la selección.
- **Cadena:** se recorre en `trace-selection.ts` (función pura) hacia atrás y hacia adelante desde la semilla, sin mezclar ramas: un hermano del nodo seleccionado no se resalta.

### 5.3 Barra de selección

Debajo del mapa, dentro de la misma tarjeta, con `aria-live="polite"`.

- **Sin selección:** "Toca una tarjeta para ver su detalle y resaltar su cadena. Arrastra el mapa para recorrerlo."
- **Con selección:** la dirección y chips con lo que alcanza: proveedores, OC distintas, lotes de materia prima, cierres, lotes terminados, traspasos, sucursales (por código, resaltadas) y piezas enviadas (suma de las aristas `Stock → Transfer` resaltadas). Al final, el enlace "Quitar selección".

### 5.4 Teclado

- Orden de tabulación: controles → tarjetas por carril, de arriba abajo → barra de selección.
- Enter o espacio en una tarjeta abre la ficha. Al abrirse, el foco pasa al título de la ficha. Al cerrarla, el foco regresa a la tarjeta.
- Con el foco en una tarjeta, las flechas ← y → van al primer padre y al primer hijo; ↑ y ↓ van a la tarjeta anterior y siguiente del mismo carril. El elemento enfocado se desplaza a la vista.

## 6. Ficha emergente

### 6.1 Contenedor

- **Escritorio y tableta (≥ 768 px):** CDK Overlay con `FlexibleConnectedPositionStrategy` anclada a la tarjeta. Posiciones en orden de preferencia: a la derecha (12 px de separación, alineada 8 px arriba del borde superior), a la izquierda y, si no cabe en ninguna, debajo o arriba. Margen de 16 px con el borde de la ventana. Se reposiciona al hacer scroll, al cambiar el zoom y al cambiar el tamaño de la ventana. Ancho de 400 px, alto máximo `min(640px, 100vh − 32px)` con scroll interno en el cuerpo. No es modal: el mapa sigue siendo usable y un clic fuera la cierra.
- **Celular (< 768 px):** `MatBottomSheet` con alto máximo del 82 % de la pantalla, fondo atenuado y margen inferior para la zona segura. Es modal y se cierra con el fondo, la X o el gesto de bajar.
- **Animación:** aparece en 160 ms (desplazamiento de 4 px y opacidad); la hoja inferior sube en 200 ms. Sin animación con "reducir movimiento".
- **Accesibilidad:** `role="dialog"`, `aria-labelledby` al título; en la hoja inferior, además, `aria-modal="true"`.

### 6.2 Estructura

1. **Encabezado:** ícono del tipo en un cuadro de 34 px con fondo `--pan-trace-lot-tint`; tipo; título (folio o nombre, 18 px); subtítulo; etiqueta de estado (`app-status-tag` si es un estado de documento); botón cerrar (`aria-label="Cerrar detalle"`).
2. **Estadísticas:** rejilla de 2 × 2 con cifra (16 px, números tabulares) y etiqueta. Las cifras de alerta van en naranja y las completas en verde.
3. **Secciones propias del tipo** (§6.3), cada una con título en mayúsculas de 12 px.
4. **Pie:** "Resaltar" con Origen, Cadena completa y Destino (cambian la dirección global); "Abrir documento" (enlace a la pantalla del documento, `document-links.ts`); y "Rastrear desde aquí" (abre `/inventario/trazabilidad/:tipo/:id` con este nodo como entrada).

### 6.3 Contenido por tipo

| Tipo | Estadísticas (2 × 2) | Secciones |
|---|---|---|
| **Proveedor** | OC en la cadena · lotes usados · subtotal sin IVA\* · condiciones de pago | Tabla de OC (folio, fecha, estado, subtotal\*) · tabla de lotes que llegaron a la cadena (artículo, lote, usado) |
| **OC / recepción** | Comprado (unidad base) · usado en la cadena · precio por unidad base\* · caducidad con "caduca en N días" | Barra de uso del lote (% usado y lo que no se usó en esta cadena) · datos de la recepción (folio, fecha, factura, presentación, lote, caducidad) · consumo por cierre (cierre, teórico, real, costo\*) con total · nota FEFO cuando el lote se agotó |
| **Orden de producción** | Planeado · producido (verde si llega al 100 %) · costo total\* · costo por pieza\* | Barra de avance · recorrido de estados con fecha (creada, liberada, cada cierre, completada) · datos (receta y versión, área y turno, fecha, origen, merma) · pedidos que atiende (folio, sucursal o cliente, piezas) con total · motivo de faltante si lo hay |
| **Cierre** | Producido · costo del cierre\* · costo por pieza\* · merma\* | Datos (fecha y turno, quién registró, lote generado, caducidad y vida útil) · consumo real por lote (componente, lote o "sin lote", cantidad, costo\*) con total · nota de qué cambió en la OP (pasó a En proceso o quedó completa) |
| **Lote terminado** | Producido · caducidad · costo por pieza\* · en existencia hoy | Barra apilada "Dónde está hoy" (una sección por ubicación y otra en naranja para pérdidas en tránsito) con su lista · origen (cierre, OP, fecha de alta, número de lotes de materia prima) · aviso si está en alerta de caducidad (RN-07) |
| **Existencia (almacén)** | Entró · salió · saldo · número de salidas | Kardex del lote en esa ubicación (hora, documento, movimiento, piezas con signo, saldo corrido) |
| **Traspaso** | Enviado · recibido (naranja con diferencia) · diferencia · minutos en tránsito | Aviso de diferencia (cantidad, motivo, notas y de qué lote salió) · envío (pedido con solicitado y aprobado, aprobación, despacho y unidad, recepción) · tabla por lote (enviado, recibido) con total |
| **Sucursal** | Recibido · enviado · existencia actual · hora de recepción | Existencia por lote (lote, piezas, caducidad con días) · llegó por (traspaso, pedido, unidad) · consumos y mermas de esos lotes, si los hay |
| **Remisión / cliente** | Remisionado · lotes · fecha · punto de entrega | Lotes (lote, piezas) · pedido del cliente y referencia |

\* **Costos y precios** se muestran solo si la respuesta los trae: requieren `production.view` (costos de cierre y OP) o `purchasing.view` (precios y subtotales de OC), ver §8. Sin el permiso, esa estadística se reemplaza por la siguiente disponible y las columnas de costo no aparecen.

Componentes: `app-trace-detail` elige el contenido por `node.type`. Un componente por tipo (`trace-detail-supplier`, `-receipt`, `-order`, `-close`, `-lot`, `-stock`, `-transfer`, `-branch`, `-shipment`) más tres piezas compartidas en `features/inventory/ui/trace`: `trace-stats`, `trace-meter` (barra con dos leyendas) y `trace-stack` (barra apilada con lista).

## 7. Pestañas Resumen y Bitácora

- **Resumen:** igual a `trazabilidad.md` §6.3 punto 2. En celular es la pestaña inicial.
- **Bitácora:** tabla agrupada por día (renglón de fecha con fondo `--pan-trace-lane-alt`: "Mar 21-oct-2026"). Columnas: hora, documento, evento con un punto de color por etapa (compras gris, producción dorado, envío neutro, diferencia naranja), artículo y lote, cantidad con signo y ubicación. Cada renglón es enfocable; con clic o Enter cambia a la pestaña Mapa, centra la tarjeta del evento y abre su ficha.

## 8. Ajustes a B-28 (datos que pide la ficha)

Agregar a la respuesta de `/traceability/graph` (`trazabilidad.md` §5.3). Todos son de solo lectura y ya existen en los documentos.

| Nodo o grupo | Campos nuevos | Condición |
|---|---|---|
| raíz | `asOf` (momento de la consulta) | — |
| `Supplier` | `paymentTermsDays` | — |
| `PurchaseReceipt` | `unitPrice` (por unidad de compra), `unitCostBase`, `purchaseOrderSubtotal`, `purchaseOrderStatus` | Precio y subtotal solo con `purchasing.view` |
| `Lot` | `unitCost` (lotes producidos), `createdAt` | Costo solo con `production.view` |
| `ProductionClose` | `totalCost`, `unitCost`, `wasteCost`, `closedByName`, `lines: [{ itemId, sku, itemName, lotId?, lotNumber?, theoreticalQty, actualQty, unitCost }]` | Costos solo con `production.view` |
| `ProductionOrder` (grupo) | `recipeName`, `recipeVersion`, `source`, `statusHistory: [{ status, at, byName }]`, `demands: [{ type, folio, partyName, quantity }]`, `totalCost`, `unitCost`, `shortfallReason` | Costos solo con `production.view` |
| `Stock` | `movements: [{ at, type, folio, quantity, balance }]` (solo los del lote en esa ubicación, máximo 50; más allá, `movementsTruncated: true`) | — |
| `Transfer` | `requestedQty`, `approvedQty`, `approvedAt`, `driverName`, `lines: [{ lotId, lotNumber, shippedQty, receivedQty, discrepancyReason?, discrepancyNotes? }]` | — |

Los campos sujetos a permiso llegan en `null` cuando el usuario no lo tiene; la ficha no muestra la estadística ni la columna. Prueba de integración: un usuario con `inventory.traceability` pero sin `production.view` recibe `totalCost: null`.

## 9. Responsivo

| Ancho | Comportamiento |
|---|---|
| ≥ 1400 px | Mapa en "Ver todo"; ficha a la derecha de la tarjeta |
| 768–1399 px | Mapa al 100 % con scroll horizontal interno; ficha a la derecha o a la izquierda según el espacio |
| < 768 px | Pestaña inicial Resumen; el mapa funciona con scroll táctil (sin arrastre de mouse) y la ficha es hoja inferior; controles en dos renglones; leyenda en lista |

En 360 y 390 px no hay scroll horizontal de la página (E2E).

## 10. Accesibilidad

- El SVG de aristas lleva `role="img"` y un `aria-label` generado que resume la cadena: proveedores, OC, lotes, cierres, lotes terminados, traspasos con piezas y saldo en planta.
- Cada tarjeta es un `button` cuyo nombre accesible es su texto visible. La etiqueta de estado se lee como parte del nombre.
- El estado seleccionado se marca con `aria-pressed="true"` en la tarjeta, además del contorno.
- Contraste: las etiquetas sobre las cintas usan el trazo del color del fondo; la cinta dorada a 0.5 de opacidad sobre el carril cumple 3:1 como elemento gráfico (verifícalo con axe en claro y oscuro).
- La leyenda tiene texto; la información no depende solo del color (la diferencia también se lee en la etiqueta "990 de 1,000" y en la etiqueta de estado de la tarjeta).

## 11. Pruebas

**Unitarias** (Vitest):
- `trace-layout.ts`: carriles por tipo, carriles extra por nivel de semiterminado, baricentro, separación mínima, compactación (§4.4) y orden del escenario de referencia.
- Puertos apilados: la suma de grosores más las separaciones queda centrada en la tarjeta; el orden sigue la posición del otro extremo.
- Grosor de cinta con `maxQty`.
- `trace-selection.ts`: origen, destino y cadena completa; sin mezclar ramas; selección de grupo.
- Barra de selección: conteos y piezas enviadas del escenario (desde HT-2609-C: 1 cierre, 1 lote terminado, 2 traspasos, SUC-01 y SUC-02, 1,800 pzas).
- Ficha: un componente por tipo con datos de ejemplo; sin permisos de costo no aparecen columnas de costo.
- Teclado: flechas entre padres e hijos; Esc en dos pasos; el foco regresa a la tarjeta.

**E2E 17** (`trazabilidad.md` §6.4), además de lo que ya pide:
- Escritorio: clic en el lote de harina más antiguo → la ficha muestra 62.00 kg en CP-000801; "Destino" deja SUC-03 atenuada; Esc cierra la ficha y el foco vuelve a la tarjeta.
- Tableta (1024 px): la ficha se abre a la izquierda de una tarjeta del carril 7.
- 390 px: la ficha es hoja inferior y se cierra con el fondo.
- axe sin violaciones serias con la ficha abierta, en claro y oscuro.

## 12. Criterio de aceptación

Con el escenario de `trazabilidad.md` §9, la pantalla reproduce el prototipo: mismos carriles, mismo orden de tarjetas, mismos grosores relativos de cinta, mismas cantidades en etiquetas y fichas, y el mismo comportamiento de selección, dirección, zoom y ficha. `npm run lint`, `npm test` y la E2E 17 en verde.
