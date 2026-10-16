# Especificación de dominio — Sistema de Gestión Operativa AR (SGO AR)

> Documento compartido por backend y frontend. Define el vocabulario, las entidades, los estados y las reglas de negocio. Si una regla de este documento contradice otro spec, **este documento manda**.

## 1. Contexto

Franquicia de cafeterías con:

- **10 sucursales** (reciben producto, lo almacenan y lo consumen/venden).
- **1 fábrica** y **1 comisariato** (compran materia prima, producen y abastecen a sucursales).
- **~30 productos terminados** y **~80 materias primas**.

Flujo principal:

```
Proveedor ──OC──▶ Fábrica / Comisariato ──Producción──▶ Producto terminado
                                                             │
Sucursal ──Pedido──▶ Comisariato ──Traspaso (despacho)──▶ Sucursal (recepción) ──▶ Consumo
```

Fuera de alcance: facturación CFDI, contabilidad, nómina, integración con punto de venta, app móvil nativa y operación offline.

## 2. Glosario (español → código)

El código (clases, tablas, endpoints) va en **inglés**; la interfaz de usuario va en **español**.

| Español | Código | Notas |
|---|---|---|
| Ubicación | `Location` | Sucursal, fábrica o comisariato |
| Sucursal | `Branch` | `LocationType.Branch` |
| Fábrica | `Factory` | `LocationType.Factory` |
| Comisariato | `Commissary` | `LocationType.Commissary` |
| Artículo | `Item` | Materia prima, intermedio o terminado |
| Materia prima | `RawMaterial` | `ItemType.RawMaterial` |
| Producto intermedio | `Intermediate` | Se produce y se usa en otra receta |
| Producto terminado | `FinishedGood` | `ItemType.FinishedGood` |
| Unidad de medida | `UnitOfMeasure` | |
| Lote | `Lot` | Con fecha de caducidad |
| Existencia | `StockBalance` | Por ubicación, artículo y lote |
| Movimiento de inventario / kardex | `InventoryMovement` | Inmutable |
| Conteo físico | `PhysicalCount` | |
| Ajuste de inventario | `InventoryAdjustment` | |
| Registro de consumo | `ConsumptionEntry` | Salidas de sucursal |
| Receta | `Recipe` | Lista de materiales (BOM) versionada |
| Orden de producción | `ProductionOrder` | |
| Merma | `Waste` | |
| Pedido de sucursal | `BranchOrder` | |
| Traspaso | `Transfer` | Incluye datos de envío |
| Proveedor | `Supplier` | |
| Requisición | `PurchaseRequisition` | |
| Orden de compra | `PurchaseOrder` | |
| Recepción de compra | `GoodsReceipt` | |
| Rol / Permiso | `Role` / `Permission` | |
| Bitácora | `AuditLog` | |

## 3. Convenciones generales

- **Identificadores:** `Guid` v7 (`Guid.CreateVersion7()`).
- **Campos comunes de auditoría:** `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`.
- **Catálogos** (ubicaciones, artículos, proveedores, etc.) usan `IsActive` para baja lógica; nunca se borran físicamente.
- **Documentos** (OC, OP, traspasos, etc.) tienen `Folio`, `Status`, `Notes` y **no se borran: se cancelan**.
- **Cantidades:** siempre se guardan en la **unidad base** del artículo, `numeric(18,4)`.
- **Costos:** MXN sin IVA, `numeric(18,4)`.
- **Fechas:** `timestamptz` en UTC. La "fecha de negocio" se calcula en `America/Mexico_City`.
- **Folios:** consecutivos por tipo de documento, formato `PREFIJO-000001`.

| Documento | Prefijo |
|---|---|
| Requisición | `REQ` |
| Orden de compra | `OC` |
| Recepción de compra | `REC` |
| Orden de producción | `OP` |
| Pedido de sucursal | `PED` |
| Traspaso | `TR` |
| Ajuste | `AJ` |
| Conteo físico | `CF` |
| Registro de consumo | `CON` |

## 4. Entidades

### 4.1 Organización

**Location**
- `Code` (único, ej. `SUC-01`, `FAB`, `COM`), `Name`, `Type` (`Branch | Factory | Commissary`), `Address`, `IsActive`.
- Derivados: `CanProduce` = Factory o Commissary. `CanSupplyBranches` = Factory o Commissary.

### 4.2 Catálogos

