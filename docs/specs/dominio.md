# Especificación de dominio — SGO Paníssimo

> Documento compartido por backend y frontend. Define el vocabulario, las entidades, los estados y las reglas de negocio. Si una regla de este documento contradice otro spec, **este documento manda**.
>
> **Implementación desde cero.** Este sistema se construye en un repositorio nuevo, fase por fase. Toma como referencia funcional el Sistema de Gestión Operativa AR (SGO AR), pero **no reutiliza su código**: todo lo que se necesita está descrito en estos tres specs.
>
> **Decisiones abiertas.** Las reglas que dependen de un dato que el cliente aún no confirma están en la sección 8 (`D-xx`), con una propuesta. **No implementes una tarea que dependa de una decisión abierta sin confirmarla.**

## 1. Contexto

Paníssimo (Grupo Maroño, S.A. de C.V.) es una panadería con planta propia:

- **1 planta** que compra materias primas, insumos y productos de uso general; produce y abastece. Trabaja en tres turnos (día, tarde y noche); produce en sus fábricas (RN-48).
- **N sucursales propias** (cantidad por confirmar, D-01) que reciben pan **a granel** (no empaquetado) mediante pedidos, lo almacenan y lo consumen o venden.
- **Clientes terceros** (cadenas comerciales, institucionales, etc.) que compran producto **empaquetado** mediante pedidos.
- La planta también **produce para stock** y produce **semiterminados** (masas, revueltos, rellenos, betunes) que se usan como ingrediente de los productos terminados.
- Las órdenes de producción se **cierran por partes**: se abre la orden, se produce una parte que se registra y se guarda, y después se produce el resto hasta el cierre final.
- Las órdenes de producción también se pueden **dar de alta desde un archivo de Excel**.

Volumen de referencia (archivos del cliente, septiembre 2026): **284 SKU** de producto terminado en 9 áreas, **42 recetas** de masa o semiterminado, **~70 claves de materia prima**, **~1,000,000 de piezas al mes** (≈ 33,000 por día) y **~153 colaboradores**, de los cuales ~59 trabajan en producción.

Flujo principal:

```
Proveedor ──OC──▶ Planta (materia prima, insumos, uso general)
                    │
Pedido de sucursal ─┤                    ┌─▶ Granel ──Traspaso──▶ Sucursal (recepción) ──▶ Consumo
Pedido de cliente ──┼─▶ Plan de producción ─▶ OP ─▶ Cierres parciales ─▶ Cierre final
Reposición a stock ─┤        ▲                 (semiterminados con su propia OP)
Importación Excel ──┘────────┘                     └─▶ Empaquetado ──Remisión──▶ Cliente tercero
```

**Fuera de alcance** (se presentan como ampliaciones a cotizar): facturación CFDI, cuentas por cobrar y cobranza, contabilidad, nómina, punto de venta e integración con él, app móvil nativa, operación offline, cálculo del forecast comercial (la Matriz Maestra sigue en Excel y el sistema **importa** sus órdenes), balance de capacidad (hornos, horas-hombre) y plantilla/descansos del personal.

## 2. Glosario (español → código)

El código (clases, tablas, endpoints) va en **inglés**; la interfaz de usuario va en **español**.

| Español | Código | Notas |
|---|---|---|
| Ubicación | `Location` | Planta o sucursal |
| Planta | `Plant` | `LocationType.Plant` |
| Sucursal | `Branch` | `LocationType.Branch` |
| Subalmacén | `Warehouse` | `LocationType.Warehouse` (hija de una planta o sucursal, D-01) |
| Fábrica | `Factory` | `LocationType.Factory` (piso de producción, hija de una planta, RN-48) |
| Vale interno | `Transfer` con `Kind = Internal` | Traspaso con recepción entre subalmacenes de la misma ubicación |
| Artículo | `Item` | Materia prima, insumo, semiterminado o terminado |
| Materia prima | `RawMaterial` | Harina, azúcar, margarina… |
| Insumo / uso general | `Supply` | Empaque, etiquetas, limpieza, papelería. Se compra y se consume; no tiene receta |
| Semiterminado | `SemiFinished` | Masa, revuelto, relleno, betún. Se produce con OP y se usa en otra receta |
| Producto terminado | `FinishedGood` | |
| Presentación | `ItemPresentation` | `Bulk` (granel, para sucursales) o `Packaged` (empaquetado, para clientes) |
| Turno | `Shift` | `Day`, `Afternoon`, `Night` |
| Unidad de medida | `UnitOfMeasure` | |
| Categoría | `ItemCategory` | |
| Lote | `Lot` | Con fecha de caducidad |
| Existencia | `StockBalance` | Por ubicación, artículo y lote |
| Costo promedio | `ItemLocationCost` | Por ubicación y artículo |
| Movimiento / kardex | `InventoryMovement` | Inmutable |
| Conteo físico | `PhysicalCount` | |
| Ajuste de inventario | `InventoryAdjustment` | |
| Registro de consumo | `ConsumptionEntry` | Salidas de sucursal |
| Receta | `Recipe` | Lista de materiales versionada |
| Orden de producción (OP) | `ProductionOrder` | Con cierres parciales y final |
| Cierre de producción | `ProductionClose` | Cada cierre parcial o final de una OP |
| Plan de producción | `ProductionPlan` (consulta) | Demanda neta por producto y fecha |
| Importación de OP | `ProductionOrderImport` | Lote de OP creadas desde un Excel |
| Merma | `Waste` | |
| Pedido de sucursal | `BranchOrder` | |
| Traspaso | `Transfer` | Incluye datos de envío |
| Cliente | `Customer` | Tercero que compra producto empaquetado |
| Punto de entrega | `CustomerDeliveryPoint` | Tienda o almacén del cliente |
| Pedido de cliente | `CustomerOrder` | |
| Remisión | `CustomerShipment` | Salida de producto hacia un cliente |
| Proveedor | `Supplier` | |
| Artículo de proveedor | `SupplierItem` | |
| Requisición | `PurchaseRequisition` | |
| Orden de compra (OC) | `PurchaseOrder` | |
| Recepción de compra | `GoodsReceipt` | |
| Usuario / Rol / Permiso | `User` / `Role` / `Permission` | |
| Foto de artículo | `ItemPhoto` | Una por artículo |
| Bitácora | `AuditLog` | |
| Trazabilidad | `Traceability` | Consulta; no guarda datos (B-28) |
| Parámetro | `AppSetting` | |

## 3. Convenciones generales

- **Identificadores:** `Guid` v7 (`Guid.CreateVersion7()`).
- **Campos de auditoría:** `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`. Los DTO exponen además el nombre del usuario (`createdByName`, etc.).
- **Catálogos** (ubicaciones, artículos, proveedores, clientes…) usan `IsActive` para baja lógica; nunca se borran físicamente.
- **Documentos** (OC, OP, traspasos, pedidos, remisiones…) tienen `Folio`, `Status`, `Notes` y **no se borran: se cancelan**.
- **Cantidades:** siempre en la **unidad base** del artículo, `numeric(18,4)`.
  - Si la unidad base es `pza`, las cantidades de OP, cierres, pedidos, traspasos, remisiones, ajustes, conteos y consumos deben ser **enteras** (RN-03b).
- **Costos:** MXN sin IVA, `numeric(18,4)`. Montos de documentos (OC): `numeric(18,2)`.
- **Fechas:** `timestamptz` en UTC. La "fecha de negocio" se calcula en `America/Mexico_City`.
- **Folios:** consecutivos por tipo de documento, formato `PREFIJO-000001`.

| Documento | Prefijo |
|---|---|
| Requisición | `REQ` |
| Orden de compra | `OC` |
| Recepción de compra | `REC` |
| Orden de producción | `OP` |
| Cierre de producción | `CP` |
| Importación de OP | `IMP` |
| Pedido de sucursal | `PED` |
| Traspaso | `TR` |
| Pedido de cliente | `PC` |
| Remisión | `RM` |
| Ajuste | `AJ` |
| Conteo físico | `CF` |
| Registro de consumo | `CON` |

## 4. Entidades

### 4.1 Organización

