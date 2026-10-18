# Especificación — Trazabilidad de lotes (SGO Paníssimo)

> Spec individual que **complementa** a `docs/specs/dominio.md`, `backend.md` y `frontend.md`. Si algo aquí contradice a esos documentos, manda `dominio.md`, salvo los cambios que este spec pide explícitamente en la sección 8.
>
> **Implementación en dos tareas:** **B-28** (backend) y **F-26** (frontend), con una sesión por tarea, empezando en modo plan, como el resto del proyecto. Antes de B-28 revisa la sección 3.1: el cambio a la recepción de compras depende de si B-16 ya está implementada.
>
> Diagrama de referencia aprobado: "Trazabilidad MICHAS OP-000412", versión 2 (artifact del proyecto). El ejemplo de la sección 9 reproduce ese caso.
>
> **Interfaz:** el diseño del mapa y de la ficha emergente está en `docs/specs/trazabilidad-ui.md`, que reemplaza el punto 1 de §6.3 y agrega campos a la respuesta de §5.3 (su §8).

## 1. Objetivo

Responder, en una consulta y sin capturas adicionales, las dos preguntas de un retiro de producto:

- **Hacia atrás:** de un lote terminado (o de lo que recibió una sucursal), ¿de qué proveedores, órdenes de compra, recepciones y lotes de materia prima viene? ¿En qué OP y en qué cierre se produjo?
- **Hacia adelante:** de un lote de materia prima (o de una OC completa), ¿en qué cierres se consumió, qué lotes terminados generó, a qué sucursales y clientes llegó y cuánto queda en cada ubicación?

Cada paso muestra **fechas y cantidades**. El identificador de entrada puede ser un **lote**, una **orden de compra**, una **orden de producción**, un **traspaso** o una **remisión**.

**Fuera de alcance:** bloqueo automático de lotes o retiro de mercancía con un documento propio (ampliación a cotizar), notificaciones a sucursales y trazabilidad dentro de la sucursal más allá de consumo, mermas y existencia (no hay punto de venta).

## 2. Cómo se forma la cadena

La trazabilidad **no guarda datos nuevos**: es una consulta sobre lo que ya registran los documentos. Cada salto es una llave foránea.

```
Supplier ── PurchaseOrder (OC-…) ── PurchaseOrderLine
                                         │
                         GoodsReceiptLine (REC-…, lot_id)   ← cambio de la sección 3.1
                                         │
                                       Lot (materia prima, insumo o semiterminado)
                                         │
                       ProductionCloseLineLot (lot_id, quantity)
                                         │
     ProductionOrder (OP-…) ── ProductionClose (CP-…, output_lot_id)
                                         │
                                       Lot (OP-000412-01)
                                         │
                    InventoryMovement (ProductionOutput, TransferOut, …)
                                         │
             TransferLineLot ── Transfer (TR-…) ── BranchOrder (PED-…)
             CustomerShipmentLineLot ── CustomerShipment (RM-…) ── Customer
                                         │
                    InventoryMovement (TransferIn, Consumption, Waste…) en la sucursal
```

- Un **semiterminado** repite la cadena: su lote lo creó el cierre de otra OP, que a su vez consumió lotes. La consulta recorre esos niveles (RN-103).
- Un lote creado por **existencia inicial o ajuste de entrada** (`AJ-…`) es un origen sin proveedor.
- Un componente **sin control de lote** (`TracksLots = false`, por ejemplo el agua) no se puede ligar a una recepción. La consulta lo muestra como consumo "sin lote" (RN-104).

## 3. Cambios al modelo

### 3.1 Lote en la línea de recepción de compra

Hoy `GoodsReceiptLine` guarda `LotNumber` y `ExpirationDate` como texto, y `Lot.CreatedFromDocId` apunta al **encabezado** de la recepción (y solo a la primera, si el lote ya existía). Por eso no hay un camino directo del lote a la línea de OC.

**Cambio:** agregar `GoodsReceiptLine.LotId` (`Guid?`, FK a `inventory.lot`, nulo solo si el artículo no maneja lotes). `ReceiveAsync` lo llena con el lote que devuelve `ILotRegistry.GetOrCreateAsync`.

