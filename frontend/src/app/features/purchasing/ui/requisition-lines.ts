import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import type { RequisitionLineRequest, RequisitionStatus } from '../data-access/requisitions.api';
import type { ItemSupplierOffers } from '../data-access/suppliers.api';

/** Solo la fábrica y el comisariato compran; las sucursales piden al comisariato. */
export const PURCHASE_LOCATION_TYPES = ['Factory', 'Commissary'] as const;

export function isPurchaseLocation(type: string | null | undefined): boolean {
  return (PURCHASE_LOCATION_TYPES as readonly string[]).includes(type ?? '');
}

export const REQUISITION_STATUSES: RequisitionStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'Converted',
  'Rejected',
  'Cancelled',
];

// --- Líneas del borrador ---

export type RequisitionLineForm = FormGroup<{
  item: FormControl<ItemOption | null>;
  /** En la unidad de compra del artículo. */
  quantity: FormControl<number | null>;
  /** `null` = el preferido del artículo (lo asigna el backend al guardar). */
  supplierId: FormControl<string | null>;
}>;

export interface RequisitionLineValue {
  item: ItemOption | null;
  quantity: number | null;
  supplierId: string | null;
}

export function createRequisitionLine(value?: Partial<RequisitionLineValue>): RequisitionLineForm {
  return new FormGroup({
    item: new FormControl<ItemOption | null>(value?.item ?? null, Validators.required),
    quantity: new FormControl<number | null>(value?.quantity ?? null, Validators.required),
    supplierId: new FormControl<string | null>(value?.supplierId ?? null),
  });
}

export function toRequisitionLines(lines: RequisitionLineValue[]): RequisitionLineRequest[] {
  return lines.map((line) => ({
    itemId: line.item!.id,
    quantity: line.quantity ?? 0,
    suggestedSupplierId: line.supplierId,
  }));
}

/**
 * Proveedor que debe quedar en la línea al conocer sus ofertas: el elegido si todavía vende el
 * artículo; si no, el preferido; si no hay preferido, ninguno (el usuario elige).
 */
export function defaultSupplierId(
  current: string | null,
  offers: ItemSupplierOffers | undefined,
): string | null {
  if (!offers) {
    return current;
  }
  if (current && offers.offers.some((offer) => offer.supplierId === current)) {
    return current;
  }
  return offers.offers.find((offer) => offer.isPreferred)?.supplierId ?? null;
}

/** Precio sin IVA por unidad de compra del proveedor elegido. */
export function linePrice(
  line: RequisitionLineValue,
  offers: ItemSupplierOffers | undefined,
): number | null {
  return offers?.offers.find((offer) => offer.supplierId === line.supplierId)?.price ?? null;
}

/** Importe estimado (sin IVA) de las líneas con proveedor y cantidad. */
export function estimatedTotal(
  lines: RequisitionLineValue[],
  offers: ReadonlyMap<string, ItemSupplierOffers>,
): number {
  return lines.reduce((sum, line) => {
    const price = line.item ? linePrice(line, offers.get(line.item.id)) : null;
    return sum + (price ?? 0) * (line.quantity ?? 0);
  }, 0);
}

// --- Acciones del detalle ---

export interface RequisitionPermissions {
  manage: boolean;
  approve: boolean;
  convert: boolean;
}

export interface RequisitionActions {
  edit: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  convert: boolean;
  cancel: boolean;
}

/** Acciones de estado según estado y permisos (el backend vuelve a validar). */
export function requisitionActions(
  status: RequisitionStatus,
  can: RequisitionPermissions,
): RequisitionActions {
  return {
    edit: status === 'Draft' && can.manage,
    submit: status === 'Draft' && can.manage,
    approve: status === 'Submitted' && can.approve,
    reject: status === 'Submitted' && can.approve,
    convert: status === 'Approved' && can.convert,
    cancel: (status === 'Draft' || status === 'Submitted' || status === 'Approved') && can.manage,
  };
}
