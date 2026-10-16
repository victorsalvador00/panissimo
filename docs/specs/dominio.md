# Especificación de dominio — SGO Paníssimo

> Documento compartido por backend y frontend. Define el vocabulario, las entidades, los estados y las reglas de negocio. Si una regla de este documento contradice otro spec, **este documento manda**.
>
> **Implementación desde cero.** Este sistema se construye en un repositorio nuevo, fase por fase. Toma como referencia funcional el Sistema de Gestión Operativa AR (SGO AR), pero **no reutiliza su código**: todo lo que se necesita está descrito en estos tres specs.
>
> **Decisiones abiertas.** Las reglas que dependen de un dato que el cliente aún no confirma están en la sección 8 (`D-xx`), con una propuesta. **No implementes una tarea que dependa de una decisión abierta sin confirmarla.**

## 1. Contexto

Paníssimo (Grupo Maroño, S.A. de C.V.) es una panadería con planta propia:

- **1 planta** que compra materias primas, insumos y productos de uso general; produce y abastece. Trabaja en tres turnos (día, tarde y noche) con áreas de producción (cuadrillas).
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
| Artículo | `Item` | Materia prima, insumo, semiterminado o terminado |
| Materia prima | `RawMaterial` | Harina, azúcar, margarina… |
| Insumo / uso general | `Supply` | Empaque, etiquetas, limpieza, papelería. Se compra y se consume; no tiene receta |
| Semiterminado | `SemiFinished` | Masa, revuelto, relleno, betún. Se produce con OP y se usa en otra receta |
| Producto terminado | `FinishedGood` | |
| Presentación | `ItemPresentation` | `Bulk` (granel, para sucursales) o `Packaged` (empaquetado, para clientes) |
| Área de producción | `ProductionArea` | Cuadrilla: Bizcocho Día, Pan de Sal Noche, Rondo… |
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
| Parámetro | `AppSetting` | |

## 3. Convenciones generales

- **Identificadores:** `Guid` v7 (`Guid.CreateVersion7()`).
- **Campos de auditoría:** `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`. Los DTO exponen además el nombre del usuario (`createdByName`, etc.).
- **Catálogos** (ubicaciones, artículos, proveedores, clientes, áreas…) usan `IsActive` para baja lógica; nunca se borran físicamente.
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
- `Code` (único, ej. `PLANTA`, `SUC-01`), `Name`, `Type` (`Plant | Branch`), `Address`, `IsActive`.
- Derivados: `CanPurchase`, `CanProduce`, `CanSupplyBranches` y `CanSellToCustomers` son verdaderos solo para `Plant`.
- El nombre es editable; el código y el tipo no cambian después del alta.

**ProductionArea**: `Code` (único), `Name`, `SortOrder`, `IsActive`. Semilla (editable): Bizcocho Día, Pan de Sal Día, Pan de Sal Noche, Rondo, Repostería, Panquelería, Pastelería, Congelado, Bocadillos, Masas, Empaque.

**Shift** (enum, no catálogo): `Day` (Día), `Afternoon` (Tarde), `Night` (Noche).

### 4.2 Catálogos

**UnitOfMeasure**: `Code` (`kg`, `g`, `l`, `ml`, `pza`, `caja`, `bulto`, `paq`…), `Name`, `Kind` (`Mass | Volume | Unit`), `IsActive`.

**ItemCategory**: `Name` (único), `IsActive`.

**Item**
- `Sku` (único, se guarda en mayúsculas), `Name`, `Type` (`RawMaterial | Supply | SemiFinished | FinishedGood`), `CategoryId`.
- `BaseUomId`: unidad en la que se lleva el inventario.
- `PurchaseUomId` (opcional) + `PurchaseToBaseFactor` (> 0; ej. bulto → 44 kg). Si no hay unidad de compra, el factor es 1.
- `TracksLots` (bool), `ShelfLifeDays` (opcional, ≥ 0), `StorageCondition` (`Ambient | Refrigerated | Frozen`).
- `TaxRate` para compras (`0.00` o `0.16`).
- `Presentation` (`Bulk | Packaged`): obligatorio para `FinishedGood`, nulo para los demás tipos.
- `BulkItemId` (opcional, solo si `Presentation = Packaged`): el producto a granel del que es versión empaquetada (ej. `TRENZA EMBOLSADA` → `TRENZA`). Debe ser un `FinishedGood` `Bulk` activo. Es informativo (reportes y equivalencias); no mueve inventario.
- `UnitsPerPackage` (opcional, `Packaged`): piezas por paquete (informativo).
- `ProductionAreaId` (opcional; solo `SemiFinished` y `FinishedGood`): área por defecto de sus OP.
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
- `Reason`: `Correction` (entrada o salida, movimiento `Adjustment`), `Waste`, `Expired` y `Damaged` (solo salidas, movimiento `Waste`), `InternalUse` (solo salida, movimiento `Adjustment`).
- Líneas: `ItemId`, `LotId`, `Quantity` (con signo), `UnitCost` (solo en entradas de corrección), `LotNumber` y `ExpirationDate` (solo en entradas de artículos con lotes), `Notes`.
- Un ajuste no se cancela; se corrige con otro ajuste.