**Location**
- `Code` (único, ej. `PLANTA`, `SUC-01`, `PLANTA-MP`), `Name`, `Type` (`Plant | Branch | Warehouse | Factory`), `ParentLocationId` (solo `Warehouse`: su planta o sucursal; `Factory`: su planta), `Address`, `IsActive`, `SuppliesTypes` (solo `Warehouse`: tipos de componente que surte por omisión a producción, RN-111).
- Derivados: `CanPurchase`, `CanProduce`, `CanSupplyBranches` y `CanSellToCustomers` son verdaderos solo para `Plant`.
- El nombre es editable; el código, el tipo y la ubicación padre no cambian después del alta.
- **Subalmacenes (D-01, B-26):** una planta o sucursal puede tener subalmacenes (catálogo editable, baja lógica). Los documentos (OP, OC, pedidos, plan) siguen ligados a la planta o sucursal; la existencia vive en los subalmacenes:
  - **RN-44**: una ubicación con subalmacenes activos no tiene existencia propia: todo movimiento se registra en uno de sus subalmacenes. No se agregan subalmacenes a una ubicación que ya tiene existencia, ni se desactiva un subalmacén con existencia.
  - **RN-45**: los procesos **siempre eligen** el subalmacén: uno en el encabezado del documento que aplica a todas sus líneas y cada línea puede cambiarlo (recepción de compra, cierre de OP —consumo y producto—, despacho y recepción de traspasos, despacho de remisiones). Ajustes, conteos, consumo y devoluciones se hacen sobre un subalmacén.
  - **RN-46**: las consultas por planta o sucursal (plan, sugerido de pedidos, existencia en origen, disponibilidad de OP, alertas, requerimiento de MP) suman sus subalmacenes. Existencias y kardex se consultan por subalmacén o por la ubicación completa.
  - **RN-48 (fábrica)**: una planta puede tener una o más ubicaciones `Factory` (piso de producción, hijas solo de una planta). Guardan existencia como un subalmacén (RN-44 a RN-47 aplican igual: kardex, conteos, existencias y vales internos). Si la planta tiene una fábrica activa, los cierres de OP **consumen solo de una fábrica** y el producto **entra solo a una fábrica**; la materia prima llega y el producto sale con vales internos. Sin fábrica activa, el cierre elige cualquier subalmacén (RN-45). La OP, el plan, la importación y los costos siguen siendo de la planta. Decidido con el usuario el 2026-10-18.
  - **RN-49 (receta ligada a fábrica)**: la receta indica la fábrica donde se produce (`FactoryId`); es **dónde**, no **qué**: cambiarla no crea versión (RN-10) y aplica a todas las versiones del artículo, así que las OP abiertas cierran en la fábrica vigente. Reglas:
    - Si la Planta (`PLANTA`) tiene una fábrica activa, la receta **debe** tener fábrica activa (alta y edición, 400 en `factoryId`).
    - Crear o editar una OP en una planta con fábrica activa exige que la receta tenga una fábrica activa **de esa planta**; una receta con fábrica solo se produce en la planta de su fábrica (422 `recipe_factory_required` / `recipe_factory_other_plant`; en la importación de OP rechaza el archivo completo).
    - El cierre consume de la fábrica de la receta y deja ahí el producto, sin elegir otra ubicación (422 `close_factory_fixed` si se manda otra, en el encabezado o en una línea).
    - La disponibilidad de la OP y de la explosión es la de esa fábrica (RN-12). Los costos siguen siendo los de la Planta (RN-64).
    - Migración: las recetas existentes toman la fábrica de la Planta cuando hay exactamente una activa.
    Decidido con el usuario el 2026-10-18 (obligatoria solo cuando la planta tiene fábrica).
  - **RN-110 (reserva de ingredientes)**: liberar una OP cuya receta tiene fábrica (RN-49) **reserva** cada componente en su subalmacén de origen (RN-111), por el teórico de lo planeado (RN-11; en piezas, redondeado hacia arriba). La existencia **libre** = utilizable (sin lotes vencidos) − reservada.
    - Si algún componente no tiene existencia libre suficiente en su origen, la OP **no se libera** (422 `release_insufficient_stock` con el detalle). Aplica igual a "Liberar al importar".
    - Ninguna salida (traspaso, remisión, ajuste, merma, consumo, cierre u otro vale) puede dejar un (subalmacén, artículo) por debajo de lo reservado (422 `stock_reserved`). El conteo físico queda exento: registra lo que hay.
    - La reserva se libera al **enviar** su vale (la salida ocurre en ese momento) o al cancelarlo; cancelar la OP cancela sus vales en borrador y libera lo reservado.
    - Un componente cuyo origen es la **misma fábrica de la receta** se reserva ahí **sin vale** (ya está en el piso); cada cierre consume esa reserva (queda lo que falta por consumir) y el cierre final la libera completa (decidido con el usuario el 2026-10-20).
    - Las consultas de existencias muestran lo reservado y lo libre.
  - **RN-111 (origen por renglón)**: cada renglón de la OP elige su **origen** (uno por componente): un subalmacén activo de la planta y, para un **semiterminado o terminado**, también una **fábrica** activa de la planta (donde se produce). Por omisión, un semiterminado o terminado toma la **fábrica de su receta activa** (si es de la planta); los demás, el subalmacén de la planta que "surte por omisión" su tipo (materia prima, insumo, semiterminado o terminado; configurable en cada subalmacén, uno por tipo y planta; el seed asigna Materias primas, Insumos y empaque, Semiterminados y Producto terminado). Fábricas como origen y su omisión: decidido con el usuario el 2026-10-20. En el alta y edición manual se cambia por renglón, viendo lo libre de cada subalmacén; la importación y el plan toman el de omisión. Liberar exige origen en todos los renglones.
  - **RN-112 (vale de ingredientes)**: al liberar, la OP genera **un vale interno por origen** (subalmacén u otra fábrica; ninguno para la fábrica de la receta, RN-110), en borrador, con destino la fábrica de la receta y ligado a la OP (`Transfer.ProductionOrderId`). El panadero lo usa para pedir los ingredientes; el almacén lo **envía** (sale del subalmacén) y la fábrica lo **recibe** (entra, con faltantes si los hay, RN-47). No se edita: solo se envía o se cancela. El cierre consume de la fábrica (RN-49).
    Decidido con el usuario el 2026-10-18: reservar y generar vales **al liberar** (no al crear el borrador), bloquear sin existencia libre, un vale por origen, flujo enviar/recibir y origen por omisión según el tipo.
  - **RN-47 (vale interno)**: mueve producto entre subalmacenes de la misma ubicación con recepción, como un traspaso: `Draft → Dispatched → Received | ReceivedWithDiscrepancies`; `Cancelled` solo en `Draft`. Enviar exige el subalmacén origen y recibir el destino. El costo viaja con el producto (RN-04).

**Sin áreas de producción** (decidido con el usuario el 2026-10-20): el catálogo de áreas (cuadrillas), el área del artículo y el área de la OP se eliminaron. Donde se agrupaba por área (OP, cierres, plan, resumen RN-53, tablero, trazabilidad) se usa la **fábrica de la receta** (RN-49); sin fábrica = "Sin fábrica".

**Shift** (enum, no catálogo): `Day` (Día), `Afternoon` (Tarde), `Night` (Noche).

### 4.2 Catálogos

**UnitOfMeasure**: `Code` (`kg`, `g`, `l`, `ml`, `pza`, `caja`, `bulto`, `paq`…), `Name`, `Kind` (`Mass | Volume | Unit`), `IsActive`.

**ItemCategory**: `Name` (único), `IsActive`.

**Item**
- `Sku` (el código de Paníssimo, ej. `SKU0001`; **obligatorio y único**, se guarda en mayúsculas; es el identificador que usan la importación de OP y la de artículos, D-07), `Name`, `Type` (`RawMaterial | Supply | SemiFinished | FinishedGood`), `CategoryId`.
- `BaseUomId`: unidad en la que se lleva el inventario.
- `PurchaseUomId` (opcional) + `PurchaseToBaseFactor` (> 0; ej. bulto → 44 kg). Si no hay unidad de compra, el factor es 1.
- `TracksLots` (bool), `ShelfLifeDays` (opcional, ≥ 0), `StorageCondition` (`Ambient | Refrigerated | Frozen`).
- `TaxRate` para compras (`0.00` o `0.16`).
- `Presentation` (`Bulk | Packaged`): obligatorio para `FinishedGood`, nulo para los demás tipos.
- `BulkItemId` (opcional, solo si `Presentation = Packaged`): el producto a granel del que es versión empaquetada (ej. `TRENZA EMBOLSADA` → `TRENZA`). Debe ser un `FinishedGood` `Bulk` activo. Es informativo (reportes y equivalencias); no mueve inventario.
- `UnitsPerPackage` (opcional, `Packaged`): piezas por paquete (informativo).
- `ProductionMultiple` (`numeric(18,4)`, default 1, > 0): el plan redondea hacia arriba a este múltiplo (columna "Múltiplo OP" de la Matriz Maestra del cliente).
- `UnitWeightGrams` (opcional): gramaje objetivo por pieza. Informativo.
- `IsActive`.

**ItemLocationSetting**: `ItemId`, `LocationId`, `MinQty`, `MaxQty` (≥ 0, `MaxQty ≥ MinQty`). Sirve para alertas de stock bajo, sugeridos de pedido y reposición a stock del plan.

**ItemPhoto**: una foto por artículo, para reconocer productos en los selectores.
- `ItemId` (llave), `Revision` (cambia en cada carga; sirve de caché), `Image` + `ImageContentType` (máx. 512 px, ≤ 300 KB), `Thumbnail` + `ThumbnailContentType` (96 px, ≤ 50 KB).
- Formatos WebP, JPEG o PNG, validados por el contenido del archivo. El navegador redimensiona antes de subir.
- Se guarda en la base de datos (tabla aparte de `Item`). Subirla, reemplazarla o quitarla queda en la bitácora, sin los bytes.

