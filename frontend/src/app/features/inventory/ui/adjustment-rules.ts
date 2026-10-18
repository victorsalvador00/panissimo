import type { ApiEnum } from '../../../core/api/api';
import { ENUM_LABELS } from '../../../shared/pipes/labels';

export type AdjustmentReason = ApiEnum<'AdjustmentReason'>;
export type Direction = 'in' | 'out';

export const ADJUSTMENT_REASONS = Object.entries(ENUM_LABELS.AdjustmentReason).map(
  ([value, label]) => ({ value: value as AdjustmentReason, label }),
);

/** Waste reasons of the part of a customer return that goes straight to waste (D-08). */
export const WASTE_REASONS = ADJUSTMENT_REASONS.filter((r) =>
  (['Waste', 'Expired', 'Damaged'] as AdjustmentReason[]).includes(r.value),
);

/**
 * Direction of the lines by reason (backend InventoryAdjustment): a correction may go either way, a customer return
 * only enters, the rest (waste, expired, damaged, internal use) only exit.
 */
export function reasonDirection(reason: AdjustmentReason): Direction | 'both' {
  if (reason === 'Correction') return 'both';
  if (reason === 'CustomerReturn') return 'in';
  return 'out';
}
