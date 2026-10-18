import type { ApiEnum } from '../../../core/api/api';

export type CloseKind = ApiEnum<'ProductionCloseKind'>;

export interface CloseCheck {
  /** Total produced after this close. */
  total: number;
  /** A final close may record 0 only when the order already has closes (RN-63). */
  zeroAllowed: boolean;
  /** RN-63: a final close below the plan requires the shortfall reason. */
  needsReason: boolean;
  /** More than planned: orange warning. */
  overPlanned: boolean;
  /** Above the tolerance: the close is saved marked; it does not block (D-03). */
  overTolerance: boolean;
}

/** `?tipo=parcial|final` of the URL. */
export function closeKindOf(tipo: string | null | undefined): CloseKind {
  return tipo === 'final' ? 'Final' : 'Partial';
}

export function checkClose(
  order: { plannedQty: number; producedQty: number; maxAllowedQty: number; closeCount: number },
  kind: CloseKind,
  qty: number | null,
): CloseCheck {
  const total = round(order.producedQty + (qty ?? 0));
  return {
    total,
    zeroAllowed: kind === 'Final' && order.closeCount > 0,
    needsReason: kind === 'Final' && qty !== null && total < order.plannedQty,
    overPlanned: total > order.plannedQty,
    overTolerance: total > order.maxAllowedQty,
  };
}

/** Estimated cost of the actual consumption, its unit cost and the waste in pesos (RN-13, RN-64). */
export function closeCosts(
  lines: readonly { theoreticalQty: number; actualQty: number | null; averageCost: number }[],
  producedQty: number | null,
): { total: number; unit: number | null; waste: number } {
  let total = 0;
  let waste = 0;
  for (const line of lines) {
    const actual = line.actualQty ?? 0;
    total += actual * line.averageCost;
    waste += (actual - line.theoreticalQty) * line.averageCost;
  }
  const money = (n: number) => Math.round(n * 100) / 100;
  return {
    total: money(total),
    unit:
      producedQty && producedQty > 0 ? Math.round((total / producedQty) * 10_000) / 10_000 : null,
    waste: money(waste),
  };
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
