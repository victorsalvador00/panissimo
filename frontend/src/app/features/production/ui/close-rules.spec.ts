import { checkClose, closeCosts, closeKindOf } from './close-rules';

const order = { plannedQty: 100, producedQty: 40, maxAllowedQty: 110, closeCount: 1 };

describe('close rules', () => {
  it('reads the kind of the URL', () => {
    expect(closeKindOf('final')).toBe('Final');
    expect(closeKindOf('parcial')).toBe('Partial');
    expect(closeKindOf(undefined)).toBe('Partial');
  });

  it('RN-63: a final close below the plan needs the reason; 0 only with previous closes', () => {
    expect(checkClose(order, 'Final', 50)).toMatchObject({
      total: 90,
      needsReason: true,
      zeroAllowed: true,
    });
    expect(checkClose(order, 'Final', 60).needsReason).toBe(false);
    expect(checkClose(order, 'Partial', 10).needsReason).toBe(false);
    expect(checkClose({ ...order, closeCount: 0, producedQty: 0 }, 'Final', 0).zeroAllowed).toBe(
      false,
    );
  });

  it('D-03: over the plan warns, over the tolerance is marked, neither blocks', () => {
    expect(checkClose(order, 'Partial', 65)).toMatchObject({
      overPlanned: true,
      overTolerance: false,
    });
    expect(checkClose(order, 'Partial', 71)).toMatchObject({
      overPlanned: true,
      overTolerance: true,
    });
  });

  it('RN-64 and RN-13: cost of the actual consumption, unit cost and waste', () => {
    const costs = closeCosts(
      [
        { theoreticalQty: 6, actualQty: 6.5, averageCost: 20 },
        { theoreticalQty: 2, actualQty: null, averageCost: 5 },
      ],
      10,
    );
    expect(costs).toEqual({ total: 130, unit: 13, waste: 0 });
    expect(closeCosts([{ theoreticalQty: 1, actualQty: 1, averageCost: 3 }], 0).unit).toBeNull();
  });
});
