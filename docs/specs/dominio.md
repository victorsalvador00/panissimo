# Especificación de dominio — SGO AR · Paníssimo

> Documento compartido por backend y frontend. Define el vocabulario, las entidades, los estados y las reglas de negocio. Si una regla de este documento contradice otro spec, **este documento manda**.
>
> **Origen.** Este sistema es un **fork del SGO AR** (franquicia de cafeterías, terminado con B-01..B-21 y F-01..F-21). Todo lo marcado **[Heredado]** ya existe en el código del fork y solo se ajusta en lo indicado. Lo marcado **[Nuevo]** o **[Cambia]** es trabajo de este proyecto.
>
> **Decisiones abiertas.** Las reglas que dependen de un dato que el cliente aún no confirma están en la sección 8 (`D-xx`). **No implementes una tarea que dependa de una decisión abierta sin confirmarla.**

## 1. Contexto

Paníssimo es una panadería con planta propia (Grupo Maroño, S.A. de C.V.):

- **1 planta** (fábrica) que compra materias primas, insumos y productos de uso general, produce y abastece. Trabaja en tres turnos (día, tarde y noche) con áreas de producción (cuadrillas).
- **N sucursales propias** (cantidad por confirmar, D-01) que reciben pan **a granel** (no empaquetado) mediante pedidos.
- **Clientes terceros** (cadenas comerciales, institucionales, etc.) que compran producto **empaquetado** mediante pedidos.
- La planta también **produce para stock** y produce **semiterminados** (masas, revueltos, rellenos, betunes) que se usan como ingrediente de los productos terminados.

Volumen de referencia (archivos del cliente, septiembre 2026): **284 SKU** de producto terminado activos en 9 áreas, **42 recetas** de masa/semiterminado, **~70 claves de materia prima**, **~1,000,000 de piezas al mes** (≈ 33,000 por día) y **~153 colaboradores**, de los cuales ~59 son de producción.

Flujo principal:

```
Proveedor ──OC──▶ Planta (materia prima, insumos, uso general)
                    │
Pedido de sucursal ─┤                    ┌─▶ Granel ──Traspaso──▶ Sucursal (recepción) ──▶ Consumo
Pedido de cliente ──┼─▶ Plan de producción ─▶ OP ─▶ Cierres parciales ─▶ Cierre final
Reposición a stock ─┤        ▲                 (semiterminados con su propia OP)
Importación Excel ──┘────────┘                     └─▶ Empaquetado ──Remisión──▶ Cliente tercero
```

**Fuera de alcance** (se presentan como ampliaciones a cotizar): facturación CFDI, cuentas por cobrar y cobranza, contabilidad, nómina, punto de venta e integración con él, app móvil nativa, operación offline, cálculo del forecast comercial (la Matriz Maestra sigue en Excel; el sistema **importa** sus órdenes sugeridas), balance de capacidad (hornos, turnos, horas-hombre) y plantilla/descansos.

## 2. Glosario (español → código)

El código (clases, tablas, endpoints) va en **inglés**; la interfaz de usuario va en **español**.