**ConsumptionEntry** (salida de sucursal; solo ubicaciones `Branch`)
- Encabezado: `Folio`, `LocationId`, `BusinessDate` (hoy o anterior), `Status` (`Posted`), `Notes`.
- Líneas: `ItemId`, `LotId` (opcional; FEFO si se omite), `Quantity`.

### 4.4 Producción

**Recipe**
- Encabezado: `OutputItemId` (`SemiFinished` o `FinishedGood`), `Version`, `IsActive`, `YieldQty` (en unidad base del producto), `Notes`.
- Líneas (`RecipeLine`): `ComponentItemId`, `Quantity` (por `YieldQty`, en unidad base del componente), `WastePct` (0–100, 2 decimales).
- Los componentes pueden ser `RawMaterial`, `Supply` (ej. bolsa y etiqueta del empaquetado) o `SemiFinished`. Un `FinishedGood` no es componente (D-04). Un producto no puede ser su propio componente ni repetir componentes.

**ProductionOrder**
- Encabezado: `Folio`, `LocationId` (Plant), `RecipeId` (versión exacta), `OutputItemId`, `PlannedQty`, `ScheduledDate`, `ProductionAreaId` (default: el del artículo), `Shift` (opcional), `Source` (`Manual | Plan | Import`), `ImportId` (opcional), `Notes`.
- `Status`: `Draft → Released → InProgress → Completed`; además `Cancelled` (RN-60).
- Acumulados (se recalculan con cada cierre): `ProducedQty`, `TotalCost`, `UnitCost` (= `TotalCost / ProducedQty`).
- Cierre final: `CompletedAt`, `CompletedBy`, `ShortfallReason` (`MissingMaterial | MissingStaff | EquipmentFailure | DemandChange | Other`; requerido si `ProducedQty < PlannedQty`), `ShortfallNotes`.
- Líneas (`ProductionOrderLine`): `ComponentItemId`, `TheoreticalQty` (para lo planeado, RN-11), `ActualQty` (acumulado de los cierres).

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

**Transfer** (traspaso con datos de envío)
- Encabezado: `Folio`, `FromLocationId`, `ToLocationId`, `BranchOrderId` (opcional), `Notes`.
- `Status`: `Draft → Dispatched → Received | ReceivedWithDiscrepancies`; además `Cancelled` (solo desde `Draft`).
- Envío: `VehicleDescription`, `DriverName`, `DispatchedAt`, `DispatchedBy`.
- Recepción: `ReceivedAt`, `ReceivedBy`.
- Líneas: `ItemId`, `PlannedLotId` (opcional), `ShippedQty`, `ReceivedQty`, `UnitCost`, `DiscrepancyReason` (`Missing | Damaged | Other`), `DiscrepancyNotes`. Lotes despachados: `TransferLineLot` (`LineId`, `LotId`, `Quantity`).

### 4.6 Ventas a terceros

**Customer**: `Code` (único, ej. `CLI-001`), `Name`, `TaxId` (RFC, opcional; mismas reglas que el proveedor), `ContactName`, `Phone`, `Email`, `Notes`, `IsActive`.

**CustomerDeliveryPoint**: `CustomerId`, `Name`, `Address`, `IsActive`.

**CustomerItem** (opcional, D-06): `CustomerId`, `ItemId` (`Packaged`), `CustomerSku`, `Price` (sin IVA, informativo), `IsActive`. Único por `(CustomerId, ItemId)`.

**CustomerOrder** (pedido de cliente)
- Encabezado: `Folio` (`PC-…`), `CustomerId`, `DeliveryPointId` (opcional), `SupplyingLocationId` (Plant), `RequiredDate`, `CustomerReference` (orden de compra del cliente, opcional), `CloseReason`, `Notes`.
- `Status`: `Draft → Confirmed → PartiallyShipped → Shipped`; además `Closed` (cerrado con saldo) y `Cancelled`.
- Líneas: `ItemId`, `Quantity`, `ShippedQty`, `UnitPrice` (opcional, D-06).

