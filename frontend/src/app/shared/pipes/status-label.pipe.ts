import { Pipe, PipeTransform } from '@angular/core';
import type { ApiEnum } from '../../core/api/api-types';

/** Enums del backend que se muestran al usuario. */
export type EnumName =
  | 'AdjustmentReason'
  | 'AdjustmentStatus'
  | 'BranchOrderStatus'
  | 'ConsumptionStatus'
  | 'DiscrepancyReason'
  | 'ItemType'
  | 'LocationType'
  | 'MovementType'
  | 'PhysicalCountStatus'
  | 'ProductionOrderStatus'
  | 'PurchaseOrderStatus'
  | 'RequisitionStatus'
  | 'StorageCondition'
  | 'TransferStatus'
  | 'UomKind';

/**
 * Etiquetas en español de todos los enums (spec frontend §3: centralizadas aquí). El tipo exige
 * cubrir cada valor del OpenAPI: si el backend agrega uno, `npm run api:types` rompe la compilación.
 */
export const ENUM_LABELS: { [K in EnumName]: Record<ApiEnum<K>, string> } = {
  AdjustmentReason: {
    Correction: 'Corrección',
    Waste: 'Merma',
    Expired: 'Caducado',
    Damaged: 'Dañado',
    InternalUse: 'Uso interno',
  },
  AdjustmentStatus: { Posted: 'Registrado', Cancelled: 'Cancelado' },
  BranchOrderStatus: {
    Draft: 'Borrador',
    Submitted: 'Enviado',
    Approved: 'Aprobado',
    PartiallyFulfilled: 'Surtido parcial',
    Fulfilled: 'Surtido',
    Rejected: 'Rechazado',
    Cancelled: 'Cancelado',
  },
  ConsumptionStatus: { Posted: 'Registrado', Cancelled: 'Cancelado' },
  DiscrepancyReason: { Missing: 'Faltante', Damaged: 'Dañado', Other: 'Otro' },
  ItemType: {
    RawMaterial: 'Materia prima',
    Intermediate: 'Intermedio',
    FinishedGood: 'Producto terminado',
  },
  LocationType: { Branch: 'Sucursal', Factory: 'Fábrica', Commissary: 'Comisariato' },
  MovementType: {
    PurchaseReceipt: 'Recepción de compra',
    ProductionConsumption: 'Consumo de producción',
    ProductionOutput: 'Producción terminada',
    TransferOut: 'Salida por traspaso',
    TransferIn: 'Entrada por traspaso',
    Adjustment: 'Ajuste',
    Waste: 'Merma',
    PhysicalCountAdjustment: 'Ajuste por conteo',
    Consumption: 'Consumo',
  },
  PhysicalCountStatus: {
    Draft: 'Borrador',
    InProgress: 'En captura',
    Closed: 'Cerrado',
    Cancelled: 'Cancelado',
  },
  ProductionOrderStatus: {
    Draft: 'Borrador',
    Released: 'Liberada',
    Completed: 'Completada',
    Cancelled: 'Cancelada',
  },
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
  RequisitionStatus: {
    Draft: 'Borrador',
    Submitted: 'Enviada',
    Approved: 'Aprobada',
    Converted: 'Convertida a OC',
    Rejected: 'Rechazada',
    Cancelled: 'Cancelada',
  },
  StorageCondition: { Ambient: 'Ambiente', Refrigerated: 'Refrigerado', Frozen: 'Congelado' },
  TransferStatus: {
    Draft: 'Borrador',
    Dispatched: 'En tránsito',
    Received: 'Recibido',
    ReceivedWithDiscrepancies: 'Recibido con diferencias',
    Cancelled: 'Cancelado',
  },
  UomKind: { Mass: 'Masa', Volume: 'Volumen', Unit: 'Pieza' },
};

export function enumLabel(kind: EnumName, value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return (ENUM_LABELS[kind] as Record<string, string>)[value] ?? value;
}

/** `{{ order.status | statusLabel: 'PurchaseOrderStatus' }}` → "Por aprobar". */
@Pipe({ name: 'statusLabel' })
export class StatusLabelPipe implements PipeTransform {
  transform(value: string | null | undefined, kind: EnumName): string {
    return enumLabel(kind, value);
  }
}
