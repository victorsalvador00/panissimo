import type { PlanRow } from '../data-access/production-api';
import { groupPlan, offMultiple, planKey } from './plan-rules';

function row(sku: string, date: string, factoryName: string | null): PlanRow {
  return {
    itemId: sku,
    sku,
    name: sku,
    type: 'FinishedGood',
    presentation: 'Bulk',
    factoryId: factoryName,
    factoryCode: factoryName,
    factoryName,
    uomCode: 'pza',
    productionMultiple: 1,
    hasActiveRecipe: true,
    date,
    branchOrders: 0,
    customerOrders: 0,
    stockReplenishment: 0,
    parentOrders: 0,
    totalDemand: 0,
    stock: 0,
    openOrders: 0,
    suggestedQty: 0,
    demandLines: [],
  };
}

describe('plan rules (frontend §7.4.1)', () => {
  it('groups by date, then by factory (without factory last), SKU inside', () => {
    const groups = groupPlan([
      row('B', '2026-10-19', 'Fábrica 2'),
      row('A', '2026-10-18', null),
      row('C', '2026-10-18', 'Fábrica 1'),
      row('A2', '2026-10-18', 'Fábrica 1'),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-10-18', '2026-10-19']);
    expect(groups[0].factories.map((f) => f.factoryName)).toEqual(['Fábrica 1', 'Sin fábrica']);
    expect(groups[0].factories[0].rows.map((r) => r.sku)).toEqual(['A2', 'C']);
  });

  it('a row is a product on a date', () => {
    expect(planKey({ itemId: 'x', date: '2026-10-18' })).toBe('x|2026-10-18');
  });

  it('the multiple is a hint', () => {
    expect(offMultiple(25, 12)).toBe(true);
    expect(offMultiple(24, 12)).toBe(false);
    expect(offMultiple(7, 1)).toBe(false);
    expect(offMultiple(null, 12)).toBe(false);
  });
});