**CustomerShipment** (remisión)
- Encabezado: `Folio` (`RM-…`), `CustomerOrderId`, `CustomerId`, `DeliveryPointId`, `FromLocationId` (Plant), `Notes`.
- `Status`: `Draft → Dispatched`; además `Cancelled` (solo en `Draft`).
- Envío: `VehicleDescription`, `DriverName`, `DispatchedAt`, `DispatchedBy`, `ReceivedByName` (quién firma de recibido, opcional).
- Líneas: `CustomerOrderLineId`, `ItemId`, `Quantity`, `UnitCost` (al despachar). Lotes: `CustomerShipmentLineLot` (`LineId`, `LotId`, `Quantity`).

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
- Líneas: `PurchaseOrderLineId`, `ItemId`, `Quantity` (unidad de compra), `BaseQuantity`, `UnitCostBase`, `LotNumber`, `ExpirationDate`.

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

- **RN-10**: Solo hay una receta activa por artículo. Editar una receta ya usada en una OP crea una **nueva versión** (N+1) y desactiva la anterior; la OP conserva la versión con la que se creó. Editar una receta nunca usada la modifica en su lugar. Activar una versión anterior exige desactivar antes la activa.
- **RN-11**: Consumo teórico por componente para una cantidad `Q` = `Q / YieldQty × línea.Quantity × (1 + WastePct/100)`. Se usa con `PlannedQty` en la OP y con el `ProducedQty` de cada cierre.
- **RN-12 (explosión con disponibilidad)**: para una receta y cantidad, se calcula el teórico de cada componente, la existencia utilizable en la ubicación (sin lotes vencidos), el faltante y el costo estimado (costo promedio vigente).
- **RN-13 (merma de producción)**: merma de un cierre = consumo real − teórico calculado sobre el `ProducedQty` de **ese cierre**. La merma de la OP es la suma de sus cierres. Se reporta; no genera movimientos extra.
- **RN-14**: Solo se produce en la Planta. El producto de una OP es `SemiFinished` o `FinishedGood` con receta activa.

### Órdenes de producción con cierre parcial y final

- **RN-60 (estados)**:
  - `Draft`: se edita (producto, cantidad, fecha, área, turno, notas) y se puede cancelar. Al cambiar de producto se toma su receta activa.
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
  - El total producido no puede superar `PlannedQty × (1 + production.overrun_tolerance_pct / 100)`. La misma validación aplica a cada cierre parcial (D-03).
  - La OP pasa a `Completed`. Un cierre final con `ProducedQty = 0` no mueve inventario.
- **RN-64 (costos del cierre)**: `TotalCost` = Σ (consumo real × costo promedio vigente del componente en la Planta, RN-04). `UnitCost` = `TotalCost / ProducedQty`. La entrada del producto se registra a ese costo. La OP acumula `TotalCost` y calcula su `UnitCost` promedio.
- **RN-65 (sin reversa)**: un cierre registrado no se edita ni se cancela; se corrige con un ajuste de inventario.
- **RN-66 (concurrencia)**: los cierres de una misma OP se serializan (bloqueo de la fila y `version`). Dos cierres simultáneos → uno se registra y el otro recibe 409.
- **RN-67 (semiterminados)**: la explosión es de **un nivel**. Si falta un semiterminado, se produce con su propia OP. El plan (RN-70) y el requerimiento de materia prima (RN-50) lo marcan "por producir" y permiten generar esa OP (D-04).

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
- **RN-71 (generar OP desde el plan)**: el usuario elige renglones del plan y ajusta la cantidad (> 0). Se crea **una OP `Draft` por producto, fecha, área y turno**, con `Source = Plan`, la receta activa y una liga `ProductionOrderDemand` por línea de pedido que originó la demanda (repartiendo en orden de `RequiredDate`). Todo o nada; un producto sin receta activa lo bloquea.
- **RN-72 (ligas informativas)**: las ligas muestran qué pedidos atiende una OP. **No reservan** producto: los pedidos se surten desde la existencia de la Planta con traspasos o remisiones. Cancelar una OP no cambia el pedido.
- **RN-73 (OP manual)**: también se crean OP sin pedido (para stock), con `Source = Manual`.

### Importación de OP desde Excel