**UnitOfMeasure**: `Code` (`kg`, `g`, `l`, `ml`, `pza`, `caja`…), `Name`, `Kind` (`Mass | Volume | Unit`).

**ItemCategory**: `Name`, `IsActive`.

**Item**
- `Sku` (único), `Name`, `Type` (`RawMaterial | Intermediate | FinishedGood`), `CategoryId`.
- `BaseUomId` — unidad en la que se lleva el inventario.
- `PurchaseUomId` (opcional) + `PurchaseToBaseFactor` (ej. caja → 12 pza).
- `TracksLots` (bool), `ShelfLifeDays` (opcional), `StorageCondition` (`Ambient | Refrigerated | Frozen`).
- `TaxRate` para compras (`0.00` o `0.16`).
- `IsActive`.

**ItemLocationSetting**: `ItemId`, `LocationId`, `MinQty`, `MaxQty`. Sirve para alertas de stock bajo y sugerencias de pedido.

### 4.3 Inventario

**Lot**: `ItemId`, `LotNumber`, `ExpirationDate` (opcional), `CreatedFromDocType`, `CreatedFromDocId`.

**StockBalance**: `LocationId`, `ItemId`, `LotId` (nullable), `Quantity`. Llave única `(LocationId, ItemId, LotId)`.

**ItemLocationCost**: `LocationId`, `ItemId`, `AverageCost`. Guarda el costo promedio ponderado vigente.

**InventoryMovement** (inmutable, es el kardex)
- `OccurredAt`, `BusinessDate`, `LocationId`, `ItemId`, `LotId`.
- `Type` — uno de:
  - `PurchaseReceipt`
  - `ProductionConsumption`
  - `ProductionOutput`
  - `TransferOut`
  - `TransferIn`
  - `Adjustment`
  - `Waste`
  - `PhysicalCountAdjustment`
  - `Consumption`
- `Quantity` (con signo: + entrada, − salida; unidad base), `UnitCost`, `TotalCost`.
- `SourceDocType`, `SourceDocId`, `SourceDocFolio`, `UserId`, `Notes`.

**PhysicalCount**
- Encabezado: `Folio`, `LocationId`, `Status` (`Draft → InProgress → Closed | Cancelled`), `CategoryId` (opcional, para conteos parciales), `StartedAt`, `ClosedAt`.
- Líneas: `ItemId`, `LotId`, `SnapshotQty`, `CountedQty`, `Difference`.

**InventoryAdjustment**
- Encabezado: `Folio`, `LocationId`, `Reason` (`Correction | Waste | Expired | Damaged | InternalUse`), `Status` (`Posted | Cancelled`).
- Líneas: `ItemId`, `LotId`, `Quantity` (con signo), `Notes`.

**ConsumptionEntry** (salida de inventario en sucursal)
- Encabezado: `Folio`, `LocationId`, `BusinessDate`, `Status` (`Posted | Cancelled`).
- Líneas: `ItemId`, `LotId`, `Quantity`.

### 4.4 Producción

**Recipe**
- Encabezado: `OutputItemId`, `Version`, `IsActive`, `YieldQty` (en unidad base del producto), `Notes`.
- Líneas (`RecipeLine`): `ComponentItemId`, `Quantity` (por `YieldQty`, en unidad base del componente), `WastePct` (0–100).

**ProductionOrder**
- Encabezado: `Folio`, `LocationId` (Factory o Commissary), `RecipeId` (versión exacta), `OutputItemId`, `PlannedQty`, `ProducedQty`, `ScheduledDate`.
- `Status`: `Draft → Released → Completed | Cancelled`.
- Salida: `OutputLotId`, `UnitCost`, `CompletedAt`, `CompletedBy`.
- Líneas de consumo (`ProductionOrderLine`): `ComponentItemId`, `TheoreticalQty`, `ActualQty`, `UnitCost`.
- Asignación de lotes (`ProductionOrderLineLot`): `LineId`, `LotId`, `Quantity`.

### 4.5 Logística

**BranchOrder** (pedido de sucursal)
- Encabezado: `Folio`, `RequestingLocationId` (Branch), `SupplyingLocationId` (Factory o Commissary), `RequiredDate`.
- `Status`: `Draft → Submitted → Approved → PartiallyFulfilled → Fulfilled`; además `Rejected | Cancelled`.
- Líneas: `ItemId`, `RequestedQty`, `ApprovedQty`, `ShippedQty`.

