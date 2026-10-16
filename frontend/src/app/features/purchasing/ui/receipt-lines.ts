import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { toDateOnly } from '../../../shared/forms/date-range';
import type { CreateGoodsReceiptRequest } from '../data-access/goods-receipts.api';
import type { PurchaseOrderDto, PurchaseOrderLine } from '../data-access/purchase-orders.api';
import { round4 } from '../../inventory/ui/lot-split';

export type ReceiptLotForm = FormGroup<{
  /** En la unidad de compra; 0 o vacío = no se recibe en esta entrega. */
  quantity: FormControl<number | null>;
  lotNumber: FormControl<string>;
  /** Opcional: un lote nuevo sin fecha la calcula con la vida útil; uno existente conserva la suya. */
  expirationDate: FormControl<Date | null>;
}>;

export type ReceiptLineForm = FormGroup<{ lots: FormArray<ReceiptLotForm> }>;

export interface ReceiptLotValue {
  quantity: number | null;
  lotNumber: string;
  expirationDate: Date | null;
}

/** Con lotes: el número de lote es obligatorio si se recibe algo. */
export function lotValidator(tracksLots: boolean): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const { quantity, lotNumber } = (control as ReceiptLotForm).getRawValue();
    return tracksLots && (quantity ?? 0) > 0 && !lotNumber.trim() ? { lotRequired: true } : null;
  };
}

export function createReceiptLot(
  tracksLots: boolean,
  value?: Partial<ReceiptLotValue>,
): ReceiptLotForm {
  return new FormGroup(
    {
      quantity: new FormControl<number | null>(value?.quantity ?? null),
      lotNumber: new FormControl(value?.lotNumber ?? '', { nonNullable: true }),
      expirationDate: new FormControl<Date | null>(value?.expirationDate ?? null),
    },
    { validators: lotValidator(tracksLots) },
  );
}

/** Líneas con saldo pendiente. */
export function pendingLines(order: PurchaseOrderDto): PurchaseOrderLine[] {
  return order.lines.filter((line) => line.pendingQty > 0);
}

/** Prellenada con lo pendiente en un solo lote. */
export function createReceiptLine(line: PurchaseOrderLine): ReceiptLineForm {
  return new FormGroup({
    lots: new FormArray([createReceiptLot(line.tracksLots, { quantity: line.pendingQty })]),
  });
}

export function receivedQty(lots: ReceiptLotValue[]): number {
  return round4(lots.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0));
}

/** RN-32: se avisa (no se bloquea) si se recibe más de lo pendiente; el backend aplica la tolerancia. */
export function exceedsPending(line: PurchaseOrderLine, lots: ReceiptLotValue[]): boolean {
  return receivedQty(lots) > line.pendingQty;
}

/** Al menos una línea con cantidad a recibir. */
export const anyReceivedValidator: ValidatorFn = (control: AbstractControl) => {
  const lines = (control as FormArray<ReceiptLineForm>).getRawValue();
  return lines.some((line) => receivedQty(line.lots) > 0) ? null : { nothingReceived: true };
};

/** Costo de lo recibido sin IVA (precio de la OC por unidad de compra). */
export function receiptAmount(
  lines: PurchaseOrderLine[],
  values: { lots: ReceiptLotValue[] }[],
): number {
  return lines.reduce(
    (sum, line, i) => sum + receivedQty(values[i]?.lots ?? []) * line.unitPrice,
    0,
  );
}

export function toReceiptRequest(
  order: PurchaseOrderDto,
  lines: PurchaseOrderLine[],
  values: { lots: ReceiptLotValue[] }[],
  supplierInvoiceNumber: string,
): CreateGoodsReceiptRequest {
  return {
    purchaseOrderId: order.id,
    poVersion: order.version,
    supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
    lines: lines.flatMap((line, i) =>
      (values[i]?.lots ?? [])
        .filter((lot) => (lot.quantity ?? 0) > 0)
        .map((lot) => ({
          poLineId: line.id,
          quantity: lot.quantity!,
          lotNumber: line.tracksLots ? lot.lotNumber.trim() : null,
          expirationDate: line.tracksLots ? toDateOnly(lot.expirationDate) : null,
        })),
    ),
  };
}