| Español | Código | Notas |
|---|---|---|
| Ubicación | `Location` | Planta o sucursal |
| Planta | `Factory` | `LocationType.Factory`. En la interfaz se llama **Planta** |
| Sucursal | `Branch` | `LocationType.Branch` |
| Artículo | `Item` | Materia prima, insumo, semiterminado o terminado |
| Materia prima | `RawMaterial` | Harina, azúcar, margarina… |
| Insumo / uso general **[Nuevo]** | `Supply` | Empaque, etiquetas, limpieza, papelería. Se compra y se consume; no tiene receta |
| Semiterminado | `Intermediate` | Masa, revuelto, relleno, betún. Se produce con OP y se usa en otra receta. **Se conserva el código `Intermediate` del SGO**; la interfaz dice "Semiterminado" |
| Producto terminado | `FinishedGood` | |
| Presentación **[Nuevo]** | `ItemPresentation` | `Bulk` (granel, para sucursales) o `Packaged` (empaquetado, para clientes) |
| Área de producción **[Nuevo]** | `ProductionArea` | Cuadrilla: Bizcocho Día, Pan de Sal Noche, Rondo… |
| Turno **[Nuevo]** | `Shift` | `Day`, `Afternoon`, `Night` (Día, Tarde, Noche) |
| Unidad de medida | `UnitOfMeasure` | |
| Lote | `Lot` | Con fecha de caducidad |
| Existencia | `StockBalance` | Por ubicación, artículo y lote |
| Movimiento / kardex | `InventoryMovement` | Inmutable |
| Conteo físico | `PhysicalCount` | |
| Ajuste de inventario | `InventoryAdjustment` | |
| Registro de consumo | `ConsumptionEntry` | Salidas de sucursal |
| Receta | `Recipe` | Lista de materiales versionada |
| Orden de producción (OP) | `ProductionOrder` | **[Cambia]** admite cierres parciales |
| Cierre de producción **[Nuevo]** | `ProductionClose` | Cada cierre parcial o final de una OP |
| Plan de producción **[Nuevo]** | `ProductionPlan` (consulta) | Demanda neta por producto y fecha |
| Importación de OP **[Nuevo]** | `ProductionOrderImport` | Lote de OP creadas desde un Excel |
| Pedido de sucursal | `BranchOrder` | |
| Traspaso | `Transfer` | Incluye datos de envío |
| Cliente **[Nuevo]** | `Customer` | Tercero que compra producto empaquetado |
| Punto de entrega **[Nuevo]** | `CustomerDeliveryPoint` | Tienda o almacén del cliente |
| Pedido de cliente **[Nuevo]** | `CustomerOrder` | |
| Remisión **[Nuevo]** | `CustomerShipment` | Salida de producto hacia un cliente |
| Proveedor | `Supplier` | |
| Requisición | `PurchaseRequisition` | |
| Orden de compra | `PurchaseOrder` | |
| Recepción de compra | `GoodsReceipt` | |
| Rol / Permiso | `Role` / `Permission` | |
| Foto de artículo | `ItemPhoto` | |
| Bitácora | `AuditLog` | |

## 3. Convenciones generales [Heredado]

- **Identificadores:** `Guid` v7 (`Guid.CreateVersion7()`).
- **Auditoría:** `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`.
- **Catálogos** usan `IsActive` (baja lógica); nunca se borran físicamente.
- **Documentos** tienen `Folio`, `Status`, `Notes` y **no se borran: se cancelan**.
- **Cantidades:** en la **unidad base** del artículo, `numeric(18,4)`. Los artículos cuya unidad base es `pza` solo admiten cantidades **enteras** en documentos de producción, pedidos y remisiones (RN-03b).
- **Costos:** MXN sin IVA, `numeric(18,4)`.
- **Fechas:** `timestamptz` en UTC. La "fecha de negocio" se calcula en `America/Mexico_City`.
- **Folios:** consecutivos por tipo, formato `PREFIJO-000001`.

| Documento | Prefijo |
|---|---|
| Requisición | `REQ` |
| Orden de compra | `OC` |
| Recepción de compra | `REC` |
| Orden de producción | `OP` |
| Cierre de producción **[Nuevo]** | `CP` |
| Importación de OP **[Nuevo]** | `IMP` |
| Pedido de sucursal | `PED` |
| Traspaso | `TR` |
| Pedido de cliente **[Nuevo]** | `PC` |
| Remisión **[Nuevo]** | `RM` |
| Ajuste | `AJ` |
| Conteo físico | `CF` |
| Registro de consumo | `CON` |

## 4. Entidades

### 4.1 Organización [Cambia]

**Location**
- `Code` (único, ej. `PLANTA`, `SUC-01`), `Name`, `Type` (`Branch | Factory`), `Address`, `IsActive`.
- El valor `Commissary` del SGO se conserva en el enum para no romper migraciones, pero **no se siembra ni se ofrece en la interfaz**.
- Derivados: `CanProduce` = Factory. `CanPurchase` = Factory. `CanSupplyBranches` = Factory. `CanSellToCustomers` = Factory.

**ProductionArea [Nuevo]**: `Code` (único), `Name`, `SortOrder`, `IsActive`. Semilla (editable): Bizcocho Día, Pan de Sal Día, Pan de Sal Noche, Rondo, Repostería, Panquelería, Pastelería, Congelado, Bocadillos, Masas, Empaque.

**Shift [Nuevo]** (enum, no catálogo): `Day` (Día), `Afternoon` (Tarde), `Night` (Noche).

### 4.2 Catálogos [Cambia]

**UnitOfMeasure**, **ItemCategory**, **ItemLocationSetting** (mín/máx por ubicación) e **ItemPhoto**: sin cambios.

