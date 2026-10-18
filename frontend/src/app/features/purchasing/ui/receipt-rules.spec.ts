import { checkReceipt, receiptTotal, receivableNow } from './receipt-rules';

// 100 ordered with 5 % tolerance (105), 40 already received.
const line = { quantity: 100, receivedQty: 40, pendingQty: 60, maxReceivableQty: 105 };

describe('goods receipt rules (RN-32)', () => {
  it('this receipt may bring up to the tolerance minus what arrived', () => {
    expect(receivableNow(line)).toBe(65);
    expect(receivableNow({ ...line, receivedQty: 110 })).toBe(0);
  });

  it('up to the pending is ok, above it warns, above the tolerance is not accepted', () => {
    expect(checkReceipt(line, 60)).toBe('ok');
    expect(checkReceipt(line, 63)).toBe('over');
    expect(checkReceipt(line, 65)).toBe('over');
    expect(checkReceipt(line, 65.5)).toBe('exceeds');
  });

  it('adds the lots of a line', () => {
    expect(receiptTotal([10.1, 20.2, null])).toBe(30.3);
  });
});
