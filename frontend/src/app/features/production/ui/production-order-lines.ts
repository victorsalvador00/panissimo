import { FormControl, FormGroup, FormRecord, Validators } from '@angular/forms';
import {
  chosenLots,
  createLotQty,
  LotQty,
  LotSplit,
  lotsSumValidator,
  round4,
} from '../../inventory/ui/lot-split';
import type {
  CompleteProductionOrderRequest,
  ProductionOrderStatus,
} from '../data-access/production-orders.api';
import type { ExplosionLine } from '../data-access/recipes.api';

/** RN-14: solo se produce en fábrica o comisariato. */
export const PRODUCTION_LOCATION_TYPES = ['Factory', 'Commissary'] as const;

export function isProductionLocation(type: string | null | undefined): boolean {
  return (PRODUCTION_LOCATION_TYPES as readonly string[]).includes(type ?? '');
}

export const ORDER_STATUSES: ProductionOrderStatus[] = [
  'Draft',
  'Released',
  'Completed',
  'Cancelled',
];

// --- Completar (RN-12, RN-13) ---

export type CompleteLine = FormGroup<{
  /** Prellenado con el teórico para la cantidad producida; `dirty` = el usuario lo cambió. */
  actualQty: FormControl<number | null>;
  lots: LotSplit;
}>;

export function createCompleteLine(): CompleteLine {
  const actualQty = new FormControl<number | null>(null, Validators.required);
  const lots: LotSplit = new FormGroup({
    manual: new FormControl(false, { nonNullable: true }),
    lots: new FormRecord<LotQty>({}),
  });
  // En la línea (no en `lots`) para revalidar también cuando cambia el consumo real.
  const sum = lotsSumValidator(() => actualQty.value ?? 0);
  return new FormGroup({ actualQty, lots }, { validators: () => sum(lots) });
}

/** Agrega al reparto los lotes disponibles del componente (una vez). */
export function addLots(line: CompleteLine, lotIds: string[]): void {
  const record = line.controls.lots.controls.lots;
  lotIds
    .filter((lotId) => !record.contains(lotId))
    .forEach((lotId) => record.addControl(lotId, createLotQty(lotId)));
}

/**
 * Lleva el teórico de la explosión a las líneas que el usuario no ha cambiado (decisión F-10: al
 * cambiar la cantidad producida se respeta lo ya capturado).
 */
export function prefillActuals(
  lines: Record<string, CompleteLine>,
  explosion: Pick<ExplosionLine, 'componentItemId' | 'theoreticalQty'>[],
): void {
  for (const component of explosion) {
    const control = lines[component.componentItemId]?.controls.actualQty;
    if (control && !control.dirty) {
      control.setValue(component.theoreticalQty);
    }
  }
}

export interface CompleteLineValue {
  actualQty: number | null;
  lots: {
    manual: boolean;
    lots: Record<string, { lotId: string; quantity: number | null }>;
  };
}

export function toCompleteRequest(
  version: number,
  producedQty: number,
  lines: Record<string, CompleteLineValue>,
): CompleteProductionOrderRequest {
  return {
    version,
    producedQty,
    lines: Object.entries(lines).map(([componentItemId, line]) => ({
      componentItemId,
      actualQty: line.actualQty ?? 0,
      lots: line.lots.manual ? chosenLots(line.lots.lots) : null,
    })),
  };
}

export interface CompletionLineSummary {
  componentItemId: string;
  theoreticalQty: number;
  actualQty: number;
  /** RN-13: real − teórico para la cantidad producida (negativo = se usó menos). */
  wasteQty: number;
  /** Con el costo promedio de la ubicación; `null` si no hay costo. */
  estimatedCost: number | null;
  wasteCost: number | null;
  /** Lo que se quiere consumir supera lo disponible. */
  short: boolean;
}

export interface CompletionSummary {
  lines: CompletionLineSummary[];
  estimatedTotalCost: number;
  estimatedUnitCost: number | null;
  wasteCost: number;
  shortLines: number;
}

/** Resumen de costo y merma antes de confirmar (estimado: el costo real sale de los lotes consumidos). */
export function completionSummary(
  explosion: ExplosionLine[],
  actuals: Record<string, number | null>,
  producedQty: number | null,
): CompletionSummary {
  const lines = explosion.map((component) => {
    const actualQty = actuals[component.componentItemId] ?? 0;
    const cost = component.averageCost;
    const wasteQty = round4(actualQty - component.theoreticalQty);
    return {
      componentItemId: component.componentItemId,
      theoreticalQty: component.theoreticalQty,
      actualQty,
      wasteQty,
      estimatedCost: cost === null ? null : round2(actualQty * cost),
      wasteCost: cost === null ? null : round2(wasteQty * cost),
      short: component.available !== null && actualQty > component.available,
    };
  });
  const estimatedTotalCost = round2(lines.reduce((sum, l) => sum + (l.estimatedCost ?? 0), 0));
  return {
    lines,
    estimatedTotalCost,
    estimatedUnitCost:
      producedQty && producedQty > 0 ? round4(estimatedTotalCost / producedQty) : null,
    wasteCost: round2(lines.reduce((sum, l) => sum + (l.wasteCost ?? 0), 0)),
    shortLines: lines.filter((l) => l.short).length,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
