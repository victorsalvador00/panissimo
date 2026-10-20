import type { PlanRow } from '../data-access/production-api';

export interface PlanFactoryGroup {
  factoryName: string;
  rows: PlanRow[];
}

export interface PlanDateGroup {
  date: string;
  factories: PlanFactoryGroup[];
}

const NO_FACTORY = 'Sin fábrica';

/** A row already covered by stock or open OPs: nothing to generate (no checkbox). */
export function isCovered(row: Pick<PlanRow, 'suggestedQty'>): boolean {
  return row.suggestedQty <= 0;
}

/**
 * frontend §7.4.1: the plan grouped by date and then by the factory of the active recipe (RN-49). What is already
 * covered goes first and what is still to be produced (with its checkbox) after: factories with nothing to produce
 * first, then by name (rows without factory last); inside each factory, covered rows first, then by SKU.
 */
export function groupPlan(rows: readonly PlanRow[]): PlanDateGroup[] {
  const byDate = new Map<string, PlanRow[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  return [...byDate.keys()].sort().map((date) => {
    const byFactory = new Map<string, PlanRow[]>();
    for (const row of byDate.get(date)!) {
      const factory = row.factoryName ?? NO_FACTORY;
      byFactory.set(factory, [...(byFactory.get(factory) ?? []), row]);
    }
    const pending = (rows: PlanRow[]) => (rows.some((r) => !isCovered(r)) ? 1 : 0);
    const factories = [...byFactory.entries()]
      .sort(
        ([a, aRows], [b, bRows]) =>
          pending(aRows) - pending(bRows) ||
          (a === NO_FACTORY ? 1 : b === NO_FACTORY ? -1 : a.localeCompare(b)),
      )
      .map(([factoryName, factoryRows]) => ({
        factoryName,
        rows: factoryRows.sort(
          (x, y) => Number(isCovered(y)) - Number(isCovered(x)) || x.sku.localeCompare(y.sku),
        ),
      }));
    return { date, factories };
  });
}

/** Key of a plan row: a product on a date (RN-70). */
export function planKey(row: { itemId: string; date: string }): string {
  return `${row.itemId}|${row.date}`;
}

/** RN-70: the production multiple is a hint, not a block; true when the quantity is not one of its multiples. */
export function offMultiple(quantity: number | null, multiple: number): boolean {
  if (!quantity || multiple <= 1) return false;
  const ratio = quantity / multiple;
  return Math.abs(ratio - Math.round(ratio)) > 1e-9;
}