- **Si B-16 aún no está implementada:** incluye `LotId` en la entidad y en la migración de B-16 (`AddGoodsReceipts`), y agrega en su prueba de integración que la línea quede ligada al lote. B-28 ya no lo repite.
- **Si B-16 ya está implementada:** B-28 crea la migración `AddGoodsReceiptLineLot` con la columna, el índice y este relleno, **sin modificar migraciones aplicadas**:

```sql
UPDATE purchasing.goods_receipt_line grl
SET    lot_id = l.id
FROM   inventory.lot l
WHERE  grl.lot_id IS NULL
  AND  grl.lot_number IS NOT NULL
  AND  l.item_id = grl.item_id
  AND  l.lot_number = grl.lot_number;
```

  Ajusta los nombres de esquema y tabla a los que generó `UseSnakeCaseNamingConvention()` en el repositorio.

### 3.2 Índices

Agrega los que no existan (revisa las migraciones actuales antes de crearlos):

| Tabla | Índice |
|---|---|
| `goods_receipt_line` | `(lot_id)` |
| `production_close_line_lot` | `(lot_id)` |
| `production_close` | `(output_lot_id)` |
| `transfer_line_lot` | `(lot_id)` |
| `customer_shipment_line_lot` | `(lot_id)` |
| `inventory_movement` | `(lot_id, location_id)` incluyendo `type`, `quantity` y `occurred_at` |

### 3.3 Verificación previa (no debería requerir cambios)

Antes de escribir código, confirma en el repositorio y anótalo en el plan:

1. La recepción de un traspaso registra **un `TransferIn` por lote** con su `LotId` (RN-22). Si una línea despachada en varios lotes registra la entrada sin lote o en un solo lote, corrígelo dentro de B-28: lo recibido se reparte entre los lotes despachados **en el mismo orden FEFO del despacho**, y el faltante queda en el último. Agrega la prueba.
2. `ConsumptionEntry`, ajustes y conteos registran `LotId` en el movimiento cuando el artículo maneja lotes.
3. `ProductionClose` guarda `ProductionCloseLineLot` también cuando el consumo se asignó por FEFO, no solo cuando el usuario eligió los lotes.

## 4. Reglas de negocio

- **RN-100 (puntos de entrada):** la consulta parte de un lote, una OC, una OP, un traspaso o una remisión. Cada punto de entrada se convierte en uno o varios **lotes semilla**:

  | Entrada | Lotes semilla | Dirección por omisión |
  |---|---|---|
  | Lote | El lote | Ambas |
  | Orden de compra | Lotes de todas sus recepciones | Hacia adelante |
  | Orden de producción | Lotes generados por sus cierres | Ambas |
  | Traspaso | Lotes despachados | Ambas |
  | Remisión | Lotes despachados | Hacia atrás |

  Una OC sin recepciones o una OP sin cierres responde un grafo con solo el documento y el aviso `no_lots`.

- **RN-101 (hacia atrás):** desde un lote se sube por su origen: el cierre que lo produjo (y su OP), las recepciones que lo trajeron (OC, proveedor, fecha y cantidad) o el ajuste que lo creó. Desde un cierre se sube a **todos** los lotes que consumió, con la cantidad de cada uno.

- **RN-102 (hacia adelante):** desde un lote se baja por todos sus movimientos: cierres que lo consumieron (con la cantidad), traspasos y remisiones que lo despacharon y, en cada ubicación donde estuvo, el resumen de entradas, consumos, mermas y existencia actual. Desde un cierre se baja al lote que produjo.

- **RN-103 (niveles y ciclos):** el recorrido sigue lote → cierre → lote tantas veces como haga falta (semiterminados), hasta `maxDepth` (default 10, máximo 20). Un nodo ya visitado no se vuelve a expandir. Si se alcanza `maxDepth` o el límite de nodos (`traceability.max_nodes`, default 2,000), la respuesta trae `truncated: true` y la lista de nodos que no se expandieron.

