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
      l.type !== 'Factory' &&
      (special || (origin.type === 'Plant' && l.type === 'Branch')),
  );
}

/** RN-22, RN-116: what did not arrive is what was shipped and was neither received nor rejected (API precision). */
export function shortfall(
  received: number | null,
  rejected: number | null,
  shipped: number,
): number {
  // `|| 0` turns the -0 of a rounding below zero into 0.
  return Math.round((shipped - (received ?? 0) - (rejected ?? 0)) * 10_000) / 10_000 || 0;
}

/** RN-22: the received quantity goes from 0 to what was shipped; what did not arrive needs a reason. */
export function receiptNeedsReason(
  received: number | null,
  shipped: number,
  rejected: number | null = 0,
): boolean {
  return received !== null && shortfall(received, rejected, shipped) > 0;
}

/** RN-116: received plus rejected never exceed what was shipped. */
export function receiptExceedsShipped(
  received: number | null,
  rejected: number | null,
  shipped: number,
): boolean {
  return shortfall(received, rejected, shipped) < 0;
}

/** Sum of the chosen lots; rounded to the 4 decimals of the API to compare with the line. */
export function lotsTotal(quantities: readonly (number | null)[]): number {
  return Math.round(quantities.reduce<number>((sum, q) => sum + (q ?? 0), 0) * 10_000) / 10_000;
}

export const DISCREPANCY_REASONS = Object.entries(ENUM_LABELS.DiscrepancyReason).map(
  ([value, label]) => ({ value: value as DiscrepancyReason, label }),
);