- **RN-90 (formato)**: archivo `.xlsx` (máx. 5 MB) con una hoja `OP` (si no existe, la primera hoja) y encabezados en la fila 1. Columnas en cualquier orden, sin distinguir mayúsculas ni acentos:

  | Columna | Obligatoria | Regla |
  |---|---|---|
  | `fecha` | Sí | Fecha programada (celda de fecha o texto `dd/mm/aaaa`). No pasada |
  | `sku` | Sí | Artículo activo `SemiFinished` o `FinishedGood` con receta activa |
  | `cantidad` | Sí | > 0, hasta 4 decimales (entero si es `pza`) |
  | `area` | No | Código o nombre de un área activa. Vacío = área del artículo |
  | `turno` | No | `Día`, `Tarde` o `Noche`. Vacío = sin turno |
  | `ubicacion` | No | Código de una Planta del alcance del usuario. Vacío = la Planta |
  | `notas` | No | Máximo 500 caracteres |

  Columnas desconocidas se ignoran con aviso; filas vacías se ignoran; máximo **3,000 filas**. El sistema ofrece una **plantilla** con esos encabezados y una hoja de instrucciones.
- **RN-91 (todo o nada)**: se validan todas las filas y se reportan **todos** los errores por fila y columna. Con un solo error, no se crea nada.
- **RN-92 (agrupación)**: filas con el mismo `(fecha, sku, area, turno, ubicacion)` se suman en una sola OP. La vista previa muestra "N filas → M órdenes".
- **RN-93 (avisos)**: requieren confirmación del usuario, no son errores: archivo con el mismo SHA-256 que una importación anterior, y OP no cancelada existente del mismo producto, fecha, área y turno.
- **RN-94 (resultado)**: crea un `ProductionOrderImport` y sus OP en `Draft` con `Source = Import`. Con **"Liberar al importar"** (y permiso de gestionar OP) las crea en `Released`. Todo en una transacción.
- **RN-95 (Matriz Maestra)**: las hojas de la Matriz Maestra del cliente no se importan directamente (usan SKU internos `SKU0001…`). El cliente copia `fecha`, `sku` y `cantidad` a la plantilla (D-07).

### Logística

- **RN-20 (pedido de sucursal)**:
  - Solo sucursales piden, siempre a la Planta. Fecha requerida no pasada; cantidades en unidad base.
  - Se piden `FinishedGood` a granel y `Supply`; no `Packaged` ni `SemiFinished` (D-05).
  - La sucursal lo crea en `Draft` y lo envía (`Submitted`). La Planta lo aprueba ajustando `ApprovedQty` (0 a lo solicitado; todo en 0 no se permite: se rechaza con motivo).
  - Aprobar crea **un** traspaso en `Draft` ligado, con las líneas aprobadas (> 0). No se reserva existencia.
  - La Planta puede editar ese traspaso antes de despacharlo, sin cambiar el destino, sin artículos ajenos al pedido y sin pasar de lo aprobado. Cancelar ese traspaso **cancela el pedido**.
  - El pedido se cancela solo en `Draft` o `Submitted`.
  - **Sugerido por mín/máx**: proyectado = existencia + en tránsito hacia la sucursal + pedidos enviados o aprobados sin despachar; si proyectado ≤ mínimo, se sugiere máximo − proyectado.
- **RN-21 (despacho)**: registra `TransferOut` en el origen (lote planeado, lotes elegidos o FEFO). El traspaso queda en tránsito.
- **RN-22 (recepción)**:
  - El destino captura `ReceivedQty` por línea (0 a lo enviado) y se registra `TransferIn` por lo recibido, con los mismos lotes y costo.
  - Si `ReceivedQty < ShippedQty`, se requiere `DiscrepancyReason` y el traspaso queda `ReceivedWithDiscrepancies`; el faltante es pérdida en tránsito y se reporta.
- **RN-23**: un traspaso despachado no se edita ni se cancela.
- **RN-24**: al **despachar** un traspaso ligado a un pedido se actualiza `ShippedQty`; si se despachó todo lo aprobado, el pedido queda `Fulfilled`, si no, `PartiallyFulfilled` (final: lo que falte se pide de nuevo).
- **RN-25 (rutas)**: sin permiso especial, los traspasos solo van de la Planta a una sucursal. Con `logistics.transfers.special` se permiten sucursal → sucursal y sucursal → Planta (devoluciones).

### Ventas a terceros

