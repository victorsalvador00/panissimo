import {
  AbstractControl,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { toDateOnly } from '../../../shared/forms/date-range';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import type {
  AdjustmentLineRequest,
  AdjustmentReason,
  CreateAdjustmentRequest,
} from '../data-access/adjustments.api';

export type AdjustmentLine = FormGroup<{
  item: FormControl<ItemOption | null>;
  quantity: FormControl<number | null>;
  /** Salidas de artículos con lote: lote elegido o `null` = FEFO automático. */
  lotId: FormControl<string | null>;
  /** Entradas (corrección positiva) de artículos con lote. */
  lotNumber: FormControl<string>;
  expirationDate: FormControl<Date | null>;
  /** Entradas: costo unitario opcional (sin él se usa el costo promedio). */
  unitCost: FormControl<number | null>;
}>;

export interface AdjustmentLineValue {
  item: ItemOption | null;
  quantity: number | null;
  lotId: string | null;
  lotNumber: string;
  expirationDate: Date | null;
  unitCost: number | null;
}

/** Solo "Corrección" admite entradas; merma, caducado, dañado y uso interno son salidas (backend). */
export function isExitOnly(reason: AdjustmentReason): boolean {
  return reason !== 'Correction';
}

/** Cantidad con el signo que espera el backend: en motivos de salida se captura positiva. */
export function signedQuantity(reason: AdjustmentReason, quantity: number): number {
  return isExitOnly(reason) ? -Math.abs(quantity) : quantity;
}

/** La línea es una entrada (suma existencia). */
export function isEntry(reason: AdjustmentReason, quantity: number | null): boolean {
  return !isExitOnly(reason) && (quantity ?? 0) > 0;
}

/**
 * Validador de la línea: artículo; en entradas de artículos con lote, número de lote obligatorio;
 * costo unitario ≥ 0. Recibe el motivo actual para saber si la línea es entrada.
 */
export function adjustmentLineValidator(reason: () => AdjustmentReason): ValidatorFn {
  return (line: AbstractControl): ValidationErrors | null => {
    const value = line.value as Partial<AdjustmentLineValue>;
    if (!value.item || value.quantity === null || value.quantity === undefined) {
      return null;
    }
    if (isEntry(reason(), value.quantity) && value.item.tracksLots && !value.lotNumber?.trim()) {
      return { lotRequired: true };
    }
    if (value.unitCost !== null && value.unitCost !== undefined && value.unitCost < 0) {
      return { unitCostNegative: true };
    }
    return null;
  };
}

export function createAdjustmentLine(reason: () => AdjustmentReason): AdjustmentLine {
  return new FormGroup(
    {
      item: new FormControl<ItemOption | null>(null, Validators.required),
      quantity: new FormControl<number | null>(null, Validators.required),
      lotId: new FormControl<string | null>(null),
      lotNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
      expirationDate: new FormControl<Date | null>(null),
      unitCost: new FormControl<number | null>(null),
    },
    { validators: adjustmentLineValidator(reason) },
  );
}

export function toAdjustmentLine(
  reason: AdjustmentReason,
  line: AdjustmentLineValue,
): AdjustmentLineRequest {
  const quantity = signedQuantity(reason, line.quantity ?? 0);
  const entry = quantity > 0;
  const tracksLots = !!line.item?.tracksLots;
  return {
    itemId: line.item!.id,
    quantity,
    lotId: !entry && tracksLots ? line.lotId : null,
    lotNumber: entry && tracksLots ? line.lotNumber.trim() || null : null,
    expirationDate: entry && tracksLots ? toDateOnly(line.expirationDate) : null,
    unitCost: entry ? line.unitCost : null,
    notes: null,
  };
}

export function toAdjustmentRequest(value: {
  locationId: string;
  reason: AdjustmentReason;
  notes: string;
  lines: AdjustmentLineValue[];
}): CreateAdjustmentRequest {
  return {
    locationId: value.locationId,
    reason: value.reason,
    notes: value.notes.trim() || null,
    lines: value.lines.map((line) => toAdjustmentLine(value.reason, line)),
  };
}