### 4.3 Inventario

**Lot**: `ItemId`, `LotNumber`, `ExpirationDate` (opcional), `CreatedFromDocType`, `CreatedFromDocId`. Único por `(ItemId, LotNumber)`. Un lote existente no admite otra caducidad.

**StockBalance**: `LocationId`, `ItemId`, `LotId` (nullable), `Quantity`. Llave única `(LocationId, ItemId, LotId)`.

**StockReservation** (RN-110): `LocationId`, `ItemId`, `Quantity`, `ProductionOrderId`, `TransferId` (el vale que la saca), `CreatedAt`.

**ItemLocationCost**: `LocationId`, `ItemId`, `AverageCost`.

**InventoryMovement** (inmutable, es el kardex)
- `OccurredAt`, `BusinessDate`, `LocationId`, `ItemId`, `LotId`.
- `Type`: `PurchaseReceipt`, `ProductionConsumption`, `ProductionOutput`, `TransferOut`, `TransferIn`, `Adjustment`, `Waste`, `PhysicalCountAdjustment`, `Consumption`, `CustomerShipment`.
- `Quantity` (con signo: + entrada, − salida; unidad base), `UnitCost`, `TotalCost`.
- `SourceDocType`, `SourceDocId`, `SourceDocFolio`, `UserId`, `Notes`.

**PhysicalCount**
- Encabezado: `Folio`, `LocationId`, `Status` (`Draft → InProgress → Closed`; además `Cancelled` desde `Draft` o `InProgress`), `CategoryId` (opcional, conteo parcial), `StartedAt`, `ClosedAt`, `Notes`.
- Líneas: `ItemId`, `LotId`, `SnapshotQty`, `CountedQty` (nulo hasta capturarse), `Difference`.

**InventoryAdjustment**
- Encabezado: `Folio`, `LocationId`, `Reason`, `Status` (`Posted`), `Notes`.
- `Reason`: `Correction` (entrada o salida, movimiento `Adjustment`), `Waste`, `Expired` y `Damaged` (solo salidas, movimiento `Waste`), `InternalUse` (solo salida, movimiento `Adjustment`), `CustomerReturn` (devolución o rechazo de cliente: solo entradas, movimiento `Adjustment`; por línea, `WasteQty` opcional ≤ lo devuelto con `WasteReason` `Waste | Expired | Damaged`, que sale enseguida del mismo lote como `Waste`, D-08).
- Líneas: `ItemId`, `LotId`, `Quantity` (con signo), `UnitCost` (solo en entradas de corrección), `LotNumber` y `ExpirationDate` (solo en entradas de artículos con lotes), `Notes`.
- Un ajuste no se cancela; se corrige con otro ajuste.

**ConsumptionEntry** (salida de sucursal; solo ubicaciones `Branch`)
- Encabezado: `Folio`, `LocationId`, `BusinessDate` (hoy o anterior), `Status` (`Posted`), `Notes`.
- Líneas: `ItemId`, `LotId` (opcional; FEFO si se omite), `Quantity`.

### 4.4 Producción

**Recipe**
- Encabezado: `OutputItemId` (`SemiFinished` o `FinishedGood`), `Version`, `IsActive`, `YieldQty` (en unidad base del producto), `Notes`, `FactoryId` (fábrica donde se produce, RN-49).
- Líneas (`RecipeLine`): `ComponentItemId`, `Quantity` (por `YieldQty`, en unidad base del componente), `WastePct` (0–100, 2 decimales).
- Los componentes pueden ser `RawMaterial`, `Supply` (ej. bolsa y etiqueta del empaquetado) o `SemiFinished`; un `FinishedGood` solo es componente cuando es **a granel** y va en un **empaquetado** (RN-119; un empaquetado nunca es componente). Un producto no puede ser su propio componente ni repetir componentes.

**ProductionOrder**
- Encabezado: `Folio`, `LocationId` (Plant), `RecipeId` (versión exacta), `OutputItemId`, `PlannedQty`, `ScheduledDate`, `Shift` (opcional), `Source` (`Manual | Plan | Import`), `ImportId` (opcional), `Notes`.
- `Status`: `Draft → Released → InProgress → Completed`; además `Cancelled` (RN-60).
- Acumulados (se recalculan con cada cierre): `ProducedQty`, `TotalCost`, `UnitCost` (= `TotalCost / ProducedQty`).
- Cierre final: `CompletedAt`, `CompletedBy`, `ShortfallReason` (`MissingMaterial | MissingStaff | EquipmentFailure | DemandChange | Other`; requerido si `ProducedQty < PlannedQty`), `ShortfallNotes`.
- Líneas (`ProductionOrderLine`): `ComponentItemId`, `TheoreticalQty` (para lo planeado, RN-11), `ActualQty` (acumulado de los cierres), `SourceLocationId` (subalmacén de origen, RN-111).

**ProductionClose** (cada cierre parcial o final)
- `Folio` (`CP-…`), `ProductionOrderId`, `Sequence` (1, 2, 3… dentro de la OP), `Kind` (`Partial | Final`), `BusinessDate`, `Shift` (opcional), `ProducedQty` (≥ 0), `OutputLotId` (nulo si `ProducedQty = 0` o el producto no maneja lotes), `TotalCost`, `UnitCost`, `ClosedAt`, `ClosedBy`, `Notes`.
- Líneas (`ProductionCloseLine`): `ComponentItemId`, `TheoreticalQty` (para lo producido en este cierre), `ActualQty`, `UnitCost`, `WasteQty` (= real − teórico).
- Lotes consumidos (`ProductionCloseLineLot`): `LineId`, `LotId`, `Quantity`.

**ProductionOrderDemand** (liga informativa OP ↔ pedido): `ProductionOrderId`, `DemandType` (`BranchOrderLine | CustomerOrderLine`), `DemandLineId`, `Quantity`.

**ProductionOrderImport**: `Folio` (`IMP-…`), `FileName`, `FileSha256`, `RowCount`, `OrderCount`, `ReleasedOnImport`, `CreatedAt`, `CreatedBy`.

### 4.5 Logística

**BranchOrder** (pedido de sucursal)
- Encabezado: `Folio`, `RequestingLocationId` (Branch), `SupplyingLocationId` (Plant), `RequiredDate`, `RejectionReason`, `Notes`.
- `Status`: `Draft → Submitted → Approved → PartiallyFulfilled | Fulfilled`; además `Rejected` y `Cancelled`.
- Líneas: `ItemId`, `RequestedQty`, `ApprovedQty`, `ShippedQty`.

**Vehicle** (RN-113): `Plate` (placas, únicas, en mayúsculas y sin espacios; no cambian), `Description`, `IsActive`.

**Driver** (RN-113): `Name`, `Phone` (opcional), `IsActive`.

- **RN-113 (flotilla)**: al despachar un traspaso (no un vale interno) o una remisión se elige un **vehículo y un chofer activos del catálogo**; no se captura texto libre. El documento guarda la liga y una copia de texto ("Descripción · PLACAS" y el nombre) para el historial y la impresión; los despachados antes del catálogo conservan solo su texto. Desactivar un vehículo o chofer lo quita de las opciones sin tocar documentos. Administra el catálogo el permiso `logistics.fleet.manage` (Administrador, Almacén planta y Distribución); lo consultan quienes ven logística o ventas. Decidido con el usuario el 2026-10-19 (campos mínimos, solo del catálogo, permiso nuevo).

**Transfer** (traspaso con datos de envío)
- Encabezado: `Folio`, `FromLocationId`, `ToLocationId`, `BranchOrderId` (opcional), `ProductionOrderId` (vale de ingredientes de una OP, RN-112), `Notes`.
- `Status`: `Draft → Dispatched → Received | ReceivedWithDiscrepancies`; además `Cancelled` (solo desde `Draft`).
- Envío: `VehicleId`, `DriverId` (catálogo, RN-113), `VehicleDescription`, `DriverName` (copia de texto al despachar), `DispatchedAt`, `DispatchedBy`.
- Recepción: `ReceivedAt`, `ReceivedBy`.
- Líneas: `ItemId`, `PlannedLotId` (opcional), `ShippedQty`, `ReceivedQty`, `UnitCost`, `DiscrepancyReason` (`Missing | Damaged | Other`), `DiscrepancyNotes`; rechazo en la recepción (RN-116): `RejectedQty`, `RejectionReason` (los motivos de RN-114), `RejectionNotes`, `RejectionDisposition` (`Return | Loss`). Lotes despachados: `TransferLineLot` (`LineId`, `LotId`, `Quantity`).

### 4.6 Ventas a terceros

**Customer**: `Code` (único, ej. `CLI-001`; editable mientras siga siendo único), `Name`, `TaxId` (RFC, opcional; mismas reglas que el proveedor), `ContactName`, `Phone`, `Email`, `Notes`, `IsActive`.

**CustomerDeliveryPoint**: `CustomerId`, `Name`, `Address`, `IsActive`.

