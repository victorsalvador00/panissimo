import type { PlanRow } from '../data-access/production-api';

export interface PlanAreaGroup {
  areaName: string;
  rows: PlanRow[];
}

export interface PlanDateGroup {
  date: string;
  areas: PlanAreaGroup[];
}

/** frontend §7.4.1: the plan grouped by date and then by area (rows without area last), SKU inside each area. */
export function groupPlan(rows: readonly PlanRow[]): PlanDateGroup[] {
  const byDate = new Map<string, PlanRow[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  return [...byDate.keys()].sort().map((date) => {
    const byArea = new Map<string, PlanRow[]>();
    for (const row of byDate.get(date)!) {
      const area = row.areaName ?? 'Sin área';
      byArea.set(area, [...(byArea.get(area) ?? []), row]);
    }
    const areas = [...byArea.entries()]
      .sort(([a], [b]) => (a === 'Sin área' ? 1 : b === 'Sin área' ? -1 : a.localeCompare(b)))
      .map(([areaName, areaRows]) => ({
        areaName,
        rows: areaRows.sort((x, y) => x.sku.localeCompare(y.sku)),
      }));
    return { date, areas };
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
