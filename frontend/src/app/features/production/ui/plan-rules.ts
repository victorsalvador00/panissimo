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

/**
 * frontend §7.4.1: the plan grouped by date and then by the factory of the active recipe (RN-49; rows without one
 * last), SKU inside each factory.
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
    const factories = [...byFactory.entries()]
      .sort(([a], [b]) => (a === NO_FACTORY ? 1 : b === NO_FACTORY ? -1 : a.localeCompare(b)))
      .map(([factoryName, factoryRows]) => ({
        factoryName,
        rows: factoryRows.sort((x, y) => x.sku.localeCompare(y.sku)),
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