**Item** (campos del SGO más los nuevos):
- `Sku` (único), `Name`, `Type` (`RawMaterial | Supply | Intermediate | FinishedGood`), `CategoryId`.
- `BaseUomId`, `PurchaseUomId` + `PurchaseToBaseFactor`.
- `TracksLots`, `ShelfLifeDays`, `StorageCondition` (`Ambient | Refrigerated | Frozen`), `TaxRate`, `IsActive`.
- **[Nuevo]** `Presentation` (`Bulk | Packaged`): obligatorio para `FinishedGood`, nulo para los demás tipos.
- **[Nuevo]** `BulkItemId` (opcional, solo si `Presentation = Packaged`): el producto a granel del que es versión empaquetada (ej. `TRENZA EMBOLSADA` → `TRENZA`). Solo se usa para reportes y para mostrar equivalencias; no mueve inventario.
- **[Nuevo]** `UnitsPerPackage` (opcional, `Packaged`): piezas por paquete (informativo).
- **[Nuevo]** `ProductionAreaId` (opcional; para `Intermediate` y `FinishedGood`): área por defecto de sus OP.
- **[Nuevo]** `ProductionMultiple` (`numeric(18,4)`, default 1, > 0): las cantidades sugeridas del plan se redondean hacia arriba a este múltiplo (columna "Múltiplo OP" de la Matriz Maestra).
- **[Nuevo]** `UnitWeightGrams` (opcional): gramaje objetivo por pieza. Informativo en esta versión (base para mermas en kg, ampliación futura).

### 4.3 Inventario [Heredado]

`Lot`, `StockBalance`, `ItemLocationCost`, `PhysicalCount`, `InventoryAdjustment` y `ConsumptionEntry` sin cambios respecto al SGO.

**InventoryMovement.Type** agrega **[Nuevo]** `CustomerShipment` (salida por remisión a cliente). Lista completa: `PurchaseReceipt`, `ProductionConsumption`, `ProductionOutput`, `TransferOut`, `TransferIn`, `Adjustment`, `Waste`, `PhysicalCountAdjustment`, `Consumption`, `CustomerShipment`.

### 4.4 Producción [Cambia]

**Recipe** [Heredado]: `OutputItemId`, `Version`, `IsActive`, `YieldQty`, `Notes`; líneas `ComponentItemId`, `Quantity`, `WastePct`.
- **[Cambia]** Los componentes pueden ser `RawMaterial`, `Supply` (ej. bolsa y etiqueta en un producto empaquetado) o `Intermediate`. Un `FinishedGood` no puede ser componente (D-04).

**ProductionOrder** [Cambia]
- Encabezado: `Folio`, `LocationId` (Factory), `RecipeId` (versión exacta), `OutputItemId`, `PlannedQty`, `ScheduledDate`, `Notes`.
- **[Nuevo]** `ProductionAreaId` (default: el del artículo), `Shift` (opcional).
- **[Nuevo]** `Source` (`Manual | Plan | Import`) e `ImportId` (opcional).
- `Status`: `Draft → Released → InProgress → Completed`; además `Cancelled` (ver RN-60).
- **[Cambia]** Acumulados (se recalculan con cada cierre): `ProducedQty` (suma de los cierres), `TotalCost`, `UnitCost` (= `TotalCost / ProducedQty`).
- **[Nuevo]** Cierre final: `CompletedAt`, `CompletedBy`, `ShortfallReason` (`MissingMaterial | MissingStaff | EquipmentFailure | DemandChange | Other`, requerido si `ProducedQty < PlannedQty`), `ShortfallNotes`.
- **[Cambia]** `OutputLotId` deja de existir en el encabezado: cada cierre tiene su lote.
- Líneas (`ProductionOrderLine`): `ComponentItemId`, `TheoreticalQty` (para lo planeado, RN-11), **[Cambia]** `ActualQty` acumulada de todos los cierres.

**ProductionClose [Nuevo]** (cada cierre parcial o final)
- `Folio` (`CP-…`), `ProductionOrderId`, `Sequence` (1, 2, 3… dentro de la OP), `Kind` (`Partial | Final`), `BusinessDate`, `Shift` (opcional), `ProducedQty` (≥ 0), `OutputLotId` (nulo si `ProducedQty = 0`), `TotalCost`, `UnitCost`, `ClosedAt`, `ClosedBy`, `Notes`.
- Líneas (`ProductionCloseLine`): `ComponentItemId`, `TheoreticalQty` (para lo producido en este cierre), `ActualQty`, `UnitCost`, `WasteQty` (= real − teórico).
- Lotes consumidos (`ProductionCloseLineLot`): `LineId`, `LotId`, `Quantity`.
- **Reemplaza** a `ProductionOrderLineLot` del SGO (migración de datos: no aplica, la base de Paníssimo arranca vacía).