**CustomerItem** (opcional, D-06): `CustomerId`, `ItemId` (`FinishedGood`, granel o empaquetado, D-05), `CustomerSku`, `Price` (sin IVA, informativo), `IsActive`. Único por `(CustomerId, ItemId)`.

**CustomerOrder** (pedido de cliente)
- Encabezado: `Folio` (`PC-…`), `CustomerId`, `DeliveryPointId` (opcional), `SupplyingLocationId` (Plant), `RequiredDate`, `CustomerReference` (orden de compra del cliente, opcional), `CloseReason`, `Notes`.
- `Status`: `Draft → Confirmed → PartiallyShipped → Shipped`; además `Closed` (cerrado con saldo) y `Cancelled`.
- Líneas: `ItemId`, `Quantity`, `ShippedQty`, `UnitPrice` (opcional, D-06).

**CustomerShipment** (remisión)
- Encabezado: `Folio` (`RM-…`), `CustomerOrderId`, `CustomerId`, `DeliveryPointId`, `FromLocationId` (Plant), `Notes`.
- `Status`: `Draft → Dispatched → Delivered | DeliveredWithDiscrepancies` (RN-114); además `Cancelled` (solo en `Draft`).
- Envío: `VehicleId`, `DriverId` (catálogo, RN-113), `VehicleDescription`, `DriverName` (copia de texto al despachar), `DispatchedAt`, `DispatchedBy`, `ReceivedByName` (quién firma de recibido, opcional).
- Líneas: `CustomerOrderLineId`, `ItemId`, `Quantity`, `UnitCost` (al despachar). Lotes: `CustomerShipmentLineLot` (`LineId`, `LotId`, `Quantity`).
- Rechazos (`CustomerShipmentRejection`, RN-114): `LineId`, `LotId` (opcional: artículo sin lotes), `Quantity`, `Reason`, `Notes`, `Disposition` (`Return | Loss`), `ReturnLocationId`, `UnitCost` (el de salida), `ReturnAdjustmentId`.
- Entrega (RN-114): `DeliveredAt` (fecha y hora de entrega), `DeliveredBy` (quién la registra), `ReceivedByName` (quién recibió; se confirma o corrige).

### 4.7 Compras

**Supplier**: `TaxId` (RFC, único salvo genéricos, RN-35), `Name`, `ContactName`, `Phone`, `Email`, `PaymentTermsDays` (0–365; 0 = contado), `IsActive`.

**SupplierItem**: `SupplierId`, `ItemId`, `SupplierSku`, `Price` (por unidad de compra o, si no hay, por unidad base; sin IVA, ≥ 0), `LeadTimeDays`, `IsPreferred`, `IsActive`. Único por `(SupplierId, ItemId)`.

**PurchaseRequisition**
- Encabezado: `Folio`, `LocationId` (Plant), `NeededBy`, `RejectionReason`, `Notes`.
- `Status`: `Draft → Submitted → Approved → Converted`; además `Rejected` y `Cancelled`.
- Líneas: `ItemId`, `Quantity` (unidad de compra), `SuggestedSupplierId`.

**PurchaseOrder**
- Encabezado: `Folio`, `SupplierId`, `DeliveryLocationId` (Plant), `ExpectedDate`, `Subtotal`, `TaxTotal`, `Total`, `ApprovedBy`, `ApprovedAt`, `RejectionReason`, `Notes`.
- `Status`: `Draft → PendingApproval → Approved → PartiallyReceived → Received`; además `Rejected` (final), `Cancelled` y `Closed`.
- Líneas: `ItemId`, `Quantity` (unidad de compra), `UnitPrice`, `TaxRate`, `ReceivedQty`, `RequisitionLineId` (opcional).

**GoodsReceipt**
- Encabezado: `Folio`, `PurchaseOrderId`, `LocationId`, `ReceivedAt`, `SupplierInvoiceNumber` (opcional), `Notes`.
- Líneas: `PurchaseOrderLineId`, `ItemId`, `Quantity` (unidad de compra), `BaseQuantity`, `UnitCostBase`, `LotId` (el lote creado o reutilizado; nulo solo si el artículo no maneja lotes; liga de la trazabilidad, RN-101), `LotNumber`, `ExpirationDate`.

### 4.8 Seguridad, auditoría y parámetros

- **User** (ASP.NET Core Identity): `FullName`, `Email`, `IsActive`, `DefaultLocationId`.
- **UserLocation**: `UserId`, `LocationId`. Define a qué ubicaciones tiene acceso.
- **Role**: `Name`, `Description`, `SystemKey` (identifica los roles de la semilla aunque se renombren). **RolePermission**: `RoleId`, `PermissionCode`.
- **RefreshToken**: hash, familia, expiración, rotación y revocación (ver backend §9).
- **AuditLog**: `OccurredAt`, `UserId`, `Action`, `EntityType`, `EntityId`, `ChangesJson`, `IpAddress`.
- **AppSetting**: clave, valor tipado, límites y `version`.

| Clave | Tipo | Default | Uso |
|---|---|---|---|
| `purchasing.po_approval_threshold` | decimal 0–99,999,999 (2 dec.) | 0 | RN-31 |
| `purchasing.receipt_tolerance_pct` | decimal 0–100 | 0 | RN-32 |
| `inventory.expiry_alert_days` | entero 0–365 | 3 | RN-07 |
| `inventory.min_cover_days` / `inventory.max_cover_days` | entero 0–60 | 2 / 7 | RN-52 |
| `production.cost_increase_alert_pct` | decimal 0–100 | 5 | RN-51 |
| `production.overrun_tolerance_pct` | decimal 0–100 | 10 | RN-63 |
| `production.plan_default_days` | entero 1–14 | 1 | RN-70 |
| `sales.shipment_tolerance_pct` | decimal 0–100 | 0 | RN-82 |
| `traceability.max_nodes` | entero 100–10,000 | 2,000 | RN-103 |

## 5. Reglas de negocio

### Inventario

- **RN-01**: La existencia **solo** cambia mediante `InventoryMovement`. Los movimientos son inmutables; para corregir uno se registra un ajuste.
- **RN-02**: No se permite existencia negativa por `(ubicación, artículo, lote)`. Si una operación la provocaría, se rechaza completa (nada se registra) con el detalle de **todos** los faltantes.
- **RN-03**: Todas las cantidades se convierten a unidad base antes de registrar: `BaseQty = PurchaseQty × PurchaseToBaseFactor`, redondeo a 4 decimales.
  - **RN-03b**: si la unidad base es `pza`, la cantidad debe ser entera en todo documento.
- **RN-04 (costo promedio ponderado por ubicación)**:
  - Entrada: `nuevoCosto = (qtyActual × costoActual + qtyEntrada × costoEntrada) / (qtyActual + qtyEntrada)`.
  - Si la existencia previa es ≤ 0, el nuevo costo es el de la entrada.
  - Salidas y traspasos salen al costo promedio vigente del origen; el traspaso entra al destino con ese mismo costo.
- **RN-05 (lotes y FEFO)**:
  - Los artículos con `TracksLots = true` requieren lote en toda entrada. Sin caducidad capturada, se usa la del lote existente o hoy + `ShelfLifeDays`.
  - Las salidas asignan lotes por **FEFO** (primero en caducar; sin caducidad al final; empate por fecha de creación), salvo que el usuario elija los lotes (deben sumar la cantidad).
  - Un **lote vencido** se rechaza en despacho de traspasos, remisiones, consumo de producción y consumo de sucursal. Se permite en ajustes, mermas y conteos.
- **RN-06 (conteo físico)**:
  - Al pasar a `InProgress` se guarda `SnapshotQty` de cada `(artículo, lote)` con existencia de la ubicación (de la categoría, si es parcial).
  - Se pueden agregar líneas de artículos o lotes que no estaban en el snapshot (snapshot 0).
  - Cerrar exige que todas las líneas estén contadas. Se registra un `PhysicalCountAdjustment` por `CountedQty − SnapshotQty` en cada línea con diferencia; los movimientos ocurridos durante el conteo se respetan.
  - Solo un conteo `InProgress` por ubicación.
- **RN-07 (alertas)**:
  - Stock bajo: existencia total del artículo en la ubicación < `MinQty`.
  - Por caducar: lotes con existencia > 0 que vencen en ≤ `inventory.expiry_alert_days` días.
- **RN-08 (existencias iniciales)**: se cargan por CSV como un ajuste de corrección por ubicación; se rechaza si el artículo ya tiene movimientos en esa ubicación.
- **RN-09 (consumo de sucursal)**: solo en ubicaciones `Branch`; fecha de negocio hoy o anterior; registra `Consumption` con FEFO si no se elige lote.

### Producción