- **RN-104 (componentes sin lote):** un componente sin control de lote aparece en el cierre como línea de consumo con `lotId = null`, cantidad y unidad, sin ligas a recepciones ni proveedores. La consulta **no adivina** de qué compra vino.

- **RN-105 (cantidades):** todas las cantidades se reportan en la **unidad base** del artículo. La recepción muestra además la cantidad en unidad de compra (`20 bultos = 880 kg`). Las cantidades de cada liga salen de los documentos (`ProductionCloseLineLot.Quantity`, `TransferLineLot.Quantity`, `ReceivedQty` del movimiento `TransferIn`), nunca de prorrateos.

- **RN-106 (existencia por ubicación):** para cada `(lote, ubicación)` alcanzado se calcula desde el kardex: entradas, salidas por tipo (`ProductionConsumption`, `TransferOut`, `CustomerShipment`, `Consumption`, `Waste`, ajustes) y la existencia actual (`StockBalance`). Es lo que responde "¿cuánto queda en anaquel?".

- **RN-107 (discrepancias):** un traspaso recibido con diferencia muestra enviado, recibido y motivo por lote. La diferencia es pérdida en tránsito (RN-22) y no aparece como existencia en ningún lado.

- **RN-108 (resumen de retiro):** la respuesta incluye un resumen agregado de los lotes terminados alcanzados: por ubicación (recibido, consumido, merma, existencia actual), por cliente (remisionado) y por origen (proveedores, OC y lotes de materia prima). Con ese resumen se arma la lista de qué recoger y dónde.

- **RN-109 (permiso y alcance):** la consulta requiere el permiso nuevo `inventory.traceability`. Es una función de calidad que cruza ubicaciones: **no se filtra por el alcance de ubicaciones** del usuario (RN-40). Cada consulta queda en `AuditLog` con la entrada, la dirección y el número de nodos.

## 5. Backend (B-28)

### 5.1 Componentes

- `Panissimo.Application/Inventory/Traceability/`
  - `ITraceabilityService.GetGraphAsync(TraceQuery query, CancellationToken ct)`.
  - `TraceQuery`: `SourceType` (`Lot | PurchaseOrder | ProductionOrder | Transfer | CustomerShipment`), `SourceId`, `Direction` (`Backward | Forward | Both`), `MaxDepth`.
  - DTO: `TraceGraphDto`, `TraceNodeDto`, `TraceEdgeDto`, `TraceGroupDto`, `TraceEventDto`, `TraceSummaryDto`.
- `Panissimo.Infrastructure/Inventory/Traceability/TraceabilityQueries`: consultas **por nivel y en lote** (una consulta por tipo de liga y nivel con `WHERE lot_id = ANY(@ids)`), nunca una por nodo. El grafo se arma en memoria.
- Controller `TraceabilityController` en `Controllers/Inventory`.

### 5.2 Algoritmo

1. Resolver la entrada a lotes semilla (RN-100). 404 si el documento no existe.
2. **Hacia atrás:** cola de lotes por nivel. Para los lotes del nivel, en lote:
   - cierres que los produjeron (`production_close.output_lot_id`) y, de esos cierres, sus `production_close_line_lot` (siguiente nivel) y sus líneas sin lote (RN-104);
   - líneas de recepción (`goods_receipt_line.lot_id`) con su OC y proveedor;
   - ajustes de entrada que los crearon (`lot.created_from_doc_type = Adjustment`).
3. **Hacia adelante:** cola de lotes por nivel. Para los lotes del nivel, en lote:
   - `production_close_line_lot` que los consumieron → cierres → `output_lot_id` (siguiente nivel);
   - `transfer_line_lot` y `customer_shipment_line_lot` que los despacharon, con el `TransferIn` por lote en el destino;
   - resumen de movimientos por `(lote, ubicación)` (RN-106).
4. Respetar `MaxDepth`, el límite de nodos y la marca de visitados (RN-103).
5. Armar nodos, aristas, grupos (OP), eventos (orden cronológico) y resumen (RN-108).