**Transfer** (traspaso con datos de envío)
- Encabezado: `Folio`, `FromLocationId`, `ToLocationId`, `BranchOrderId` (opcional).
- `Status`: `Draft → Dispatched → Received | ReceivedWithDiscrepancies`; además `Cancelled`, solo si está en `Draft`.
- Envío: `VehicleDescription`, `DriverName`, `DispatchedAt`, `DispatchedBy`.
- Recepción: `ReceivedAt`, `ReceivedBy`.
- Líneas: `ItemId`, `LotId`, `ShippedQty`, `ReceivedQty`, `UnitCost`, `DiscrepancyReason` (`Missing | Damaged | Other`), `DiscrepancyNotes`.

### 4.6 Compras

**Supplier**: `TaxId` (RFC), `Name`, `ContactName`, `Phone`, `Email`, `PaymentTermsDays`, `IsActive`.

**SupplierItem**: `SupplierId`, `ItemId`, `SupplierSku`, `Price` (por unidad de compra, sin IVA), `LeadTimeDays`, `IsPreferred`.

**PurchaseRequisition**
- Encabezado: `Folio`, `LocationId`, `NeededBy`.
- `Status`: `Draft → Submitted → Approved → Converted`; además `Rejected | Cancelled`.
- Líneas: `ItemId`, `Quantity` (unidad de compra), `SuggestedSupplierId`.

**PurchaseOrder**
- Encabezado: `Folio`, `SupplierId`, `DeliveryLocationId`, `ExpectedDate`, `Subtotal`, `TaxTotal`, `Total`, `ApprovedBy`, `ApprovedAt`.
- `Status`: `Draft → PendingApproval → Approved → PartiallyReceived → Received`; además `Rejected | Cancelled | Closed`.
- `Rejected` es final (acordado en B-14): se rechaza desde `PendingApproval` con motivo; para reintentar se captura una OC nueva.
- Líneas: `ItemId`, `Quantity` (unidad de compra), `UnitPrice`, `TaxRate`, `ReceivedQty`, `RequisitionLineId` (opcional).

**GoodsReceipt**
- Encabezado: `Folio`, `PurchaseOrderId`, `LocationId`, `ReceivedAt`, `SupplierInvoiceNumber`.
- Líneas: `PurchaseOrderLineId`, `ItemId`, `Quantity` (unidad de compra), `BaseQuantity`, `UnitCostBase`, `LotNumber`, `ExpirationDate`.

### 4.7 Seguridad y auditoría

- **User** (ASP.NET Core Identity): `FullName`, `Email`, `IsActive`, `DefaultLocationId`.
- **UserLocation**: `UserId`, `LocationId`. Define a qué ubicaciones tiene acceso el usuario.
- **Role**: `Name`, `Description`, `IsSystem`.
- **RolePermission**: `RoleId`, `PermissionCode`.
- **AuditLog**: `OccurredAt`, `UserId`, `Action`, `EntityType`, `EntityId`, `ChangesJson`, `IpAddress`.
- **AppSetting**: clave/valor. Se usa para parámetros como el umbral de aprobación de OC y los días de alerta de caducidad.

## 5. Reglas de negocio

### Inventario

- **RN-01**: La existencia **solo** cambia mediante `InventoryMovement`. Los movimientos son inmutables; para corregir uno se registra un ajuste o el movimiento inverso.
- **RN-02**: No se permite existencia negativa por `(ubicación, artículo, lote)`. Si una operación la provocaría, se rechaza completa (nada se registra) con el detalle de faltantes.
- **RN-03**: Todas las cantidades se convierten a unidad base antes de registrar. Conversión de compra: `BaseQty = PurchaseQty × PurchaseToBaseFactor`. Redondeo a 4 decimales.
- **RN-04 (costo promedio ponderado por ubicación)**:
  - Entrada: `nuevoCosto = (qtyActual × costoActual + qtyEntrada × costoEntrada) / (qtyActual + qtyEntrada)`.
  - Salidas y traspasos salen al costo promedio vigente de la ubicación origen. El traspaso entra al destino con ese mismo costo.
  - Si la existencia previa es ≤ 0, el nuevo costo es el costo de la entrada.
- **RN-05 (lotes)**:
  - Los artículos con `TracksLots = true` requieren lote en toda entrada.
  - Las salidas asignan lotes por **FEFO** (primero en caducar, primero en salir), salvo que el usuario elija el lote.
  - Un lote vencido no puede despacharse ni consumirse en producción; debe darse de baja con un ajuste de tipo `Expired`.