- **RN-10**: Solo hay una receta activa por artículo. Editar una receta ya usada en una OP crea una **nueva versión** (N+1) y desactiva la anterior; la OP conserva la versión con la que se creó. Editar una receta nunca usada la modifica en su lugar. Activar una versión anterior exige desactivar antes la activa. Cambiar **solo la fábrica** (RN-49) nunca crea versión.
- **RN-11**: Consumo teórico por componente para una cantidad `Q` = `Q / YieldQty × línea.Quantity × (1 + WastePct/100)`. Se usa con `PlannedQty` en la OP y con el `ProducedQty` de cada cierre.
- **RN-12 (explosión con disponibilidad)**: para una receta y cantidad, se calcula el teórico de cada componente, la existencia utilizable en la ubicación (sin lotes vencidos; si la receta tiene fábrica de esa planta, solo la de la fábrica, RN-49), el faltante y el costo estimado (costo promedio vigente).
- **RN-13 (merma de producción)**: merma de un cierre = consumo real − teórico calculado sobre el `ProducedQty` de **ese cierre**. La merma de la OP es la suma de sus cierres. Se reporta; no genera movimientos extra.
- **RN-14**: Solo se produce en la Planta. El producto de una OP es `SemiFinished` o `FinishedGood` con receta activa.

### Órdenes de producción con cierre parcial y final

- **RN-60 (estados)**:
  - `Draft`: se edita (producto, cantidad, fecha, turno, notas) y se puede cancelar. Al cambiar de producto se toma su receta activa.
  - `Released`: liberada para producir. Se puede cancelar mientras no tenga cierres. No se edita.
  - `InProgress`: tiene al menos un cierre parcial. **No se puede cancelar**; se termina con el cierre final.
  - `Completed` y `Cancelled`: finales.
- **RN-61 (cierre parcial)**: solo en `Released` o `InProgress`. Requiere `ProducedQty > 0`. En **una sola transacción**:
  1. Registra la salida de componentes por el consumo **real** capturado (por defecto, el teórico de RN-11 para lo producido en este cierre), con FEFO o los lotes que elija el usuario.
  2. Registra la entrada del producto por `ProducedQty` con un lote nuevo (RN-62).
  3. Calcula el costo del cierre (RN-64) y actualiza los acumulados de la OP.
  4. La OP pasa a `InProgress`.
- **RN-62 (lote por cierre)**: cada cierre con `ProducedQty > 0` crea su propio lote. Número = `{folio de la OP}-{Sequence en 2 dígitos}` (ej. `OP-000123-01`). Caducidad = fecha de negocio del cierre + `ShelfLifeDays` (sin caducidad si no tiene vida útil). Si el producto no maneja lotes, la entrada va sin lote (D-02).
- **RN-63 (cierre final)**: solo en `Released` o `InProgress`. Captura lo producido en el último tramo (`ProducedQty ≥ 0`) con la misma transacción de RN-61, y además:
  - Si la OP no tiene cierres previos, `ProducedQty` debe ser > 0 (una OP sin producción se cancela, no se cierra).
  - Si el total producido es menor que `PlannedQty`, se requiere `ShortfallReason` (y `ShortfallNotes` si es `Other`).
  - El total producido puede superar `PlannedQty × (1 + production.overrun_tolerance_pct / 100)`: la tolerancia es **informativa** (D-03). El cierre que deja el total arriba de ella se guarda con `ExceedsTolerance` y la OP lo muestra.
  - La OP pasa a `Completed`. Un cierre final con `ProducedQty = 0` no mueve inventario.
- **RN-64 (costos del cierre)**: `TotalCost` = Σ (consumo real × costo promedio vigente del componente en la Planta, RN-04). `UnitCost` = `TotalCost / ProducedQty`. La entrada del producto se registra a ese costo. La OP acumula `TotalCost` y calcula su `UnitCost` promedio.
- **RN-65 (sin reversa)**: un cierre registrado no se edita ni se cancela; se corrige con un ajuste de inventario.
- **RN-66 (concurrencia)**: los cierres de una misma OP se serializan (bloqueo de la fila y `version`). Dos cierres simultáneos → uno se registra y el otro recibe 409.
- **RN-67 (semiterminados)**: la explosión es de **un nivel**. Si falta un semiterminado, se produce con su propia OP. El plan (RN-70) y el requerimiento de materia prima (RN-50) lo marcan "por producir" y permiten generar esa OP (D-04).
- **RN-119 (empaquetado desde granel)**: la receta de un `FinishedGood` `Packaged` acepta como componentes, además de materia prima, insumos (bolsa, etiqueta) y semiterminados, **cualquier** `FinishedGood` `Bulk` activo. La regla depende de la presentación del producto, no de la fábrica (RN-49: la fábrica es dónde, no qué). Un granel no lleva granel ni empaquetado y un empaquetado nunca es componente, así que no hay ciclos.
  - Al capturar una receta nueva de un empaquetado con `BulkItemId`, la pantalla propone ese granel en el primer renglón vacío (se puede cambiar o agregar otros).
  - El granel se trata como un semiterminado: una OP abierta del empaquetado es demanda de "OP padre" del granel en el plan (RN-70), con su propia OP (un nivel, RN-67).
  - Su origen por omisión es el subalmacén que surte `FinishedGood` (RN-111): el seed y la migración `PackagedFromBulk` se lo asignan a `PLANTA-PT` (o al `-PT` de cada planta) si nadie más lo surte. Reserva al liberar (RN-110), FEFO y costo promedio al cerrar (RN-64), y la trazabilidad liga el lote empaquetado con el lote de granel consumido.
  - Decidido con el usuario el 2026-10-20 (propuesta A, por presentación; cualquier granel, con el ligado propuesto primero).

### Plan de producción

- **RN-70 (demanda neta por producto y fecha)**: para la Planta y un rango de fechas (hoy + `production.plan_default_days` por omisión), por cada `FinishedGood` y `SemiFinished`:
  - **Demanda** =
    - pedidos de sucursal `Submitted` (lo solicitado) o `Approved` (lo aprobado − lo despachado) por `RequiredDate`,
    - más pedidos de cliente `Confirmed` o `PartiallyShipped` (cantidad − lo remisionado) por `RequiredDate`,
    - más **reposición a stock**: si la existencia proyectada de la Planta queda por debajo de su `MinQty`, hasta `MaxQty` (en el primer día del rango),
    - más, para `SemiFinished`, el requerimiento (RN-11) de lo pendiente de producir de las OP abiertas que lo usan, por su `ScheduledDate`.
  - **Oferta** = existencia utilizable en la Planta (sin vencidos) + pendiente de producir (`PlannedQty − ProducedQty`) de OP `Draft`, `Released` o `InProgress` del producto.
  - **Cálculo por día, acumulado:** en orden de fecha, la existencia cubre primero los días más próximos; una OP pendiente cubre a partir de su `ScheduledDate` (las anteriores al rango, desde el primer día); lo sugerido para un día cuenta como cubierto para los siguientes.
  - **Por producir** = faltante del día, redondeado **hacia arriba** al `ProductionMultiple` (y a entero si es `pza`).
  - El plan es una consulta: no guarda nada ni reserva existencia.
- **RN-71 (generar OP desde el plan)**: el usuario elige renglones del plan y ajusta la cantidad (> 0). Se crea **una OP `Draft` por producto, fecha y turno**, con `Source = Plan`, la receta activa y una liga `ProductionOrderDemand` por línea de pedido que originó la demanda (repartiendo en orden de `RequiredDate`). Todo o nada; un producto sin receta activa lo bloquea.
- **RN-72 (ligas informativas)**: las ligas muestran qué pedidos atiende una OP. **No reservan** producto terminado (la reserva de RN-110 es solo de ingredientes de una OP liberada): los pedidos se surten desde la existencia de la Planta con traspasos o remisiones. Cancelar una OP no cambia el pedido.
- **RN-73 (OP manual)**: también se crean OP sin pedido (para stock), con `Source = Manual`.

### Importación de OP desde Excel

- **RN-90 (formato)**: archivo `.xlsx` (máx. 5 MB) con una hoja `OP` (si no existe, la primera hoja) y encabezados en la fila 1. Columnas en cualquier orden, sin distinguir mayúsculas ni acentos:

  | Columna | Obligatoria | Regla |
  |---|---|---|
  | `fecha` | Sí | Fecha programada (celda de fecha o texto `dd/mm/aaaa`). No pasada |
  | `sku` | Sí | `Sku` (D-07) de un artículo activo `SemiFinished` o `FinishedGood` con receta activa |
  | `cantidad` | Sí | > 0, hasta 4 decimales (entero si es `pza`) |
  | `turno` | No | `Día`, `Tarde` o `Noche`. Vacío = sin turno |
  | `ubicacion` | No | Código de una Planta del alcance del usuario. Vacío = la Planta |
  | `notas` | No | Máximo 500 caracteres |

  Columnas desconocidas se ignoran con aviso (también `area`, de la plantilla anterior); filas vacías se ignoran; máximo **3,000 filas**. El sistema ofrece una **plantilla** con esos encabezados y una hoja de instrucciones.
