import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { toDateOnly } from '../../../shared/forms/date-range';
import type { CreateConsumptionRequest } from '../data-access/consumptions.api';

export type ConsumptionLine = FormGroup<{
  item: FormControl<ItemOption>;
  quantity: FormControl<number | null>;
  /** Artículos con lote: lote elegido o `null` = FEFO automático. */
  lotId: FormControl<string | null>;
}>;

export interface ConsumptionLineValue {
  item: ItemOption;
  quantity: number | null;
  lotId: string | null;
}

export function createConsumptionLine(item: ItemOption, quantity: number): ConsumptionLine {
  return new FormGroup({
    item: new FormControl(item, { nonNullable: true }),
    quantity: new FormControl<number | null>(quantity, Validators.required),
    lotId: new FormControl<string | null>(null),
  });
}

/**
 * Línea a la que se suma una captura rápida: el mismo artículo sin lote elegido (FEFO). Si ya se
 * eligió un lote en esa línea, la captura nueva va en otra línea. `-1` = agregar línea.
 */
export function mergeTarget(lines: ConsumptionLineValue[], item: ItemOption): number {
  return lines.findIndex((line) => line.item.id === item.id && line.lotId === null);
}

/** Suma sin arrastrar errores de punto flotante (máximo 4 decimales, como el backend). */
export function addQty(a: number | null, b: number): number {
  return Math.round(((a ?? 0) + b) * 10_000) / 10_000;
}

export function toConsumptionRequest(value: {
  locationId: string;
  businessDate: Date | null;
  notes: string;
  lines: ConsumptionLineValue[];
}): CreateConsumptionRequest {
  return {
    locationId: value.locationId,
    businessDate: toDateOnly(value.businessDate),
    notes: value.notes.trim() || null,
    lines: value.lines.map((line) => ({
      itemId: line.item.id,
      lotId: line.item.tracksLots ? line.lotId : null,
      quantity: line.quantity ?? 0,
    })),
  };
}