- **RN-06 (conteo físico)**:
  - Al pasar a `InProgress` se guarda `SnapshotQty` de cada línea.
  - Al cerrar, se registra un movimiento `PhysicalCountAdjustment` por `CountedQty − SnapshotQty` en cada línea con diferencia.
  - Solo puede haber un conteo `InProgress` por ubicación.
- **RN-07 (alertas)**:
  - Stock bajo: existencia total del artículo en la ubicación < `MinQty`.
  - Por caducar: lotes con existencia > 0 que vencen en ≤ N días (`AppSetting`, default 3).

### Producción

- **RN-10**: Solo hay una receta activa por artículo. Editar una receta que ya fue usada en una OP crea una **nueva versión**. La OP conserva la versión con la que se creó.
- **RN-11**: Consumo teórico por línea = `PlannedQty / YieldQty × línea.Quantity × (1 + WastePct/100)`.
- **RN-12 (completar OP)**: todo ocurre en **una sola transacción**.
  1. Se registran las salidas de componentes por el consumo **real** capturado (por defecto igual al teórico), con asignación de lotes FEFO.
  2. Se registra la entrada del producto por `ProducedQty`, con un lote nuevo. El número de lote es el folio de la OP y la caducidad = fecha de completado + `ShelfLifeDays`.
  3. Costo unitario del producto = costo total consumido / `ProducedQty`.
- **RN-13**: La merma de producción es la diferencia entre el consumo real y el teórico **calculado sobre `ProducedQty`** (acordado en B-11: si se produce menos de lo planeado, la merma se mide contra lo que realmente salió). El consumo real por defecto es ese teórico. Se reporta; no genera movimientos extra.
- **RN-14**: Solo se producen en ubicaciones Factory o Commissary. `ProducedQty` debe ser > 0.

### Logística

- **RN-20**: La sucursal crea el pedido y lo envía. El origen lo aprueba y puede ajustar `ApprovedQty`. Un pedido aprobado genera uno o más traspasos en `Draft` con lo aprobado.
  - Acordado en B-15: se genera **un** traspaso con las líneas aprobadas (> 0); `ApprovedQty` va de 0 a lo solicitado y aprobar todo en 0 no se permite (se rechaza). No se reserva existencia.
  - El origen puede editar ese traspaso antes de despacharlo, sin cambiar el destino, sin artículos ajenos al pedido y sin pasar de lo aprobado.
  - Cancelar el traspaso en borrador de un pedido **cancela el pedido**. El pedido en sí solo se cancela en `Draft` o `Submitted`.
  - Sugerido por mín/máx: proyectado = existencia + en tránsito hacia la sucursal + pedidos enviados o aprobados sin despachar; si proyectado ≤ mínimo, se sugiere máximo − proyectado.
- **RN-21 (despacho)**: al despachar se registra `TransferOut` en el origen (FEFO si no se eligieron lotes). El traspaso queda "en tránsito" hasta su recepción.
- **RN-22 (recepción)**:
  - El destino captura `ReceivedQty` por línea y se registra `TransferIn` por lo recibido.
  - Si `ReceivedQty < ShippedQty` se requiere `DiscrepancyReason`, y el traspaso queda `ReceivedWithDiscrepancies`. El faltante se considera pérdida en tránsito y se reporta.
  - `ReceivedQty > ShippedQty` no está permitido.
- **RN-23**: Un traspaso despachado no se edita ni se cancela.
- **RN-24**: Al recibir un traspaso ligado a un pedido, se actualizan `ShippedQty` y el estado del pedido (`PartiallyFulfilled` o `Fulfilled`).
  - Acordado en B-15: `ShippedQty` = lo **despachado** (la pérdida en tránsito queda en el traspaso, RN-22). `PartiallyFulfilled` es final: lo que falte se pide en un pedido nuevo.

### Compras

- **RN-30**: El precio de una línea de OC se sugiere desde `SupplierItem.Price` y es editable. Solo se agregan artículos del catálogo activo del proveedor (acordado en B-14).
- **RN-31 (aprobación)**:
  - Al enviar una OC, si `Subtotal ≥ umbral` (monto sin IVA; `AppSetting` configurable) pasa a `PendingApproval` y requiere el permiso `purchasing.po.approve`.
  - Si el total está por debajo del umbral, pasa directamente a `Approved`.
