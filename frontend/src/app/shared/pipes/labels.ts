import type { ApiEnum, Schemas } from '../../core/api/api';

/** Every enum of the OpenAPI: schemas whose value is a union of string literals (a plain `string`, like a file, is not). */
export type EnumName = {
  [K in keyof Schemas]: string extends NonNullable<Schemas[K]>
    ? never
    : NonNullable<Schemas[K]> extends string
      ? K
      : never;
}[keyof Schemas];

/**
 * Spanish labels of every API enum (frontend §4.2). Typed against the OpenAPI: a new enum, or a new value, without its
 * label breaks the build after `npm run api:types`.
 */
export const ENUM_LABELS: { [K in EnumName]: Record<ApiEnum<K>, string> } = {
  AdjustmentReason: {
    Correction: 'Corrección',
    Waste: 'Merma',
    Expired: 'Caducidad',
    Damaged: 'Daño',
    InternalUse: 'Uso interno',
    CustomerReturn: 'Devolución de cliente',
  },
  AdjustmentStatus: { Posted: 'Aplicado' },
  BranchOrderTab: { All: 'Todos', ToApprove: 'Por aprobar' },
  BranchOrderStatus: {
    Draft: 'Borrador',
    Submitted: 'Enviado',
    Approved: 'Aprobado',
    PartiallyFulfilled: 'Surtido parcial',
    Fulfilled: 'Surtido',
    Rejected: 'Rechazado',
    Cancelled: 'Cancelado',
  },
  ConsumptionStatus: { Posted: 'Registrado' },
  CustomerOrderStatus: {
    Draft: 'Borrador',
    Confirmed: 'Confirmado',
    PartiallyShipped: 'Remisionado parcial',
    Shipped: 'Remisionado',
    Closed: 'Cerrado',
    Cancelled: 'Cancelado',
  },
  CustomerOrderTab: { All: 'Todos', ToFulfill: 'Por surtir', Drafts: 'Borradores' },
  CustomerShipmentTab: { All: 'Todas', ToDispatch: 'Por despachar' },
  CustomerShipmentStatus: { Draft: 'Borrador', Dispatched: 'Despachada', Cancelled: 'Cancelada' },
  DemandType: {
    BranchOrderLine: 'Pedido de sucursal',
    CustomerOrderLine: 'Pedido de cliente',
    ParentOrder: 'OP superior',
  },
  DiscrepancyReason: { Missing: 'Faltante', Damaged: 'Dañado', Other: 'Otro' },
  ItemPhotoSize: { Thumbnail: 'Miniatura', Full: 'Completa' },
  ItemPresentation: { Bulk: 'Granel', Packaged: 'Empaquetado' },
  ItemType: {
    RawMaterial: 'Materia prima',
    Supply: 'Insumo',
    SemiFinished: 'Semiterminado',
    FinishedGood: 'Producto terminado',
  },
  LocationType: { Plant: 'Planta', Branch: 'Sucursal', Warehouse: 'Subalmacén' },
  MovementType: {
    PurchaseReceipt: 'Recepción de compra',
    ProductionConsumption: 'Consumo de producción',
    ProductionOutput: 'Producción',
    TransferOut: 'Salida por traspaso',
    TransferIn: 'Entrada por traspaso',
    Adjustment: 'Ajuste',
    Waste: 'Merma',
    PhysicalCountAdjustment: 'Ajuste por conteo',
    Consumption: 'Consumo de sucursal',
    CustomerShipment: 'Remisión a cliente',
  },
  PhysicalCountStatus: {
    Draft: 'Borrador',
    InProgress: 'En proceso',
    Closed: 'Cerrado',
    Cancelled: 'Cancelado',
  },
  ProductionCloseKind: { Partial: 'Cierre parcial', Final: 'Cierre final' },
  ProductionOrderSource: { Manual: 'Manual', Plan: 'Plan', Import: 'Importación' },
  ProductionOrderStatus: {
    Draft: 'Borrador',
    Released: 'Liberada',
    InProgress: 'En proceso',
    Completed: 'Terminada',
    Cancelled: 'Cancelada',
  },
  ProductionOrderTab: {
    ToProduce: 'Por producir',
    InProgress: 'En proceso',
    Drafts: 'Borradores',
    All: 'Todas',
  },
  ProductionSummaryGroupBy: { Area: 'Área', Item: 'Producto', Day: 'Día' },
  PurchaseOrderTab: { All: 'Todas', ToApprove: 'Por aprobar', ToReceive: 'Por recibir' },
  PurchaseOrderStatus: {
    Draft: 'Borrador',
    PendingApproval: 'Por aprobar',
    Approved: 'Aprobada',
    PartiallyReceived: 'Recibida parcial',
    Received: 'Recibida',
    Rejected: 'Rechazada',
    Cancelled: 'Cancelada',
    Closed: 'Cerrada',
  },
  RequirementStatus: { ToBuy: 'Por comprar', ToProduce: 'Por producir', Covered: 'Cubierto' },
  RequisitionStatus: {
    Draft: 'Borrador',
    Submitted: 'Enviada',
    Approved: 'Aprobada',
    Converted: 'Convertida',
    Rejected: 'Rechazada',
    Cancelled: 'Cancelada',
  },
  SettingKind: { Decimal: 'Decimal', Integer: 'Entero' },
  Shift: { Day: 'Día', Afternoon: 'Tarde', Night: 'Noche' },
  ShortfallReason: {
    MissingMaterial: 'Falta de insumo',
    MissingStaff: 'Falta de personal',
    EquipmentFailure: 'Falla de equipo',
    DemandChange: 'Ajuste de demanda',
    Other: 'Otro',
  },
  StorageCondition: { Ambient: 'Ambiente', Refrigerated: 'Refrigerado', Frozen: 'Congelado' },
  TransferKind: { Standard: 'Traspaso', Internal: 'Vale interno' },
  TransferTab: {
    ToDispatch: 'Por despachar',
    InTransit: 'En tránsito',
    Received: 'Recibidos',
    All: 'Todos',
  },
  TransferStatus: {
    Draft: 'Borrador',
    Dispatched: 'En tránsito',
    Received: 'Recibido',
    ReceivedWithDiscrepancies: 'Recibido con diferencias',
    Cancelled: 'Cancelado',
  },
  UomKind: { Mass: 'Masa', Volume: 'Volumen', Unit: 'Pieza' },
};