- **RN-80 (pedido de cliente)**:
  - Se captura en `Draft` con cliente activo, punto de entrega opcional (del mismo cliente y activo), fecha requerida no pasada y al menos una línea.
  - Solo `FinishedGood` activos con `Presentation = Packaged`, sin repetir (D-05).
  - **Confirmar** (`Draft → Confirmed`) lo vuelve demanda del plan. Un pedido confirmado no se edita; si cambia, se cancela y se captura otro.
  - Cancelar: en `Draft` o `Confirmed` sin nada remisionado.
- **RN-81 (remisión)**:
  - Se crea desde un pedido `Confirmed` o `PartiallyShipped`, prellenada con el saldo de cada línea, en `Draft`. Puede haber varias remisiones por pedido.
  - **Despachar** registra `CustomerShipment` en la Planta (FEFO salvo lotes elegidos; vencidos rechazados) al costo promedio vigente. Valida RN-02.
  - Una remisión despachada no se edita ni se cancela.
- **RN-82 (avance del pedido)**: al despachar se suma a `ShippedQty`; lo remisionado por línea no excede lo pedido × (1 + `sales.shipment_tolerance_pct` / 100). Todas las líneas completas → `Shipped`; si no, `PartiallyShipped`. Un pedido `PartiallyShipped` puede **cerrarse con saldo** (`Closed`, con motivo).
- **RN-83 (alcance)**: la remisión es un documento de entrega. No es factura ni genera cuenta por cobrar; los precios son informativos (D-06). Las devoluciones de cliente se registran como ajuste de entrada (D-08).

### Compras

- **RN-30 (precio y catálogo)**: solo se agregan a una OC artículos del catálogo activo del proveedor. El precio se sugiere desde `SupplierItem.Price` y es editable.
- **RN-31 (aprobación)**: al enviar una OC, si `Subtotal ≥ purchasing.po_approval_threshold` pasa a `PendingApproval` y requiere `purchasing.po.approve`; si no, pasa directamente a `Approved`. Rechazar exige motivo y es final.
- **RN-32 (recepción)**:
  - Se permite recepción parcial y una línea puede recibirse en varios lotes.
  - La sobre-recepción se permite hasta `purchasing.receipt_tolerance_pct`.
  - La OC pasa a `Received` cuando todas sus líneas están completas.
  - Una OC con saldo se cierra manualmente (`Closed`, solo desde `PartiallyReceived`).
  - Una OC se cancela solo en `Draft`, `PendingApproval` o `Approved` sin nada recibido.
- **RN-33**: la recepción registra `PurchaseReceipt` con costo base = `UnitPrice / PurchaseToBaseFactor` (sin IVA). Solo se reciben OC `Approved` o `PartiallyReceived`. Entrega solo en la Planta.
- **RN-34 (requisiciones)**:
  - Solo la Planta; `NeededBy` no pasada; cantidades en unidad de compra.
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
- **RN-53 (resumen de producción)**: por área, producto o día en un rango: planeado (OP del rango no canceladas), producido (cierres del rango), % de cumplimiento, costo producido y merma de producción en pesos (RN-13).

### Seguridad

- **RN-40 (permisos y alcance)**: un rol es un conjunto de permisos; un usuario tiene uno o más roles y una o más ubicaciones. Solo ve y opera datos de sus ubicaciones, salvo con `locations.all`.
- **RN-41**: toda operación que mueva inventario o cambie el estado de un documento, y todo cambio a catálogos, usuarios, roles y parámetros, queda en `AuditLog`.
- **RN-42**: un usuario inactivo no inicia sesión. La cuenta se bloquea 15 minutos tras 5 intentos fallidos.
- **RN-43 (anti-escalamiento)**: el rol Administrador siempre conserva todos los permisos. Nadie otorga ni quita permisos o ubicaciones que no tiene, ni administra usuarios con más acceso que él.

## 6. Catálogo de permisos