- **RN-91 (todo o nada)**: se validan todas las filas y se reportan **todos** los errores por fila y columna. Con un solo error, no se crea nada.
- **RN-92 (agrupación)**: filas con el mismo `(fecha, sku, turno, ubicacion)` se suman en una sola OP. La vista previa muestra "N filas → M órdenes".
- **RN-93 (avisos)**: requieren confirmación del usuario, no son errores: archivo con el mismo SHA-256 que una importación anterior, y OP no cancelada existente del mismo producto, fecha y turno.
- **RN-94 (resultado)**: crea un `ProductionOrderImport` y sus OP en `Draft` con `Source = Import`. Con **"Liberar al importar"** (y permiso de gestionar OP) las crea en `Released`. Todo en una transacción.
- **RN-95 (Matriz Maestra)**: las hojas de la Matriz Maestra del cliente no se importan directamente (usan los SKU `SKU0001…` en otra disposición). El cliente copia `fecha`, `sku` y `cantidad` a la plantilla (D-07).

### Logística

- **RN-20 (pedido de sucursal)**:
  - Solo sucursales piden, siempre a la Planta. Fecha requerida no pasada; cantidades en unidad base.
  - Se piden `FinishedGood` (granel o empaquetado) y `Supply`; no `SemiFinished` ni `RawMaterial` (D-05).
  - La sucursal lo crea en `Draft` y lo envía (`Submitted`). La Planta lo aprueba ajustando `ApprovedQty` (0 a lo solicitado; todo en 0 no se permite: se rechaza con motivo).
  - Aprobar crea **un** traspaso en `Draft` ligado, con las líneas aprobadas (> 0). No se reserva existencia.
  - La Planta puede editar ese traspaso antes de despacharlo, sin cambiar el destino, sin artículos ajenos al pedido y sin pasar de lo aprobado. Cancelar ese traspaso **cancela el pedido**.
  - El pedido se cancela solo en `Draft` o `Submitted`.
  - **Sugerido por mín/máx**: proyectado = existencia + en tránsito hacia la sucursal + pedidos enviados o aprobados sin despachar; si proyectado ≤ mínimo, se sugiere máximo − proyectado.
- **RN-21 (despacho)**: registra `TransferOut` en el origen (lote planeado, lotes elegidos o FEFO). El traspaso queda en tránsito.
- **RN-21b (lote planeado)**: al crear o editar un traspaso o un vale interno, lo pedido de un lote planeado (sumando sus líneas) no puede pasar de su existencia en el origen (con sus subalmacenes); 400 con el lote y su existencia. La pantalla lo marca en la cantidad al elegir el lote. Decidido con el usuario el 2026-10-20.
- **RN-22 (recepción)**:
  - El destino captura `ReceivedQty` por línea (0 a lo enviado) y se registra `TransferIn` por lo recibido, con los mismos lotes y costo.
  - Lo que no llegó (`ShippedQty − ReceivedQty − RejectedQty`, RN-116) requiere `DiscrepancyReason` y deja el traspaso `ReceivedWithDiscrepancies`; ese faltante es pérdida en tránsito y se reporta.
- **RN-116 (rechazo en la recepción)**: al recibir un traspaso (no un vale interno), la sucursal puede **rechazar** por línea (lote) parte de lo que llegó, igual que el cliente en la remisión (RN-114): cantidad (> 0; recibido + rechazado ≤ enviado; entera en `pza`), **motivo** (`Damaged`, `ShortShelfLife`, `Excess`, `WrongProduct`, `Other` con nota obligatoria), nota y **destino**:
  - `Return` (regresa): entra **automáticamente al subalmacén del que salió** (`FromStockLocationId`), en el mismo lote y al costo de salida, con un `TransferIn` del mismo traspaso. Quien recibe no elige subalmacén ni necesita acceso a la ubicación de origen.
  - `Loss` (merma): no regresa ni genera movimiento (la salida ya ocurrió al despachar); se valora al costo de salida (`RejectionLossValue`).
  - Con algún rechazo el traspaso queda `ReceivedWithDiscrepancies`. El pedido de sucursal ligado no cambia (RN-24): lo que se necesite se pide de nuevo.
  - Decidido con el usuario el 2026-10-19 (regresa al subalmacén de salida, convive con el faltante, no reabre el pedido).
- **RN-23**: un traspaso despachado no se edita ni se cancela.
- **RN-24**: al **despachar** un traspaso ligado a un pedido se actualiza `ShippedQty`; si se despachó todo lo aprobado, el pedido queda `Fulfilled`, si no, `PartiallyFulfilled` (final: lo que falte se pide de nuevo).
- **RN-25 (rutas)**: sin permiso especial, los traspasos solo van de la Planta a una sucursal. Con `logistics.transfers.special` se permiten sucursal → sucursal y sucursal → Planta (devoluciones).
- **RN-115 (qué viaja en un traspaso)**: en cualquier ruta, un traspaso solo lleva `FinishedGood` (granel o empaquetado) y `Supply`; nunca `RawMaterial` ni `SemiFinished` (422 `transfer_item_not_allowed`, al crear y al editar). Los vales internos (RN-47), incluidos los de ingredientes de una OP (RN-112), no se limitan. Coincide con lo que una sucursal puede pedir (RN-20, D-05). Decidido con el usuario el 2026-10-19.

### Ventas a terceros

- **RN-80 (pedido de cliente)**:
  - Se captura en `Draft` con cliente activo, punto de entrega opcional (del mismo cliente y activo), fecha requerida no pasada y al menos una línea.
  - Solo `FinishedGood` activos (granel o empaquetado), sin repetir (D-05).
  - **Confirmar** (`Draft → Confirmed`) lo vuelve demanda del plan. Un pedido confirmado no se edita; si cambia, se cancela y se captura otro.
  - Cancelar: en `Draft` o `Confirmed` sin nada remisionado.
- **RN-81 (remisión)**:
  - Se crea desde un pedido `Confirmed` o `PartiallyShipped`, prellenada con el saldo de cada línea, en `Draft`. Puede haber varias remisiones por pedido.
  - **Despachar** registra `CustomerShipment` en la Planta (FEFO salvo lotes elegidos; vencidos rechazados) al costo promedio vigente. Valida RN-02.
  - Una remisión despachada no se edita ni se cancela.
- **RN-82 (avance del pedido)**: al despachar se suma a `ShippedQty`; lo remisionado por línea no excede lo pedido × (1 + `sales.shipment_tolerance_pct` / 100). Todas las líneas completas → `Shipped`; si no, `PartiallyShipped`. Un pedido `PartiallyShipped` puede **cerrarse con saldo** (`Closed`, con motivo).
- **RN-83 (alcance)**: la remisión es un documento de entrega. No es factura ni genera cuenta por cobrar; los precios son informativos (D-06). Las devoluciones de cliente se registran como ajuste de entrada (D-08).
- **RN-114 (entrega de la remisión)**: una remisión `Dispatched` se marca **entregada** con la fecha y hora de entrega (no anterior al despacho ni futura) y el nombre de quien recibió (obligatorio). Por cada lote despachado se captura lo **rechazado** (0 a lo enviado; lo demás se da por aceptado):
  - Cada rechazo lleva **motivo** (`Damaged` dañado, `ShortShelfLife` caducidad corta o vencido, `Excess` de más o no pedido, `WrongProduct` producto equivocado, `Other` otro con nota obligatoria) y **destino**:
    - `Return` (regresa): entra a un subalmacén de la Planta que se elige (RN-45), en el **mismo lote** y al **costo de salida** de la remisión. Se registra como un ajuste de entrada `CustomerReturn` (D-08) generado por la entrega (uno por subalmacén de regreso) y ligado a cada rechazo; un lote vencido puede regresar (RN-05 solo bloquea salidas) y después se da de baja con un ajuste.
    - `Loss` (merma): no regresa. No genera movimiento (la salida ya ocurrió al despachar); queda como pérdida con su valor, como la pérdida en tránsito de RN-22.
  - Sin rechazos → `Delivered`; con alguno → `DeliveredWithDiscrepancies`. La entrega es final: no se edita ni se deshace (se corrige con un ajuste).
  - El pedido baja su `ShippedQty` en lo rechazado y recalcula su estado (RN-82): un pedido `Shipped` vuelve a `PartiallyShipped` y lo rechazado se puede remisionar otra vez o cerrar con saldo. Un pedido `Closed` o `Cancelled` no se reabre.
  - Permiso `sales.shipments.deliver` (Administrador, Almacén planta y Distribución). Sin evidencia adjunta: la remisión firmada se archiva en papel.
  - Decidido con el usuario el 2026-10-19 (destino por renglón, reabre el pedido, permiso nuevo, sin foto).

### Compras

- **RN-30 (precio y catálogo)**: solo se agregan a una OC artículos del catálogo activo del proveedor. El precio se sugiere desde `SupplierItem.Price` y es editable.
- **RN-31 (aprobación)**: al enviar una OC, si `Subtotal ≥ purchasing.po_approval_threshold` pasa a `PendingApproval` y requiere `purchasing.po.approve`; si no, pasa directamente a `Approved`. Rechazar exige motivo y es final.
- **RN-32 (recepción)**:
  - Se permite recepción parcial y una línea puede recibirse en varios lotes.
  - La sobre-recepción se permite hasta `purchasing.receipt_tolerance_pct`.
  - La OC pasa a `Received` cuando todas sus líneas están completas.
  - Una OC con saldo se cierra manualmente con **motivo** (`Closed`, `CloseReason`, solo desde `PartiallyReceived`).
  - Una OC se cancela solo en `Draft`, `PendingApproval` o `Approved` sin nada recibido.