**ProductionOrderDemand [Nuevo]** (liga informativa OP ↔ pedido)
- `ProductionOrderId`, `DemandType` (`BranchOrderLine | CustomerOrderLine`), `DemandLineId`, `Quantity`.

**ProductionOrderImport [Nuevo]**
- `Folio` (`IMP-…`), `FileName`, `FileSha256`, `RowCount`, `OrderCount`, `ReleasedOnImport` (bool), `CreatedAt`, `CreatedBy`.

### 4.5 Logística [Heredado]

`BranchOrder` y `Transfer` sin cambios. Los pedidos de sucursal se surten desde la Planta.
- **[Cambia]** Una sucursal puede pedir `FinishedGood` a granel y `Supply`. No puede pedir `Packaged` ni `Intermediate` (D-05).

### 4.6 Ventas a terceros [Nuevo]

**Customer**: `Code` (único, ej. `CLI-001`), `Name` (razón social o nombre comercial), `TaxId` (RFC, opcional; mismas reglas de formato que el proveedor), `ContactName`, `Phone`, `Email`, `Notes`, `IsActive`.

**CustomerDeliveryPoint**: `CustomerId`, `Name`, `Address`, `IsActive`. Un cliente tiene cero o más puntos de entrega.

**CustomerItem** (opcional, D-06): `CustomerId`, `ItemId`, `CustomerSku`, `Price` (sin IVA, informativo), `IsActive`.

**CustomerOrder** (pedido de cliente)
- Encabezado: `Folio` (`PC-…`), `CustomerId`, `DeliveryPointId` (opcional), `SupplyingLocationId` (Factory), `RequiredDate`, `CustomerReference` (número de orden de compra del cliente, opcional), `Notes`.
- `Status`: `Draft → Confirmed → PartiallyShipped → Shipped`; además `Closed` (cerrado con saldo) y `Cancelled`.
- Líneas: `ItemId`, `Quantity`, `ShippedQty`, `UnitPrice` (opcional, D-06).

**CustomerShipment** (remisión)
- Encabezado: `Folio` (`RM-…`), `CustomerOrderId`, `CustomerId`, `DeliveryPointId`, `FromLocationId` (Factory).
- `Status`: `Draft → Dispatched`; además `Cancelled` (solo en `Draft`).
- Envío: `VehicleDescription`, `DriverName`, `DispatchedAt`, `DispatchedBy`, `ReceivedByName` (quién firma de recibido, opcional).
- Líneas: `CustomerOrderLineId`, `ItemId`, `Quantity`, `UnitCost` (al despachar). Lotes despachados: `CustomerShipmentLineLot` (`LineId`, `LotId`, `Quantity`).

### 4.7 Compras [Heredado]

`Supplier`, `SupplierItem`, `PurchaseRequisition`, `PurchaseOrder` y `GoodsReceipt` sin cambios. **[Cambia]** se compran artículos `RawMaterial` y `Supply`; solo la Planta compra.

### 4.8 Seguridad y auditoría [Heredado]

`User`, `UserLocation`, `Role`, `RolePermission`, `AuditLog`, `AppSetting` sin cambios.

**AppSetting nuevos:**

| Clave | Tipo | Default | Uso |
|---|---|---|---|
| `production.overrun_tolerance_pct` | decimal 0–100 | 10 | Sobreproducción permitida sobre lo planeado (RN-63) |
| `production.plan_default_days` | entero 1–14 | 1 | Horizonte por omisión del plan de producción (RN-70) |
| `sales.shipment_tolerance_pct` | decimal 0–100 | 0 | Remisión por encima de lo pedido (RN-82) |

## 5. Reglas de negocio

### Inventario [Heredado]

- **RN-01**: La existencia **solo** cambia mediante `InventoryMovement`. Los movimientos son inmutables; para corregir uno se registra un ajuste o el movimiento inverso.
- **RN-02**: No se permite existencia negativa por `(ubicación, artículo, lote)`. Si una operación la provocaría, se rechaza completa con el detalle de faltantes.
- **RN-03**: Todas las cantidades se convierten a unidad base antes de registrar (`BaseQty = PurchaseQty × PurchaseToBaseFactor`), con redondeo a 4 decimales.
  - **RN-03b [Nuevo]**: si la unidad base del artículo es `pza`, las cantidades de OP, cierres, pedidos de sucursal, pedidos de cliente y remisiones deben ser enteras. Los ajustes y conteos también.
- **RN-04 (costo promedio ponderado por ubicación)**: igual que el SGO.
- **RN-05 (lotes y FEFO)**: igual que el SGO. Un lote vencido no se despacha (traspaso o remisión) ni se consume en producción.
- **RN-06 (conteo físico)** y **RN-07 (alertas)**: igual que el SGO.

