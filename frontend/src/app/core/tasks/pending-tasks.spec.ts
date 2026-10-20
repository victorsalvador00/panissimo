import { badgeText, navBadges, PendingTasks } from './pending-tasks';

const none: PendingTasks = {
  purchaseOrdersToApprove: 0,
  purchaseOrdersToReceive: 0,
  productionOrdersToProduce: 0,
  productionOrdersInProgress: 0,
  vouchersToSend: 0,
  vouchersToReceive: 0,
  planRowsToSchedule: 0,
};

describe('menu badges (RN-118)', () => {
  it('has no badges while nothing waits', () => {
    expect(navBadges(null).size).toBe(0);
    expect(navBadges(none).size).toBe(0);
  });

  it('adds up what waits in each menu entry and says what it is', () => {
    const badges = navBadges({
      ...none,
      purchaseOrdersToApprove: 2,
      purchaseOrdersToReceive: 1,
      productionOrdersToProduce: 3,
      vouchersToReceive: 4,
      planRowsToSchedule: 5,
    });
    expect(badges.get('/compras/ordenes')).toEqual({
      count: 3,
      detail: '2 por aprobar · 1 por recibir',
    });
    expect(badges.get('/produccion/plan')).toEqual({ count: 5, detail: '5 por programar' });
    expect(badges.get('/produccion/ordenes')).toEqual({ count: 3, detail: '3 por producir' });
    expect(badges.get('/inventario/vales-internos')).toEqual({ count: 4, detail: '4 por recibir' });
  });

  it('ignores the counts the user has no permission for (null)', () => {
    const badges = navBadges({
      ...none,
      purchaseOrdersToApprove: null,
      purchaseOrdersToReceive: 5,
    });
    expect(badges.get('/compras/ordenes')).toEqual({ count: 5, detail: '5 por recibir' });
  });

  it('shows up to 99 and then 99+', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(120)).toBe('99+');
  });
});