- **RN-33**: la recepción registra `PurchaseReceipt` con costo base = `UnitPrice / PurchaseToBaseFactor` (sin IVA). Solo se reciben OC `Approved` o `PartiallyReceived`. Entrega solo en la Planta.
- **RN-117 (lote de compra)**: el lote de cada renglón recibido de un artículo con lotes lo **genera el sistema** al registrar la recepción; no se captura. Formato `{SKU sin guiones ni otros separadores, en mayúsculas}-{fecha de negocio de la recepción DDMMAA}-{NN}`, donde `NN` es el consecutivo de ese artículo en ese día, siempre con 2 dígitos (`01`, `02`…; pasa a 3 después de `99`). Ej.: `MP-001` recibido el 20/10/2026 → `MP001-201026-01`; la segunda recepción del día → `MP001-201026-02`. Cada renglón (también dos del mismo artículo en una recepción, o dos recepciones simultáneas) recibe su propio consecutivo; un lote capturado a mano con ese prefijo pero sin número al final no cuenta. El SKU se corta a 39 caracteres para que el lote quepa en 50. No se captura el lote del proveedor. Decidido con el usuario el 2026-10-20 (SKU en lugar de iniciales, DDMMAA, consecutivo siempre; el lote del proveedor se quitó el mismo día).
- **RN-34 (requisiciones)**:
  - Solo la Planta; `NeededBy` no pasada; cantidades en unidad de compra. Un artículo puede repetirse (ej. con otro proveedor); cada renglón repetido lleva una **nota** que explica por qué.
  - Una línea sin proveedor toma el **preferido**; un proveedor indicado debe estar activo y vender el artículo. Enviar exige proveedor en todas las líneas.
  - Aprobar y rechazar requieren `purchasing.po.approve`; rechazar pide motivo. Cancelar en `Draft`, `Submitted` o `Approved`.
  - **Conversión a OC**: las requisiciones aprobadas se agrupan por **proveedor + ubicación de entrega**; una línea de OC por línea de requisición (conserva `RequisitionLineId`); precio del catálogo; IVA del artículo; fecha esperada = la `NeededBy` más próxima; OC en `Draft`. Todo o nada.
- **RN-35 (proveedores)**:
  - RFC con formato SAT (12 caracteres moral, 13 física, fecha AAMMDD válida), en mayúsculas y **único**, salvo los genéricos `XAXX010101000` y `XEXX010101000`.
  - **Un solo proveedor preferido por artículo**: marcar uno desmarca el anterior. Una fila inactiva nunca es preferida; desactivar un proveedor quita sus preferencias y sus artículos no se editan hasta reactivarlo.
- Se compran artículos `RawMaterial` y `Supply`.

### Planeación y análisis

- **RN-50 (requerimiento de materia prima)**:
  - El plan son las OP `Draft`, `Released` e `InProgress` (lo pendiente de producir) de la Planta con `ScheduledDate` hasta la fecha elegida (hoy + 7 días por omisión).
  - Por componente: `faltante = requerido + MinQty − existencia utilizable − en camino`, nunca negativo. En camino = saldo de OC no finales + requisiciones `Draft`, `Submitted` o `Approved`.
  - Un semiterminado faltante se marca "por producir"; solo `RawMaterial` y `Supply` se compran.
  - Cantidad sugerida en unidades de compra completas (hacia arriba). La **requisición sugerida** es una requisición normal en `Draft`.
- **RN-51 (costo de receta)**: costo teórico por versión = Σ `Quantity × (1 + WastePct/100) × costo promedio vigente` / `YieldQty`. Solo lectura. Un componente "subió" si su último costo de entrada (`PurchaseReceipt`) supera al anterior en ≥ `production.cost_increase_alert_pct` y esa entrada tiene ≤ 30 días.
- **RN-52 (análisis de consumo)**: sobre semanas completas hasta ayer (8 por omisión, máx. 26), con las salidas `Consumption`, `ProductionConsumption`, `TransferOut` y `CustomerShipment`. Promedio diario = total / días; patrón por día de la semana; tendencia = últimas 4 semanas contra las 4 anteriores. Mín sugerido = promedio × `inventory.min_cover_days`; máx = promedio × `inventory.max_cover_days`, redondeados hacia arriba (enteros en `pza`); el máx nunca queda por debajo del mín. Aplicarlo usa el mín/máx normal.
- **RN-53 (resumen de producción)**: por fábrica de la receta (RN-49), producto o día en un rango: planeado (OP del rango no canceladas), producido (cierres del rango), % de cumplimiento, costo producido y merma de producción en pesos (RN-13).
- **RN-118 (pendientes en el menú)**: cada entrada del menú lateral muestra un globo rojo con el número de documentos que esperan al usuario, contados como la pestaña de su lista (el número coincide con lo que se ve al abrirla): **Órdenes de compra** = por aprobar (`PendingApproval`, con `purchasing.po.approve`) + por recibir (`Approved` o `PartiallyReceived`, con `purchasing.receive`); **Órdenes** de producción = por producir (`Released`) + en proceso (`InProgress`), con `production.orders.close`; **Vales internos** = por enviar (`Draft`) + en tránsito (`Dispatched`) de la ubicación activa y sus subalmacenes, con `inventory.internal_transfers`; **Plan** de producción = renglones por programar (cantidad por producir > 0 en el rango por omisión de RN-70, como abre la pantalla), con `production.orders.manage`: se apagan al generar sus OP (decidido con el usuario el 2026-10-20). Las órdenes y el plan cubren todo el alcance del usuario (todas sus plantas). Los pendientes son de un **permiso en una ubicación**, no de una persona: el globo se apaga para todos cuando alguien atiende el documento. No hay "leído" ni historial. Se refresca cada minuto, al navegar, al volver a la pestaña, al cambiar de ubicación y después de guardar un cambio. Una sección plegada suma los globos de sus entradas; en el celular, el botón del menú muestra el total con el menú cerrado. Decidido con el usuario el 2026-10-20 (opción A: pendientes calculados, sin avisos fuera del sistema).

### Trazabilidad

Detalle, algoritmo y API en `docs/specs/trazabilidad.md` (B-28) y la pantalla en `docs/specs/trazabilidad-ui.md` (F-26). La trazabilidad es una **consulta** sobre lo que ya registran los documentos: no guarda datos propios.

- **RN-100 (puntos de entrada)**: la consulta parte de un lote, una OC, una OP, un traspaso o una remisión, y cada entrada se convierte en lotes semilla: el lote; los lotes de las recepciones de la OC (dirección por omisión: hacia adelante); los lotes generados por los cierres de la OP; los lotes despachados del traspaso; los lotes despachados de la remisión (hacia atrás). Las demás van en ambas direcciones. Una OC sin recepciones o una OP sin cierres responde sin nodos y con el aviso `no_lots`.
- **RN-101 (hacia atrás)**: de un lote se sube a su origen: el cierre que lo produjo (y su OP), las recepciones que lo trajeron (OC, proveedor, fecha y cantidad) o el ajuste o conteo que lo creó (origen sin proveedor). De un cierre se sube a **todos** los lotes que consumió, con la cantidad de cada uno.
- **RN-102 (hacia adelante)**: de un lote se baja por los cierres que lo consumieron, los traspasos y remisiones que lo despacharon y, en cada ubicación donde estuvo, su resumen de entradas, consumos, mermas y existencia. De un cierre se baja al lote que produjo.
- **RN-103 (niveles y ciclos)**: el recorrido sigue lote → cierre → lote las veces necesarias (semiterminados), hasta `maxDepth` (10 por omisión, máx. 20). Un lote ya visitado no se vuelve a expandir. Al llegar a `maxDepth` o a `traceability.max_nodes` la respuesta trae `truncated` y los lotes que no se expandieron.
- **RN-104 (componentes sin lote)**: un componente sin control de lote aparece en el cierre como consumo sin lote, con su cantidad y unidad, sin ligas a compras; no se adivina su origen (aviso `unlotted_components`).
- **RN-105 (cantidades)**: todo en unidad base; la recepción muestra también la cantidad en unidad de compra. Las cantidades salen de los documentos (lotes del cierre, líneas por lote del traspaso, lotes de la remisión), nunca de prorrateos.
- **RN-106 (existencia por ubicación)**: por cada lote y planta o sucursal alcanzada (con sus subalmacenes) se calcula desde el kardex: entradas, salidas por tipo y existencia actual. Los vales internos no cuentan: no salen de la ubicación.
- **RN-107 (discrepancias)**: un traspaso recibido con diferencia muestra, por lote, lo enviado, lo recibido y el motivo; la diferencia es pérdida en tránsito (RN-22) y no es existencia en ningún lado. El faltante queda en el lote que el usuario indica al recibir (cada lote despachado es una línea del traspaso).
- **RN-108 (resumen de retiro)**: de los lotes de producto terminado alcanzados: por ubicación (recibido, consumido, merma y existencia actual), por cliente (remisionado), por origen (proveedor, OC, recepción y lote de materia prima con lo consumido) y la pérdida en tránsito.
- **RN-109 (permiso y alcance)**: requiere `inventory.traceability`. Es una función de calidad que cruza ubicaciones: **no se limita** al alcance de ubicaciones del usuario (RN-40). Los costos y precios llegan vacíos sin `production.view` o `purchasing.view`. Cada consulta queda en `AuditLog` (acción `Queried`) con la entrada, la dirección y el número de nodos.