**Rendimiento:** lote de harina con 20 OP, 40 lotes terminados y 600 traspasos (≈ 1,500 nodos) en < 1.5 s. Prueba `Category=Performance`.

### 5.3 API

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/traceability/graph?sourceType&sourceId&direction&maxDepth` | [inventory.traceability] |
| GET | `/traceability/lots/lookup?q&itemId&limit` — búsqueda de lotes por número de lote, SKU o nombre (≤ 50) | [inventory.traceability] |
| GET | `/traceability/sources/lookup?q` — busca por folio `OC-`, `OP-`, `TR-`, `RM-` o número de lote y devuelve `{ sourceType, sourceId, label }` | [inventory.traceability] |

**Respuesta de `/traceability/graph`** (abreviada):

```json
{
  "source": { "type": "Lot", "id": "…", "label": "OP-000412-01 · MICHAS" },
  "direction": "Both",
  "truncated": false,
  "unexpandedNodeIds": [],
  "warnings": [],
  "nodes": [
    { "id": "sup:…", "type": "Supplier", "label": "Proveedor Harinas", "taxId": "…" },
    { "id": "rec:…", "type": "PurchaseReceipt",
      "purchaseOrderId": "…", "purchaseOrderFolio": "OC-000214", "purchaseOrderDate": "2026-09-26",
      "receiptId": "…", "receiptFolio": "REC-000301", "receivedAt": "2026-09-30T15:10:00Z",
      "itemId": "…", "sku": "MP-HAR-001", "itemName": "Harina de trigo",
      "purchaseQty": 20, "purchaseUom": "bulto", "baseQty": 880, "baseUom": "kg",
      "supplierInvoiceNumber": "A-1182" },
    { "id": "lot:…", "type": "Lot", "lotId": "…", "lotNumber": "HT-2609-C", "itemId": "…", "sku": "MP-HAR-001",
      "itemName": "Harina de trigo", "itemType": "RawMaterial", "expirationDate": "2026-12-30", "baseUom": "kg" },
    { "id": "cp:…", "type": "ProductionClose", "closeId": "…", "folio": "CP-000801", "kind": "Partial",
      "sequence": 1, "productionOrderId": "…", "closedAt": "2026-10-21T05:45:00Z", "businessDate": "2026-10-20",
      "shift": "Night", "producedQty": 1800, "baseUom": "pza",
      "unlottedConsumption": [{ "itemId": "…", "sku": "MP-AGU-001", "itemName": "Agua", "qty": 45.05, "baseUom": "l" }] },
    { "id": "stk:…", "type": "Stock", "lotId": "…", "locationId": "…", "locationCode": "PLANTA", "locationType": "Plant",
      "inQty": 1800, "outByType": { "TransferOut": 1800 }, "onHandQty": 0, "baseUom": "pza" },
    { "id": "tr:…", "type": "Transfer", "transferId": "…", "folio": "TR-001502", "branchOrderFolio": "PED-000902",
      "fromLocationCode": "PLANTA", "toLocationCode": "SUC-02", "status": "ReceivedWithDiscrepancies",
      "dispatchedAt": "2026-10-21T11:55:00Z", "receivedAt": "2026-10-21T12:50:00Z", "vehicleDescription": "U-07" },
    { "id": "rm:…", "type": "CustomerShipment", "…": "…" },
    { "id": "cus:…", "type": "Customer", "…": "…" },
    { "id": "adj:…", "type": "InitialStock", "folio": "AJ-000006", "postedAt": "…" }
  ],
  "edges": [
    { "from": "sup:…", "to": "rec:…", "kind": "Supplied" },
    { "from": "rec:…", "to": "lot:…", "kind": "Received", "qty": 880, "baseUom": "kg", "at": "2026-09-30T15:10:00Z" },
    { "from": "stk:…", "to": "cp:…", "kind": "Consumed", "qty": 62.00, "baseUom": "kg", "at": "…" },
    { "from": "cp:…", "to": "lot:…", "kind": "Produced", "qty": 1800, "baseUom": "pza", "at": "…" },
    { "from": "lot:…", "to": "stk:…", "kind": "Entered", "qty": 1800, "baseUom": "pza", "at": "…" },
    { "from": "stk:…", "to": "tr:…", "kind": "Dispatched", "qty": 400, "baseUom": "pza", "at": "…" },
    { "from": "tr:…", "to": "stk:…", "kind": "Delivered", "qty": 390, "shippedQty": 400, "discrepancyReason": "Damaged", "baseUom": "pza", "at": "…" }
  ],
  "groups": [
    { "id": "op:…", "type": "ProductionOrder", "folio": "OP-000412", "itemName": "MICHAS", "plannedQty": 3500,
      "producedQty": 3500, "status": "Completed", "scheduledDate": "2026-10-20", "shift": "Night",
      "areaName": "Pan de Sal Noche", "recipeVersion": 1, "nodeIds": ["cp:…", "cp:…"] }
  ],
  "events": [
    { "at": "2026-09-30T15:10:00Z", "docType": "GoodsReceipt", "folio": "REC-000301",
      "description": "Recepción de compra", "sku": "MP-HAR-001", "lotNumber": "HT-2609-C",
      "qty": 880, "baseUom": "kg", "locationCode": "PLANTA" }
  ],
  "summary": {
    "origins": [{ "supplierName": "…", "purchaseOrderFolio": "OC-000214", "receiptFolio": "REC-000301",
                  "lotNumber": "HT-2609-C", "sku": "MP-HAR-001", "consumedQty": 62.00, "baseUom": "kg" }],
    "finishedLots": [{ "lotId": "…", "lotNumber": "OP-000412-01", "sku": "SKU0003", "producedQty": 1800,
                       "expirationDate": "2026-10-22" }],
    "locations": [{ "locationCode": "SUC-02", "locationName": "…", "receivedQty": 990, "consumedQty": 0,
                    "wasteQty": 0, "onHandQty": 990, "baseUom": "pza" }],
    "customers": [],
    "inTransitLossQty": 10
  }
}
```

- Ids de nodo con prefijo por tipo (`lot:`, `cp:`, `tr:`…) para que no choquen.
- Arista `Entered`: del lote a su `Stock` en la ubicación donde se creó. Las salidas (`Consumed`, `Dispatched`, `Shipped`) parten del `Stock` de la ubicación de origen. En la ruta del ejemplo: `Stock(PLANTA) → Transfer → Stock(SUC-02)`.
- Las fechas van en UTC (`timestamptz`); `businessDate` en `date`.
- Campos adicionales para la ficha emergente, incluidos los costos condicionados a permiso: `trazabilidad-ui.md` §8. Forman parte de B-28.
- Avisos (`warnings`): `no_lots`, `truncated`, `unlotted_components` (hay consumos sin lote en la cadena) y `missing_receipt_link` (lote de compra sin `GoodsReceiptLine.LotId`, por ejemplo uno anterior al relleno de §3.1 sin número de lote coincidente).

### 5.4 Errores

| Situación | HTTP | Código |
|---|---|---|
| `sourceType` o `direction` inválidos, `maxDepth` fuera de 1–20 | 400 | — |
| Documento o lote no existe | 404 | — |
| Sin `inventory.traceability` | 403 | — |

### 5.5 Pruebas

**Unitarias:**
- Armado del grafo con datos en memoria: ciclo (A → B → A) no se expande dos veces; `maxDepth`; límite de nodos con `truncated` y `unexpandedNodeIds`.
- Resumen (RN-108): existencia, consumos y mermas por ubicación; pérdida en tránsito.
- Orden cronológico de eventos con empates (por folio).
- Puntos de entrada (RN-100), incluidos OC sin recepciones y OP sin cierres.

**Integración** (Testcontainers), con el escenario de la sección 9 armado por API:
1. Dos OC de harina recibidas con lotes distintos, más azúcar y un componente sin lote (agua).
2. OP de MICHAS con cierre parcial (la harina sale por FEFO de los dos lotes) y cierre final.
3. Tres pedidos de sucursal → traspasos; uno con dos lotes y recepción con 10 dañadas.
4. Una remisión a cliente de un empaquetado que usa el semiterminado (para el caso de dos niveles, RN-103).

Verificar:
- Hacia atrás desde el lote recibido en SUC-02: aparecen **las dos OC de harina**, las recepciones y los proveedores, con las cantidades exactas de `ProductionCloseLineLot`.
- Hacia adelante desde el lote de harina más antiguo: llega a SUC-01 y SUC-02 y **no** a SUC-03.
- Desde la OC: mismo resultado que desde su lote.
- Existencia por ubicación y pérdida en tránsito correctas (RN-106, RN-107).
- Agua: `unlottedConsumption` con su cantidad y aviso `unlotted_components`.
- Semiterminado: el grafo cruza dos OP.
- 403 sin permiso; 200 para un usuario con el permiso aunque su alcance sea solo la Planta (RN-109); registro en la bitácora.
- Relleno de la migración (§3.1, solo si aplica): recepciones previas quedan ligadas a su lote.

**Rendimiento** (`Category=Performance`): §5.2.

### 5.6 Criterio de aceptación de B-28

`dotnet test` en verde con las pruebas de §5.5. El grafo del escenario de la sección 9 coincide con el diagrama de referencia, nodo por nodo y cantidad por cantidad. El `EXPLAIN` de las consultas por nivel usa los índices de §3.2; anótalo en `docs/rendimiento.md`.

## 6. Frontend (F-26)

### 6.1 Ruta y menú

| Ruta | Pantalla | Permiso |
|---|---|---|
| `/inventario/trazabilidad` | Búsqueda de punto de entrada | [inventory.traceability] |
| `/inventario/trazabilidad/:sourceType/:sourceId?direccion=atras\|adelante\|ambas` | Resultado | [inventory.traceability] |

Entrada en el menú de Inventario: "Trazabilidad". Ícono nuevo (por ejemplo `account_tree`): corre `npm run icons` y verifica que `icons:check` pase.

### 6.2 Búsqueda

- Un solo campo: "Lote, OC, OP, traspaso o remisión" con autocompletado (`/traceability/sources/lookup`), que muestra el tipo de cada resultado.
- Selector de dirección (Hacia atrás, Hacia adelante, Ambas) con el default de RN-100 según el tipo elegido.
- **Accesos directos** (botón o ícono "Rastrear" con [inventory.traceability]):
  - Existencias: en cada lote al expandir.
  - Detalle de OP: en el encabezado y en cada cierre de la línea de tiempo.
  - Detalle de OC y de recepción: en el encabezado (OC) y en cada línea con lote (recepción).
  - Detalle de traspaso y de remisión: en el encabezado.
  - Kardex: en las filas con lote.

### 6.3 Resultado

Encabezado con la entrada, la dirección (cambiable sin volver a buscar), los avisos de la respuesta y **"Exportar CSV"** (eventos y resumen, generados en el navegador con el helper de CSV existente, con BOM). Tres pestañas:

1. **Mapa** y **ficha emergente:** según `trazabilidad-ui.md` (carriles por etapa, cintas proporcionales a las piezas, selección por dirección, zoom y ficha detallada por tipo).
2. **Resumen** (RN-108): tablas de orígenes, lotes terminados, ubicaciones (recibido, consumido, merma, **existencia actual** resaltada si > 0) y clientes; pérdida en tránsito. En celular es la **pestaña inicial** y cada fila es una tarjeta.
3. **Bitácora:** eventos en orden cronológico (fecha y hora, documento con enlace, evento, artículo y lote, cantidad con unidad, ubicación), agrupados por etapa (Compras, Producción, Envío y recepción, Clientes).

Estados: skeleton mientras carga; vacío con `no_lots` ("Esta OC todavía no tiene recepciones"); error con "Reintentar".

### 6.4 Ayuda, accesibilidad y pruebas

- Ayuda contextual para las dos rutas (la prueba de "toda ruta tiene ayuda" debe seguir en verde). Video de la pantalla de resultado con `npm run help:record`, sin crear documentos.
- El SVG del mapa lleva `role="img"` y un `aria-label` que resume la cadena; cada tarjeta es un `button` con nombre accesible igual a su texto visible; la ficha usa `aria-live="polite"`. Foco visible en tarjetas y pestañas.
- **Unitarias:** asignación de capas y orden por padres; compactación de la vista; selección (ancestros y descendientes, sin mezclar ramas); exportación CSV.
- **E2E 17 `17-traceability`** (escritorio y 390 px): arma por API el escenario de la sección 9 (o uno reducido: dos lotes de harina, una OP con dos cierres, dos traspasos), busca la OP, abre el mapa, selecciona el lote más antiguo de harina y verifica que la sucursal que no lo recibió queda atenuada; en celular, verifica la pestaña Resumen y que no hay scroll horizontal; axe sin violaciones serias en claro y oscuro. Documenta que **mueve inventario**.

### 6.5 Criterio de aceptación de F-26

`npm run lint`, `npm test` y la E2E 17 en verde. El resultado del escenario de la sección 9 se ve igual que el diagrama de referencia.

## 7. Plan de tareas

| ID | Tarea | Requiere | Decisiones | Criterio de aceptación |
|---|---|---|---|---|
| B-28 | Trazabilidad de lotes: `GoodsReceiptLine.LotId` (o solo verificación si se hizo en B-16), índices, verificaciones de §3.3, permiso `inventory.traceability`, `/traceability/*` con los campos de `trazabilidad-ui.md` §8, pruebas | B-12, B-16, B-17, B-19 | D-11 | §5.6 |
| F-26 | Pantalla de trazabilidad (búsqueda, mapa y ficha emergente según `trazabilidad-ui.md`, resumen, bitácora, CSV) y accesos directos | B-28, F-11, F-15, F-16, F-18 | — | §6.5 |

Si la implementación va antes de B-19 (remisiones), B-28 puede hacerse sin la parte de clientes: deja `CustomerShipment` y `Customer` fuera del recorrido y agrégalos en B-19 con su prueba. Anótalo en `docs/AVANCE.md`.

## 8. Cambios a los otros specs

Aplicar al cerrar B-28, en el mismo commit:

- **`dominio.md`**
  - §2 Glosario: "Trazabilidad | `Traceability` | Consulta; no guarda datos".
  - §4.7 `GoodsReceipt`: líneas con `LotId`.
  - §5: agregar las reglas RN-100 a RN-109 en una sección "Trazabilidad".
  - §6: permiso `inventory.traceability` en Inventario. Roles: Administrador (siempre), Dirección, Jefe de producción y Almacén planta (propuesta D-11).
  - §4.8 `AppSetting`: `traceability.max_nodes` (entero 100–10,000, default 2,000).
  - §8: D-11 "¿Qué roles consultan la trazabilidad? ¿Las sucursales ven la cadena completa?" Propuesta: los cuatro roles anteriores; las sucursales no.
- **`backend.md`**: índices de §3.2 en §4; endpoints de §5.3 en §8.2 (bloque Inventario); B-28 en §13; pruebas en §11.
- **`frontend.md`**: rutas en §7.3; `app-trace-graph`, `app-trace-card` y `app-trace-detail` en §8; tokens `--pan-trace-*` en §4.1; E2E 17 en §9; F-26 en §11.
- **Semilla:** agrega el permiso y, **solo la primera vez que el permiso aparece**, lo asigna a los roles de D-11 por `system_key`, para no pisar ajustes que el cliente haya hecho a sus roles.

## 9. Escenario de referencia

Es el caso del diagrama. Los SKU, la receta y los consumos son reales (receta Micha RS-23: 879.0625 pzas por batida de 44 kg de harina). Los proveedores, los folios y las sucursales son de prueba.

**Compras**

| OC | Proveedor | Recepción | Artículo | Comprado | Lote | Caducidad |
|---|---|---|---|---|---|---|
| OC-000214 (26-sep) | Proveedor Harinas | REC-000301 (30-sep) | Harina de trigo | 20 bultos = 880 kg | HT-2609-C | 30-dic-2026 |
| OC-000231 (08-oct) | Proveedor Harinas | REC-000318 (10-oct) | Harina de trigo | 40 bultos = 1,760 kg | HT-2610-A | 10-ene-2027 |
| OC-000225 (02-oct) | Proveedor Abarrotes | REC-000309 (04-oct) | Azúcar estándar | 10 bultos = 500 kg | AZ-2509 | 30-sep-2027 |
| OC-000225 | Proveedor Abarrotes | REC-000309 | Sal | 8 bultos = 200 kg | SL-2508 | — |
| OC-000228 (05-oct) | Proveedor Grasas | REC-000312 (07-oct) | Manteca vegetal | 20 cajas = 500 kg | MV-1002 | 05-feb-2027 |
| OC-000233 (09-oct) | Proveedor Insumos | REC-000320 (13-oct) | Levadura instantánea | 40 paq = 20 kg | LI-0287 | 30-abr-2027 |
| OC-000233 | Proveedor Insumos | REC-000320 | Fortilix | 4 cubetas = 40 kg | FX-5531 | 31-mar-2027 |
| OC-000233 | Proveedor Insumos | REC-000320 | Propionato de sodio | 2 bultos = 50 kg | PS-0912 | 30-jun-2027 |

**Producción:** OP-000412, MICHAS (SKU0003), 3,500 pzas planeadas, 20-oct turno Noche, Pan de Sal Noche, vida útil 2 días.

| Componente | Lote | CP-000801 (20-oct 23:45, 1,800 pzas) | CP-000802 (21-oct 03:30, 1,700 pzas) |
|---|---|---|---|
| Harina de trigo | HT-2609-C | 62.00 kg | — |
| Harina de trigo | HT-2610-A | 28.10 kg | 85.09 kg |
| Azúcar estándar | AZ-2509 | 2.66 kg | 2.51 kg |
| Sal | SL-2508 | 1.43 kg | 1.35 kg |
| Manteca vegetal | MV-1002 | 3.07 kg | 2.90 kg |
| Fortilix | FX-5531 | 0.90 kg | 0.85 kg |
| Levadura instantánea | LI-0287 | 0.41 kg | 0.39 kg |
| Propionato de sodio | PS-0912 | 0.38 kg | 0.36 kg |
| Agua (sin lote) | — | 45.05 l | 42.55 l |
| **Lote generado** | | **OP-000412-01**, caduca 22-oct | **OP-000412-02**, caduca 23-oct |

Para que FEFO tome 62.00 kg de HT-2609-C, ese lote debe tener exactamente 62.00 kg de existencia antes del cierre: ajusta la salida previa en la prueba.

**Envío**

| Pedido | Traspaso | Despacho | Lotes | Destino | Recepción | Recibido |
|---|---|---|---|---|---|---|
| PED-000901 (1,200) | TR-001501 | 21-oct 05:40 | -01: 1,200 | SUC-01 | 06:35 | 1,200 |
| PED-000902 (1,000) | TR-001502 | 21-oct 05:55 | -01: 600, -02: 400 | SUC-02 | 06:50 | 990 (10 dañadas) |
| PED-000903 (900) | TR-001503 | 21-oct 06:10 | -02: 900 | SUC-03 | 07:20 | 900 |

Saldo en PLANTA: lote OP-000412-02 con 400 pzas.

**Resultados esperados**

- Hacia atrás desde SUC-02: 8 lotes de materia prima, 5 OC, 4 proveedores, 2 cierres, 2 lotes terminados, agua sin lote.
- Hacia adelante desde HT-2609-C: CP-000801 → OP-000412-01 → TR-001501 (1,200) y TR-001502 (600) → SUC-01 y SUC-02. **SUC-03 no aparece.**
- Resumen desde OP-000412: PLANTA 400 en existencia, SUC-01 1,200, SUC-02 990, SUC-03 900; pérdida en tránsito 10.
- En la recepción de TR-001502, las 10 dañadas quedan en el último lote despachado (-02) según §3.3: SUC-02 recibe 600 del -01 y 390 del -02.
