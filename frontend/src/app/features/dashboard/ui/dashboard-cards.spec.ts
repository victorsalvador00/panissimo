import { describe, expect, it } from 'vitest';
import type { Dashboard } from '../data-access/dashboard-api';
import { dashboardCards, quickActions } from './dashboard-cards';

const docs = (count: number) => ({
  count,
  items: Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    id: `d${i}`,
    folio: `F-${i}`,
    title: 'Sucursal Centro',
    date: '2026-10-18',
  })),
});

const full: Dashboard = {
  locationId: 'loc',
  businessDate: '2026-10-18',
  lowStock: { count: 2, items: [] },
  expiringLots: { count: 1, expiredCount: 1, expiryAlertDays: 3, items: [] },
  transfersToReceive: docs(1),
  transfersToDispatch: docs(3),
  branchOrdersToApprove: docs(0),
  branchOrdersInProgress: docs(2),
  purchaseOrdersToApprove: docs(0),
  productionToday: [],
  productionInProgress: { count: 0, items: [] },
  recipesWithCostIncreases: { count: 0, alertPct: 5, items: [] },
  customerOrdersDue: { count: 4, overdueCount: 1, items: [] },
  customerShipmentsToDispatch: docs(0),
  lowStockByLocation: [],
};

describe('dashboardCards', () => {
  it('a branch receives transfers and follows its orders; the plant dispatches, approves, produces and sells', () => {
    expect(dashboardCards(full, 'Branch').map((c) => c.key)).toEqual([
      'lowStock',
      'expiringLots',
      'transfersToReceive',
      'branchOrdersInProgress',
    ]);
    expect(dashboardCards(full, 'Plant').map((c) => c.key)).toEqual([
      'lowStock',
      'expiringLots',
      'transfersToDispatch',
      'branchOrdersToApprove',
      'purchaseOrdersToApprove',
      'productionInProgress',
      'recipesWithCostIncreases',
      'customerOrdersDue',
      'customerShipmentsToDispatch',
    ]);
  });

  it('a block without permission (null) has no card', () => {
    const cards = dashboardCards({ ...full, lowStock: null, customerOrdersDue: null }, 'Plant');
    expect(cards.some((c) => c.key === 'lowStock' || c.key === 'customerOrdersDue')).toBe(false);
  });

  it('only alerts with something pending are highlighted; work queues never are', () => {
    const plant = Object.fromEntries(dashboardCards(full, 'Plant').map((c) => [c.key, c]));
    expect(plant['lowStock'].alert).toBe(true);
    expect(plant['expiringLots'].alert).toBe(true);
    expect(plant['expiringLots'].note).toBe('1 vencido');
    expect(plant['customerOrdersDue'].alert).toBe(true);
    expect(plant['transfersToDispatch'].alert).toBe(false);
    expect(plant['recipesWithCostIncreases'].alert).toBe(false);
  });

  it('each card opens its list filtered by URL', () => {
    const branch = Object.fromEntries(dashboardCards(full, 'Branch').map((c) => [c.key, c]));
    expect([branch['lowStock'].link, branch['lowStock'].queryParams]).toEqual([
      '/inventario/existencias',
      { bajoMinimo: '1' },
    ]);
    expect(branch['expiringLots'].queryParams).toEqual({ porCaducar: '1' });
    expect(branch['transfersToReceive'].queryParams).toEqual({ tab: 'InTransit' });
    expect(branch['transfersToReceive'].lines[0].link).toEqual([
      '/logistica/traspasos',
      'd0',
      'recibir',
    ]);
  });
});

describe('quickActions', () => {
  const all = () => true;

  it('a branch gets receive, count, consumption and order (four at most)', () => {
    expect(quickActions('Branch', all).map((a) => a.key)).toEqual([
      'receive',
      'count',
      'consumption',
      'order',
    ]);
  });

  it('the plant gets close, count, dispatch and receipt', () => {
    expect(quickActions('Plant', all).map((a) => a.key)).toEqual([
      'close',
      'count',
      'dispatch',
      'receipt',
    ]);
  });

  it('each action needs its permission', () => {
    expect(quickActions('Branch', (p) => p === 'inventory.count').map((a) => a.key)).toEqual([
      'count',
    ]);
  });
});