### Producción [Heredado con cambios]

- **RN-10**: Solo hay una receta activa por artículo. Editar una receta usada en una OP crea una nueva versión; la OP conserva la suya.
- **RN-11**: Consumo teórico por componente para una cantidad `Q` = `Q / YieldQty × línea.Quantity × (1 + WastePct/100)`. Se usa con `PlannedQty` en la OP y con el `ProducedQty` de cada cierre.
- **RN-12 [Cambia]**: completar una OP ya no es una sola operación; se hace con cierres (RN-61 a RN-65).
- **RN-13 [Cambia]**: la merma de producción de un cierre = consumo real − teórico calculado sobre el `ProducedQty` de **ese cierre**. La merma de la OP es la suma de sus cierres. Se reporta; no genera movimientos extra.
- **RN-14 [Cambia]**: solo se produce en la Planta. El producto de una OP es `Intermediate` o `FinishedGood` con receta activa.

### Órdenes de producción con cierre parcial y final [Nuevo]

- **RN-60 (estados)**:
  - `Draft`: se edita (producto, cantidad, fecha, área, turno, notas) y se puede cancelar.
  - `Released`: liberada para producir. Se puede cancelar mientras no tenga cierres. No se edita.
  - `InProgress`: tiene al menos un cierre parcial. **No se puede cancelar**; se termina con el cierre final.
  - `Completed`: tiene cierre final. Es final.
  - `Cancelled`: final.
- **RN-61 (cierre parcial)**: solo en `Released` o `InProgress`. Requiere `ProducedQty > 0`. En **una sola transacción**:
  1. Registra la salida de componentes por el consumo **real** capturado (por defecto, el teórico de RN-11 para lo producido en este cierre), con asignación FEFO o los lotes que elija el usuario.
  2. Registra la entrada del producto por `ProducedQty` con un lote nuevo (RN-62).
  3. Calcula `TotalCost` y `UnitCost` del cierre (RN-64) y actualiza los acumulados de la OP.
  4. La OP pasa a `InProgress`.
- **RN-62 (lote por cierre)**: cada cierre con `ProducedQty > 0` crea su propio lote. Número de lote = `{folio de la OP}-{Sequence en 2 dígitos}` (ej. `OP-000123-01`). Caducidad = fecha de negocio del cierre + `ShelfLifeDays` del producto (sin caducidad si el producto no la tiene). Si el producto no maneja lotes (`TracksLots = false`), la entrada se registra sin lote.
- **RN-63 (cierre final)**: solo en `Released` o `InProgress`. Captura lo producido en este último tramo (`ProducedQty ≥ 0`) y su consumo real, con la misma transacción de RN-61, y además:
  - Si la OP no tiene cierres previos, `ProducedQty` del cierre final debe ser > 0. Una OP sin nada producido se cancela, no se cierra.
  - Si el total producido (`Σ ProducedQty`) es menor que `PlannedQty`, se requiere `ShortfallReason` (y `ShortfallNotes` si es `Other`).
  - El total producido no puede superar `PlannedQty × (1 + production.overrun_tolerance_pct / 100)`. La misma validación aplica a cada cierre parcial (422 `production_overrun`).
  - La OP pasa a `Completed` y ya no admite cierres.
  - Un cierre final con `ProducedQty = 0` no mueve inventario: solo cierra la OP.
- **RN-64 (costos del cierre)**: `TotalCost` del cierre = Σ (consumo real × costo promedio vigente de cada componente en la Planta, RN-04). `UnitCost` = `TotalCost / ProducedQty`. La entrada del producto se registra a ese costo unitario. La OP acumula `TotalCost` y calcula su `UnitCost` promedio.
- **RN-65 (sin reversa)**: un cierre registrado no se edita ni se cancela. Un error se corrige con un ajuste de inventario (motivo Corrección) sobre el lote del cierre y los componentes.
- **RN-66 (concurrencia)**: los cierres de una misma OP se serializan (bloqueo de la fila de la OP y `version`). Dos cierres simultáneos de la misma OP → uno se registra y el otro recibe 409 `concurrency`.
- **RN-67 (semiterminados)**: la explosión es de **un nivel** (igual que el SGO). Si a una OP le falta un semiterminado, se produce con su propia OP. El plan de producción (RN-70) y el requerimiento de materia prima (RN-50) lo marcan "por producir" y permiten generar esa OP (D-04).

### Plan de producción y pedidos que alimentan OP [Nuevo]