| Módulo | Códigos |
|---|---|
| Organización | `locations.view`, `locations.manage`, `locations.all` |
| Catálogos | `catalog.view`, `catalog.manage` |
| Inventario | `inventory.view`, `inventory.adjust`, `inventory.count`, `inventory.consumption` |
| Producción | `production.view`, `production.recipes.manage`, `production.orders.manage`, `production.orders.close`, `production.orders.import`, `production.areas.manage` |
| Logística | `logistics.view`, `logistics.orders.create`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.receive`, `logistics.transfers.special` |
| Ventas | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `sales.shipments.dispatch` |
| Compras | `purchasing.view`, `purchasing.suppliers.manage`, `purchasing.requisitions.manage`, `purchasing.po.manage`, `purchasing.po.approve`, `purchasing.receive` |
| Seguridad | `security.users.manage`, `security.roles.manage`, `security.audit.view` |
| Configuración | `settings.manage` |

**Roles predefinidos** (semilla, editables; nombres según el organigrama del cliente):

| Rol | Permisos |
|---|---|
| Administrador | Todos |
| Dirección | Todos los `*.view`, `locations.all`, `logistics.orders.approve`, `purchasing.po.approve`, `security.audit.view`, `logistics.transfers.special` |
| Compras | `purchasing.*` excepto `purchasing.po.approve`; `catalog.view`; `inventory.view`; `production.view` |
| Jefe de producción | `production.*`, `inventory.view`, `inventory.count`, `inventory.adjust`, `catalog.view`, `sales.view`, `logistics.view` |
| Supervisor de producción | `production.view`, `production.orders.close`, `inventory.view`, `catalog.view` |
| Almacén planta | `inventory.*`, `logistics.view`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.special`, `purchasing.view`, `purchasing.receive`, `sales.view`, `sales.shipments.dispatch` |
| Distribución | `logistics.view`, `logistics.transfers.dispatch`, `sales.view`, `sales.shipments.dispatch`, `inventory.view` |
| Ventas a clientes | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `inventory.view`, `production.view` |
| Encargado de sucursal | `inventory.view`, `inventory.count`, `inventory.consumption`, `logistics.view`, `logistics.orders.create`, `logistics.transfers.receive` |
| Consulta | Todos los `*.view` excepto `security.audit.view` |

## 7. Decisiones tomadas (heredadas como criterio del SGO AR)

1. Salidas en sucursal: consumo diario más conteo físico (no hay POS).
2. Costeo: promedio ponderado por ubicación.
3. Umbral de aprobación de OC configurable contra el subtotal sin IVA (default 0: toda OC se aprueba).
4. Lotes por artículo (`TracksLots`).
5. Alerta de caducidad por omisión: 3 días.
6. Explosión de recetas de un nivel.
7. No hay reservas de existencia: pedidos, OP y planes no apartan inventario.

## 8. Decisiones abiertas (por confirmar con Paníssimo)

Cada decisión tiene una **propuesta**; las reglas de la sección 5 están escritas con ella. Si el cliente decide otra cosa, se actualiza la regla antes de implementar la tarea afectada.

| ID | Pregunta | Propuesta | Afecta |
|---|---|---|---|
| D-01 | ¿Cuántas sucursales hay, con qué códigos y nombres? ¿Hay un CEDIS o almacén de terminado separado de la planta? | Una sola planta (`PLANTA`) que también es almacén de terminado; sucursales cargadas desde un CSV de semilla | B-02 |
| D-02 | ¿Lote por cierre parcial o un solo lote por OP? | Un lote por cierre (cada tramo se hornea en otro momento y su caducidad puede diferir) | B-12 |
| D-03 | ¿Tolerancia de sobreproducción y motivos de faltante? | 10 % configurable; motivos: falta de insumo, falta de personal, falla de equipo, ajuste de demanda, otro | B-12 |
| D-04 | ¿Los semiterminados se producen con su propia OP o se consumen "en cascada" dentro de la OP del terminado? | Su propia OP (un nivel), con generación asistida desde el plan | B-20, B-21 |
| D-05 | ¿El empaquetado es un SKU distinto del granel? ¿Una sucursal puede pedir empaquetado o un cliente granel? | SKU distinto con su receta (semiterminado + bolsa + etiqueta). Sucursales: granel e insumos; clientes: empaquetado | B-05, B-17, B-18 |
| D-06 | ¿Se necesitan precios por cliente en pedido y remisión? | Opcionales e informativos (sin CFDI ni cobranza) | B-18 |
| D-07 | ¿El Excel de OP sale de la Matriz Maestra? ¿Con qué SKU? | Plantilla propia con los SKU del sistema; agregar a la Matriz una columna con ese SKU | B-13 |
| D-08 | ¿Cómo se registran devoluciones y rechazos de clientes? | Ajuste de entrada; documento propio como ampliación | — |
| D-09 | ¿Cuántos clientes y puntos de entrega hay? ¿Quién confirma y quién despacha? | Confirma Ventas a clientes; despacha Almacén planta o Distribución | B-18, B-19 |
| D-10 | ¿Cuántos usuarios por rol? | — (semilla y capacitación) | B-04 |
