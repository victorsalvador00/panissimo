import { FormControl, FormGroup, Validators } from '@angular/forms';
import type {
  PurchaseOrderLine,
  PurchaseOrderLineRequest,
  PurchaseOrderStatus,
} from '../data-access/purchase-orders.api';
import type { SupplierItemDto } from '../data-access/suppliers.api';
import { priceValidator } from './supplier-validators';

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  'Draft',
  'PendingApproval',
  'Approved',
  'PartiallyReceived',
  'Received',
  'Rejected',
  'Cancelled',
  'Closed',
];

/** Pesos a 2 decimales, redondeo "lejos del cero" como `Money.Round` del backend. */
export function roundMoney(amount: number): number {
  return (Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON) * 100)) / 100;
}

// --- Líneas del editor ---

/** Artículo de la línea: del catálogo del proveedor (nueva) o de la OC guardada (edición). */
export interface PoItemOption {
  itemId: string;
  sku: string;
  name: string;
  purchaseUomCode: string;
  taxRate: number;
  /** Precio del catálogo del proveedor; `null` si no se conoce (línea guardada). */
  catalogPrice: number | null;
}

export function fromSupplierItem(row: SupplierItemDto): PoItemOption {
  return {
    itemId: row.itemId,
    sku: row.sku,
    name: row.name,
    purchaseUomCode: row.purchaseUomCode,
    taxRate: row.taxRate,
    catalogPrice: row.price,
  };
}

export function fromOrderLine(line: PurchaseOrderLine): PoItemOption {
  return {
    itemId: line.itemId,
    sku: line.sku,
    name: line.itemName,
    purchaseUomCode: line.purchaseUomCode,
    taxRate: line.taxRate,
    catalogPrice: null,
  };
}

export type PoLineForm = FormGroup<{
  item: FormControl<PoItemOption | null>;
  /** En la unidad de compra. */
  quantity: FormControl<number | null>;
  /** Por unidad de compra, sin IVA. */
  unitPrice: FormControl<number | null>;
  /** Línea guardada (conserva su liga con la requisición). */
  lineId: FormControl<string | null>;
}>;

export interface PoLineValue {
  item: PoItemOption | null;
  quantity: number | null;
  unitPrice: number | null;
  lineId: string | null;
}

export function createPoLine(value?: Partial<PoLineValue>): PoLineForm {
  return new FormGroup({
    item: new FormControl<PoItemOption | null>(value?.item ?? null, Validators.required),
    quantity: new FormControl<number | null>(value?.quantity ?? null, Validators.required),
    unitPrice: new FormControl<number | null>(value?.unitPrice ?? null, priceValidator),
    lineId: new FormControl<string | null>(value?.lineId ?? null),
  });
}

/** Importe e IVA de una línea (`PurchaseOrderLine.Subtotal`/`TaxAmount` del backend). */
export function lineAmounts(line: PoLineValue): { subtotal: number; tax: number } {
  const subtotal = roundMoney((line.quantity ?? 0) * (line.unitPrice ?? 0));
  return { subtotal, tax: roundMoney(subtotal * (line.item?.taxRate ?? 0)) };
}

export function orderTotals(lines: PoLineValue[]): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const amounts = lines.map(lineAmounts);
  const subtotal = roundMoney(amounts.reduce((sum, a) => sum + a.subtotal, 0));
  const tax = roundMoney(amounts.reduce((sum, a) => sum + a.tax, 0));
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

export function toOrderLines(lines: PoLineValue[]): PurchaseOrderLineRequest[] {
  return lines.map((line) => ({
    itemId: line.item!.itemId,
    quantity: line.quantity ?? 0,
    unitPrice: line.unitPrice,
    lineId: line.lineId,
  }));
}

export function taxLabel(rate: number): string {
  return rate ? `${Math.round(rate * 100)} %` : 'Exento';
}

// --- Acciones del detalle ---

export interface PurchaseOrderPermissions {
  manage: boolean;
  approve: boolean;
  receive: boolean;
}

export interface PurchaseOrderActions {
  edit: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  cancel: boolean;
  close: boolean;
  receive: boolean;
}

/** Acciones por estado (RN-31, RN-32); el backend vuelve a validar. */
export function purchaseOrderActions(
  status: PurchaseOrderStatus,
  can: PurchaseOrderPermissions,
): PurchaseOrderActions {
  const receivable = status === 'Approved' || status === 'PartiallyReceived';
  return {
    edit: status === 'Draft' && can.manage,
    submit: status === 'Draft' && can.manage,
    approve: status === 'PendingApproval' && can.approve,
    reject: status === 'PendingApproval' && can.approve,
    // Aprobada sin recepciones; con algo recibido pasa a parcialmente recibida y solo se cierra.
    cancel:
      (status === 'Draft' || status === 'PendingApproval' || status === 'Approved') && can.manage,
    close: status === 'PartiallyReceived' && can.manage,
    receive: receivable && can.receive,
  };
}