- **RN-70 (demanda neta por producto y fecha)**: para la Planta y un rango de fechas (hoy + `production.plan_default_days` por omisión), por cada `FinishedGood` e `Intermediate`:
  - **Demanda** =
    - pedidos de sucursal `Submitted` o `Approved` cuyo `RequiredDate` está en el rango (en `Submitted` cuenta lo solicitado; en `Approved`, lo aprobado − lo despachado),
    - más pedidos de cliente `Confirmed` o `PartiallyShipped` en el rango (cantidad − lo remisionado),
    - más **reposición a stock**: si la existencia proyectada de la Planta queda por debajo de su `MinQty`, se suma hasta `MaxQty`,
    - más, para `Intermediate`, el requerimiento de las OP abiertas del rango que lo usan (RN-11 sobre lo pendiente de producir).
  - **Cubierto** = existencia utilizable en la Planta (sin lotes vencidos) + pendiente de producir de OP `Draft`, `Released` o `InProgress` del mismo producto con `ScheduledDate` en o antes del fin del rango (`PlannedQty − ProducedQty`, nunca negativo).
  - **Por producir** = demanda − cubierto, nunca negativo, redondeado **hacia arriba** al `ProductionMultiple` del producto (y a entero si es `pza`).
  - **Por fecha, acumulado:** el cálculo se hace por producto y día del rango, en orden. La existencia cubre primero las fechas más próximas; una OP pendiente cubre a partir de su `ScheduledDate` (las de fechas anteriores al rango cuentan desde el primer día); lo sugerido para un día cuenta como cubierto para los siguientes. La reposición a stock se asigna al primer día del rango.
  - El plan es una consulta: no guarda nada ni reserva existencia.
- **RN-71 (generar OP desde el plan)**: el usuario elige renglones del plan y ajusta la cantidad (> 0). Se crea **una OP en `Draft` por producto, fecha y área**, con `Source = Plan`, la receta activa del producto y una liga `ProductionOrderDemand` por cada línea de pedido que originó la demanda (repartiendo la cantidad en orden de `RequiredDate`). Todo o nada: un producto sin receta activa bloquea la generación (422 `recipe_not_found`).
- **RN-72 (las ligas son informativas)**: `ProductionOrderDemand` sirve para ver qué pedidos atiende una OP y el avance. **No reserva** el producto: los pedidos se surten desde la existencia de la Planta con traspasos (sucursales) o remisiones (clientes). Cancelar una OP no cambia el pedido.
- **RN-73 (OP manual)**: también se puede crear una OP sin pedido (para stock o por decisión de producción), con `Source = Manual`.

### Importación de OP desde Excel [Nuevo]

- **RN-90 (formato)**: archivo `.xlsx` con una hoja llamada `OP` (si no existe, la primera hoja) y encabezados en la fila 1. Columnas (en cualquier orden, sin distinguir mayúsculas ni acentos):

  | Columna | Obligatoria | Regla |
  |---|---|---|
  | `fecha` | Sí | Fecha programada `dd/mm/aaaa` o fecha de Excel. No puede ser pasada |
  | `sku` | Sí | Artículo activo `Intermediate` o `FinishedGood` con receta activa |
  | `cantidad` | Sí | > 0, hasta 4 decimales (entero si la unidad base es `pza`, RN-03b) |
  | `area` | No | Código o nombre de un área activa. Vacío = área del artículo |
  | `turno` | No | `Día`, `Tarde` o `Noche`. Vacío = sin turno |
  | `ubicacion` | No | Código de la ubicación. Vacío = la Planta. Debe ser Factory y estar en el alcance del usuario |
  | `notas` | No | Máximo 500 caracteres |

  - Columnas desconocidas se ignoran con aviso. Filas totalmente vacías se ignoran. Máximo **3,000 filas** con datos.
  - El sistema ofrece una **plantilla** descargable con esos encabezados y una hoja de instrucciones.
- **RN-91 (validación todo o nada)**: se validan todas las filas y se reportan **todos** los errores por fila y columna. Si hay un solo error, no se crea nada.
- **RN-92 (agrupación)**: las filas con el mismo `(fecha, sku, area, turno, ubicacion)` se **suman en una sola OP**. La vista previa muestra "N filas → M órdenes".
- **RN-93 (duplicados)**: son **avisos** que el usuario debe confirmar, no errores:
  - el archivo tiene el mismo SHA-256 que una importación anterior;
  - ya existe una OP no cancelada del mismo producto, fecha, área y turno.
