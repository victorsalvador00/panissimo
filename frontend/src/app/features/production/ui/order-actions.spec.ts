import { componentWaste, productionOrderActions } from './order-actions';

const all = () => true;
const none = () => false;
const only = (permission: string) => (p: string) => p === permission;

describe('productionOrderActions (RN-60)', () => {
  it('a draft is released, edited or cancelled by whoever manages orders', () => {
    expect(productionOrderActions({ status: 'Draft', closeCount: 0 }, all)).toEqual([
      'release',
      'edit',
      'cancel',
    ]);
    expect(
      productionOrderActions({ status: 'Draft', closeCount: 0 }, only('production.orders.close')),
    ).toEqual([]);
  });

  it('a released order is cancelled only without closes, and closes partially or finally', () => {
    expect(productionOrderActions({ status: 'Released', closeCount: 0 }, all)).toEqual([
      'cancel',
      'closePartial',
      'closeFinal',
    ]);
    expect(productionOrderActions({ status: 'Released', closeCount: 1 }, all)).toEqual([
      'closePartial',
      'closeFinal',
    ]);
    expect(
      productionOrderActions(
        { status: 'Released', closeCount: 0 },
        only('production.orders.manage'),
      ),
    ).toEqual(['cancel']);
  });

  it('in progress it is not cancelled: it ends with the final close', () => {
    expect(productionOrderActions({ status: 'InProgress', closeCount: 2 }, all)).toEqual([
      'closePartial',
      'closeFinal',
    ]);
  });

  it('completed, cancelled or without permissions: nothing', () => {
    expect(productionOrderActions({ status: 'Completed', closeCount: 3 }, all)).toEqual([]);
    expect(productionOrderActions({ status: 'Cancelled', closeCount: 0 }, all)).toEqual([]);
    expect(productionOrderActions({ status: 'Released', closeCount: 0 }, none)).toEqual([]);
  });
});

describe('componentWaste (RN-13)', () => {
  it('is the actual minus the theoretical of what was produced', () => {
    // 100 planned use 50 kg; 40 produced should use 20 kg; 22 were used.
    expect(
      componentWaste({ theoreticalQty: 50, actualQty: 22 }, { plannedQty: 100, producedQty: 40 }),
    ).toBe(2);
    expect(
      componentWaste({ theoreticalQty: 50, actualQty: 19 }, { plannedQty: 100, producedQty: 40 }),
    ).toBe(-1);
  });

  it('is null while nothing was produced', () => {
    expect(
      componentWaste({ theoreticalQty: 50, actualQty: 0 }, { plannedQty: 100, producedQty: 0 }),
    ).toBeNull();
  });
});