- **RN-32 (recepción)**:
  - Se permite recepción parcial. La sobre-recepción se permite hasta una tolerancia configurable (default 0%).
  - La OC pasa a `Received` cuando todas sus líneas están completas.
  - Una OC con saldo pendiente puede cerrarse manualmente (`Closed`, solo desde `PartiallyReceived`).
  - Una OC se cancela solo en `Draft`, `PendingApproval` o `Approved` y sin nada recibido (acordado en B-14).
- **RN-33**: La recepción registra `PurchaseReceipt` con costo base = `UnitPrice / PurchaseToBaseFactor` (sin IVA). Solo pueden recibirse OC en estado `Approved` o `PartiallyReceived`.
- **RN-34**: Las requisiciones aprobadas pueden convertirse en OC, agrupadas por proveedor sugerido.

### Seguridad

- **RN-40 (permisos y alcance)**:
  - Un rol es un conjunto de permisos. Un usuario tiene uno o más roles y una o más ubicaciones.
  - Solo ve y opera datos de sus ubicaciones asignadas, salvo que tenga el permiso `locations.all`.
- **RN-41**: Toda operación que mueva inventario o cambie el estado de un documento queda en `AuditLog`.
- **RN-42**: Un usuario inactivo no puede iniciar sesión. La cuenta se bloquea 15 minutos tras 5 intentos fallidos.

## 6. Catálogo de permisos

| Módulo | Códigos |
|---|---|
| Organización | `locations.view`, `locations.manage`, `locations.all` |
| Catálogos | `catalog.view`, `catalog.manage` |
| Inventario | `inventory.view`, `inventory.adjust`, `inventory.count`, `inventory.consumption` |
| Producción | `production.view`, `production.recipes.manage`, `production.orders.manage`, `production.orders.complete` |
| Logística | `logistics.view`, `logistics.orders.create`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.receive`, `logistics.transfers.special` (rutas distintas de fábrica/comisariato → sucursal) |
| Compras | `purchasing.view`, `purchasing.suppliers.manage`, `purchasing.requisitions.manage`, `purchasing.po.manage`, `purchasing.po.approve`, `purchasing.receive` |
| Seguridad | `security.users.manage`, `security.roles.manage`, `security.audit.view` |
| Configuración | `settings.manage` |

**Roles predefinidos** (semilla, editables):

| Rol | Permisos |
|---|---|
| Administrador | Todos |
| Gerente de operaciones | Todos los `*.view`, aprobaciones (`logistics.orders.approve`, `purchasing.po.approve`), `locations.all`, `security.audit.view`, `logistics.transfers.special` |
| Compras | `purchasing.*` excepto `purchasing.po.approve`; `catalog.view`; `inventory.view` |
| Jefe de producción | `production.*`, `inventory.view`, `inventory.count`, `catalog.view` |
| Almacén comisariato/fábrica | `inventory.*`, `logistics.view`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.special`, `purchasing.receive`, `purchasing.view` |
| Encargado de sucursal | `inventory.view`, `inventory.count`, `inventory.consumption`, `logistics.view`, `logistics.orders.create`, `logistics.transfers.receive` |
| Consulta | Todos los `*.view` |

## 7. Decisiones abiertas (estado al 2026-09-24)

1. **Salidas en sucursal.** ✅ Resuelto: captura diaria de consumo (`ConsumptionEntry`, solo en sucursales) más conteo físico; la frecuencia es operativa.
2. **Método de costeo.** ✅ Resuelto: promedio ponderado por ubicación (RN-04).
3. **Umbral de aprobación de OC.** ✅ Resuelto (B-14): configurable en `AppSetting` (`purchasing.po_approval_threshold`), comparado contra el subtotal sin IVA. Default `0` (toda OC requiere aprobación) hasta que se configure en `/settings`.
4. **Traspasos entre sucursales y entre fábrica y comisariato.** ✅ Resuelto: permitidos con el permiso `logistics.transfers.special` (también devoluciones a fábrica/comisariato).
5. **Control por lote.** ✅ Resuelto: por artículo (`TracksLots`); si está activo, toda entrada exige lote.
6. **Días de anticipación** para la alerta de caducidad. ✅ Resuelto (B-16): default 3 días (RN-07), editable por el administrador en `/settings`.