- **RN-94 (resultado)**: se crea un `ProductionOrderImport` y las OP en `Draft` con `Source = Import` e `ImportId`. Si el usuario elige **"Liberar al importar"** y tiene `production.orders.manage`, se crean en `Released`. Todo en una transacción.
- **RN-95 (compatibilidad con la Matriz Maestra)**: la hoja `Plan_Semana_SKU` o `Plan_Diario_SKU` de la Matriz Maestra del cliente **no** se importa directamente (sus SKU son internos, `SKU0001…`, y su formato cambia). El cliente copia a la plantilla las columnas `fecha`, `sku` y `cantidad` (D-07).

### Logística [Heredado]

- **RN-20 a RN-24**: igual que el SGO (pedido de sucursal → aprobación → traspaso en `Draft` → despacho → recepción con discrepancias). El origen es siempre la Planta.

### Ventas a terceros [Nuevo]

- **RN-80 (pedido de cliente)**:
  - Lo captura el área comercial en `Draft` con cliente activo, punto de entrega opcional (debe ser del mismo cliente y estar activo), fecha requerida no pasada y al menos una línea.
  - Solo artículos `FinishedGood` activos con `Presentation = Packaged`, sin repetir (D-05).
  - **Confirmar** (`Draft → Confirmed`) lo vuelve demanda del plan (RN-70). Un pedido confirmado no se edita; si cambia, se cancela y se captura otro.
  - Cancelar: en `Draft` o `Confirmed` sin nada remisionado.
- **RN-81 (remisión)**:
  - Se crea desde un pedido `Confirmed` o `PartiallyShipped`, prellenada con el saldo de cada línea, en `Draft`. Puede haber varias remisiones por pedido (entregas parciales).
  - **Despachar** registra `CustomerShipment` en la Planta (salida, FEFO salvo que se elijan lotes; lotes vencidos rechazados) y guarda el costo promedio vigente como `UnitCost`. Valida RN-02 con faltantes (409 `insufficient_stock`).
  - Una remisión despachada no se edita ni se cancela (RN-65 aplica igual: se corrige con ajuste).
- **RN-82 (avance del pedido)**: al despachar, se suma a `ShippedQty`. Lo remisionado por línea no puede exceder lo pedido × (1 + `sales.shipment_tolerance_pct` / 100). Si todas las líneas están completas, el pedido pasa a `Shipped`; si no, a `PartiallyShipped`. Un pedido `PartiallyShipped` puede **cerrarse con saldo** (`Closed`, con motivo).
- **RN-83 (alcance)**: la remisión es un documento de entrega. **No** es factura ni genera cuenta por cobrar; los precios, si se capturan, son informativos (D-06). Las devoluciones de cliente se registran como entrada con un ajuste (motivo Corrección) en esta versión (D-08).

### Compras [Heredado]

- **RN-30 a RN-34**: igual que el SGO. Se compran `RawMaterial` y `Supply`.

### Planeación y análisis [Heredado]

- **RN-50 (requerimiento de materia prima)**: igual que el SGO, sobre las OP `Draft`, `Released` **e `InProgress`** (lo pendiente de producir). Los `Supply` que son componente de receta (empaques) también se calculan y se compran.
- **RN-51 (costo de receta)** y **RN-52 (análisis de consumo)**: igual que el SGO. En RN-52 se agrega `CustomerShipment` a las salidas analizadas.

### Seguridad [Heredado]

- **RN-40 a RN-42**: igual que el SGO.

## 6. Catálogo de permisos

