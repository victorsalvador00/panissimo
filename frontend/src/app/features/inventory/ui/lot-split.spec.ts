import { lotSplitTotal, lotSplitValid } from './lot-split';

describe('lot split ("Elegir lotes")', () => {
  it('adds the chosen lots with the API precision', () => {
    expect(
      lotSplitTotal([
        { lotId: 'a', qty: 0.1 },
        { lotId: 'b', qty: 0.2 },
      ]),
    ).toBe(0.3);
  });

  it('nothing chosen is valid (first to expire); otherwise it must add up the target', () => {
    expect(lotSplitValid([], 5)).toBe(true);
    expect(lotSplitValid([{ lotId: 'a', qty: 5 }], 5)).toBe(true);
    expect(lotSplitValid([{ lotId: 'a', qty: 3 }], 5)).toBe(false);
    expect(lotSplitValid([{ lotId: 'a', qty: 3 }], null)).toBe(false);
  });
});
