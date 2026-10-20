import type { PlanRow } from '../data-access/production-api';
import { groupPlan, isCovered, offMultiple, planKey } from './plan-rules';

function row(sku: string, date: string, factoryName: string | null, suggestedQty = 0): PlanRow {
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
    suggestedQty,
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

  it('covered rows and factories go first, the ones to produce (with checkbox) after', () => {
    const [day] = groupPlan([
      row('SE-002', '2026-10-21', 'Bizcocho', 3),
      row('PT-021', '2026-10-21', 'Hornos'),
      row('SE-001', '2026-10-21', 'Masas', 5),
      row('A', '2026-10-21', 'Bizcocho'),
    ]);
    expect(day.factories.map((f) => f.factoryName)).toEqual(['Hornos', 'Bizcocho', 'Masas']);
    expect(day.factories[1].rows.map((r) => r.sku)).toEqual(['A', 'SE-002']);
    expect(isCovered(row('X', '2026-10-21', null, 0))).toBe(true);
    expect(isCovered(row('X', '2026-10-21', null, 1))).toBe(false);
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