| Módulo | Códigos |
|---|---|
| Organización | `locations.view`, `locations.manage`, `locations.all` |
| Catálogos | `catalog.view`, `catalog.manage` |
| Inventario | `inventory.view`, `inventory.adjust`, `inventory.count`, `inventory.consumption` |
| Producción | `production.view`, `production.recipes.manage`, `production.orders.manage`, `production.orders.complete` (**[Cambia]** cierres parciales y final), **[Nuevo]** `production.orders.import`, **[Nuevo]** `production.areas.manage` |
| Logística | `logistics.view`, `logistics.orders.create`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.receive`, `logistics.transfers.special` |
| Ventas **[Nuevo]** | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `sales.shipments.dispatch` |
| Compras | `purchasing.view`, `purchasing.suppliers.manage`, `purchasing.requisitions.manage`, `purchasing.po.manage`, `purchasing.po.approve`, `purchasing.receive` |
| Seguridad | `security.users.manage`, `security.roles.manage`, `security.audit.view` |
| Configuración | `settings.manage` |

**Roles predefinidos** (semilla, editables). Los nombres siguen el organigrama del cliente:

| Rol | Permisos |
|---|---|
| Administrador | Todos |
| Dirección | Todos los `*.view`, `locations.all`, `logistics.orders.approve`, `purchasing.po.approve`, `security.audit.view`, `logistics.transfers.special` |
| Compras | `purchasing.*` excepto `purchasing.po.approve`; `catalog.view`; `inventory.view`; `production.view` |
| Jefe de producción | `production.*`, `inventory.view`, `inventory.count`, `inventory.adjust`, `catalog.view`, `sales.view`, `logistics.view` |
| Supervisor / líder de producción | `production.view`, `production.orders.complete`, `inventory.view`, `catalog.view` |
| Almacén planta | `inventory.*`, `logistics.view`, `logistics.orders.approve`, `logistics.transfers.dispatch`, `logistics.transfers.special`, `purchasing.view`, `purchasing.receive`, `sales.view`, `sales.shipments.dispatch` |
| Distribución | `logistics.view`, `logistics.transfers.dispatch`, `sales.view`, `sales.shipments.dispatch`, `inventory.view` |
| Ventas a clientes | `sales.view`, `sales.customers.manage`, `sales.orders.manage`, `inventory.view`, `production.view` |
| Encargado de sucursal | `inventory.view`, `inventory.count`, `inventory.consumption`, `logistics.view`, `logistics.orders.create`, `logistics.transfers.receive` |
| Consulta | Todos los `*.view` |

## 7. Decisiones heredadas del SGO (vigentes)

1. Salidas en sucursal: consumo diario más conteo físico (no hay POS).
2. Costeo: promedio ponderado por ubicación.
3. Umbral de aprobación de OC configurable contra el subtotal sin IVA (default 0).
4. Traspasos especiales con `logistics.transfers.special`.
5. Lotes por artículo (`TracksLots`).
6. Alerta de caducidad por omisión: 3 días (configurable).
7. Explosión de recetas de un nivel.

## 8. Decisiones abiertas (por confirmar con Paníssimo)

Cada decisión tiene una **propuesta**; las reglas de la sección 5 ya están escritas con ella. Si el cliente decide otra cosa, se actualiza la regla antes de implementar la tarea que la usa.

| ID | Pregunta | Propuesta | Afecta |
|---|---|---|---|
| D-01 | ¿Cuántas sucursales hay, con qué códigos y nombres? ¿Existe un CEDIS o almacén de producto terminado separado de la planta? | Una sola planta (`PLANTA`) que también es el almacén de terminado; sucursales cargadas desde un CSV de semilla, no fijas en el código | B-22 |
| D-02 | ¿Lote por cierre parcial o un solo lote por OP? | Un lote por cierre (RN-62): cada tramo se hornea en un momento distinto y su caducidad puede diferir | B-24 |
| D-03 | ¿Tolerancia de sobreproducción y motivos de faltante? | 10 % configurable; motivos: falta de insumo, falta de personal, falla de equipo, ajuste de demanda, otro | B-24 |
| D-04 | ¿Los semiterminados (masas, revueltos) se producen con su propia OP, o deben consumirse "en cascada" dentro de la OP del terminado? | Su propia OP (un nivel, igual que el SGO), con generación asistida desde el plan | B-25 |
| D-05 | ¿El empaquetado es un SKU distinto del granel (ej. `TRENZA` y `TRENZA EMBOLSADA`)? ¿Una sucursal puede pedir empaquetado o un cliente granel? | Sí, SKU distinto con su propia receta (semiterminado + bolsa + etiqueta). Sucursales solo granel e insumos; clientes solo empaquetado | B-23, B-27 |
| D-06 | ¿Se necesitan precios por cliente en el pedido y la remisión? | Opcionales e informativos (sin CFDI ni cobranza) | B-26 |
| D-07 | ¿El Excel de OP saldrá de la Matriz Maestra? ¿Con qué SKU (los del sistema o los internos `SKU0001`)? | Plantilla propia con los SKU del sistema; agregar a la Matriz una columna con el SKU del sistema para copiar directo | B-28 |
| D-08 | ¿Cómo se registran las devoluciones y rechazos de clientes? | Ajuste de entrada en esta versión; documento propio como ampliación | — |
| D-09 | ¿Quién confirma los pedidos de cliente y quién los surte? ¿Cuántos clientes y puntos de entrega hay? | Confirma el rol Ventas a clientes; despacha Almacén planta o Distribución | B-26, B-27 |
| D-10 | ¿Cuántos usuarios por rol? (para la semilla y la capacitación) | — | B-22 |