### Seguridad

- **RN-40 (permisos y alcance)**: un rol es un conjunto de permisos; un usuario tiene uno o más roles y una o más ubicaciones. Solo ve y opera datos de sus ubicaciones, salvo con `locations.all`. Una ubicación asignada incluye sus subalmacenes. Un usuario puede tener asignado **solo un subalmacén**: entonces mueve inventario solo en ese subalmacén y ve los documentos de su ubicación padre (B-26).
- **RN-41**: toda operación que mueva inventario o cambie el estado de un documento, y todo cambio a catálogos, usuarios, roles y parámetros, queda en `AuditLog`.
- **RN-42**: un usuario inactivo no inicia sesión. La cuenta se bloquea 15 minutos tras 5 intentos fallidos.
- **RN-43 (anti-escalamiento)**: el rol Administrador siempre conserva todos los permisos. Nadie otorga ni quita permisos o ubicaciones que no tiene, ni administra usuarios con más acceso que él.

## 6. Catálogo de permisos

| Módulo | Códigos |
|---|---|
| Organización | `locations.view`, `locations.manage`, `locations.all` |
| Catálogos | `catalog.view`, `catalog.manage` |
| Inventario | `inventory.view`, `inventory.adjust`, `inventory.count`, `inventory.consumption`, `inventory.internal_transfers` (vales internos, RN-47), `inventory.traceability` (trazabilidad de lotes, RN-109) |
| Producción | `production.view`, `production.recipes.manage`, `production.orders.manage`, `production.orders.close`, `production.orders.import` |
| Logística | `logistics.view`, `logistics.orders.create`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.receive`, `logistics.transfers.special` |
| Ventas | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `sales.shipments.dispatch` |
| Compras | `purchasing.view`, `purchasing.suppliers.manage`, `purchasing.requisitions.manage`, `purchasing.po.manage`, `purchasing.po.approve`, `purchasing.receive` |
| Seguridad | `security.users.manage`, `security.roles.manage`, `security.audit.view` |
| Configuración | `settings.manage` |

**Roles predefinidos** (semilla, editables; nombres según el organigrama del cliente):

| Rol | Permisos |
|---|---|
| Administrador | Todos |
| Dirección | Todos los `*.view`, `locations.all`, `logistics.orders.approve`, `purchasing.po.approve`, `security.audit.view`, `logistics.transfers.special`, `inventory.traceability` |
| Compras | `purchasing.*` excepto `purchasing.po.approve`; `catalog.view`; `inventory.view`; `production.view` |
| Jefe de producción | `production.*`, `inventory.view`, `inventory.count`, `inventory.adjust`, `catalog.view`, `sales.view`, `logistics.view`, `inventory.traceability` |
| Supervisor de producción | `production.view`, `production.orders.close`, `inventory.view`, `catalog.view` |
| Almacén planta | `inventory.*` (incluye `inventory.traceability`), `logistics.view`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.special`, `purchasing.view`, `purchasing.receive`, `sales.view`, `sales.shipments.dispatch` |
| Distribución | `logistics.view`, `logistics.transfers.dispatch`, `sales.view`, `sales.shipments.dispatch`, `inventory.view` |
| Ventas a clientes | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `inventory.view`, `production.view` |
| Encargado de sucursal | `inventory.view`, `inventory.count`, `inventory.consumption`, `inventory.internal_transfers`, `logistics.view`, `logistics.orders.create`, `logistics.transfers.receive` |
| Consulta | Todos los `*.view` excepto `security.audit.view` |

## 7. Decisiones tomadas (heredadas como criterio del SGO AR)

1. Salidas en sucursal: consumo diario más conteo físico (no hay POS).
2. Costeo: promedio ponderado por ubicación.
3. Umbral de aprobación de OC configurable contra el subtotal sin IVA (default 0: toda OC se aprueba).
4. Lotes por artículo (`TracksLots`).
5. Alerta de caducidad por omisión: 3 días.
6. Explosión de recetas de un nivel.
7. No hay reservas de existencia: pedidos, OP y planes no apartan inventario.

## 8. Decisiones (revisadas con Paníssimo el 2026-10-17)

Cada decisión tenía una **propuesta**; las reglas de la sección 5 se escribieron con ella. Cuando la decisión difiere, la regla afectada se actualiza en la tarea de retrabajo indicada **antes** de implementarla.

| ID | Pregunta | Decisión | Estado | Afecta |
|---|---|---|---|---|
| D-01 | ¿Cuántas sucursales hay? ¿Hay un CEDIS o almacén de terminado separado de la planta? | Una sola planta, con **subalmacenes** (catálogo editable, alta y baja lógica; arranque: Materias primas, Insumos/empaque, Semiterminados, Producto terminado). Cada subalmacén lleva **existencia, kardex y conteo propios**. Los procesos usan su subalmacén directo (recepción → MP/insumos; cierre de OP consume de MP/semiterminados y deja el producto en semiterminados/terminado; despachos salen de terminado) y hay **vale interno** para movimientos manuales entre subalmacenes. Sucursales desde el CSV de semilla (lista pendiente) | Decidida, **cambia** la propuesta | B-02, B-26 |
| D-02 | ¿Lote por cierre parcial o un solo lote por OP? | Un lote por cierre | Confirmada | B-12 |
| D-03 | ¿Tolerancia de sobreproducción y motivos de faltante? | Tolerancia 10 % configurable pero **solo informativa**: no bloquea el cierre; el cierre que la excede queda marcado. Motivos sin cambio | Decidida, **cambia** la propuesta | B-12, B-27 |
| D-04 | ¿Los semiterminados se producen con su propia OP o en cascada? | Su propia OP (un nivel), con generación asistida desde el plan. El 2026-10-20 el terminado a granel pasó a ser componente del empaquetado con la misma regla (RN-119) | Confirmada | B-20, B-21 |
| D-05 | ¿El empaquetado es un SKU distinto? ¿Quién pide qué presentación? | SKU distinto con su receta. **Sucursales y clientes pueden pedir granel y empaquetado** (sucursales también insumos); nunca semiterminados ni materias primas | Decidida, **cambia** la propuesta | B-05, B-17, B-18, B-27 |
| D-06 | ¿Precios por cliente en pedido y remisión? | Opcionales e informativos (sin CFDI ni cobranza) | Confirmada | B-18 |
| D-07 | ¿El Excel de OP sale de la Matriz Maestra? ¿Con qué SKU? | Plantilla propia; cada artículo tiene **un solo SKU** (el código de Paníssimo), **obligatorio y único** en el catálogo, y la importación de OP lo identifica por él (columna `sku`). El 2026-10-18 el usuario eliminó el SKU interno separado: su valor pasó a ser el SKU (migración `RemoveInternalSku`) | Decidida, **cambia** la propuesta | B-13, B-27 |
| D-08 | ¿Cómo se registran devoluciones y rechazos de clientes? | Ajuste de entrada que además permite capturar, por línea, qué parte es **merma** con su propio motivo | Decidida, **amplía** la propuesta | B-27 |
| D-09 | ¿Cuántos clientes y puntos de entrega? ¿Quién confirma y quién despacha? | 20 a 100 clientes. Confirma Ventas a clientes; despacha Almacén planta o Distribución | Confirmada | B-18, B-19 |
| D-10 | ¿Cuántos usuarios por rol? | Se define antes del arranque (semilla de demo y capacitación) | Abierta, no bloquea | B-04, B-25 |
| D-11 | ¿Qué roles consultan la trazabilidad? ¿Las sucursales ven la cadena completa? | Administrador, Dirección, Jefe de producción y Almacén planta (decidida con el usuario el 2026-10-18). **Las sucursales no** reciben el permiso. La semilla lo asigna solo la primera vez que el permiso aparece, para no pisar ajustes posteriores a los roles | Confirmada | B-28 |

**Otras decisiones de la revisión (2026-10-17):**
- RN-70: la reposición a stock del plan reserva `MaxQty` como stock objetivo el primer día cuando la existencia proyectada al final del rango queda debajo de `MinQty` (implementado en B-20, confirmado).
- RN-31: el umbral de aprobación de OC arranca en 0 (toda OC pasa por aprobación).
- RN-32: cerrar con saldo una OC pide **motivo** (B-27).
- Cliente: el **código es editable** mientras siga siendo único (B-27).
- RN-34: una requisición **puede repetir** un artículo; cada renglón repetido exige una **nota** que explique por qué (B-27).
