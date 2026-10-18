import { ENUM_LABELS } from '../../../shared/pipes/labels';
import type { DiscrepancyReason, LocationLookup } from '../data-access/logistics-api';

/**
 * RN-25: without the special permission a transfer only goes from the plant to a branch; with it, also branch →
 * branch and branch → plant. Never to itself nor to a sub-warehouse (that is an internal voucher, RN-47).
 */
export function transferDestinations(
  origin: { id: string; type: string },
  locations: readonly LocationLookup[],
  special: boolean,
): LocationLookup[] {
  return locations.filter(
    (l) =>
      l.id !== origin.id &&
      l.type !== 'Warehouse' &&
      (special || (origin.type === 'Plant' && l.type === 'Branch')),
  );
}

/** RN-22: the received quantity goes from 0 to what was shipped; less than that needs a reason. */
export function receiptNeedsReason(received: number | null, shipped: number): boolean {
  return received !== null && received < shipped;
}

/** Sum of the chosen lots; rounded to the 4 decimals of the API to compare with the line. */
export function lotsTotal(quantities: readonly (number | null)[]): number {
  return Math.round(quantities.reduce<number>((sum, q) => sum + (q ?? 0), 0) * 10_000) / 10_000;
}

export const DISCREPANCY_REASONS = Object.entries(ENUM_LABELS.DiscrepancyReason).map(
  ([value, label]) => ({ value: value as DiscrepancyReason, label }),
);