/** The label of an enum value; unknown values are shown as they come so nothing disappears. */
export function enumLabel<K extends EnumName>(
  kind: K,
  value: ApiEnum<K> | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  const labels = ENUM_LABELS[kind] as Record<string, string>;
  return labels[value as string] ?? String(value);
}

export type StatusTone = 'grey' | 'blue' | 'yellow' | 'green' | 'orange' | 'red';

/** Color of each document status (frontend §4.2); statuses not listed are grey. */
const STATUS_TONES: Record<string, StatusTone> = {
  Draft: 'grey',
  Submitted: 'blue',
  Released: 'blue',
  InProgress: 'blue',
  Confirmed: 'blue',
  PendingApproval: 'yellow',
  Dispatched: 'yellow',
  PartiallyReceived: 'yellow',
  PartiallyFulfilled: 'yellow',
  PartiallyShipped: 'yellow',
  Approved: 'green',
  Received: 'green',
  Completed: 'green',
  Fulfilled: 'green',
  Shipped: 'green',
  Closed: 'green',
  Posted: 'green',
  Converted: 'green',
  ReceivedWithDiscrepancies: 'orange',
  Cancelled: 'red',
  Rejected: 'red',
};

export function statusTone(status: string | null | undefined): StatusTone {
  return (status && STATUS_TONES[status]) || 'grey';
}
