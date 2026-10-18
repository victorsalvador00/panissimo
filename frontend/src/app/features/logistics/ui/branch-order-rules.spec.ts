import { branchOrderActions, checkApproval } from './branch-order-rules';

describe('branchOrderActions (RN-20)', () => {
  const all = () => true;
  const only =
    (...granted: string[]) =>
    (p: string) =>
      granted.includes(p);

  it('the branch edits, sends and cancels its draft', () => {
    expect(branchOrderActions('Draft', only('logistics.orders.create'))).toEqual([
      'edit',
      'submit',
      'cancel',
    ]);
  });

  it('the plant approves or rejects a sent one; the branch may still cancel it', () => {
    expect(branchOrderActions('Submitted', only('logistics.orders.approve'))).toEqual([
      'approve',
      'reject',
    ]);
    expect(branchOrderActions('Submitted', only('logistics.orders.create'))).toEqual(['cancel']);
  });

  it('approved or later: nothing here (it is cancelled through its transfer)', () => {
    for (const status of [
      'Approved',
      'PartiallyFulfilled',
      'Fulfilled',
      'Rejected',
      'Cancelled',
    ] as const)
      expect(branchOrderActions(status, all)).toEqual([]);
  });
});

describe('checkApproval (RN-20)', () => {
  it('0 to the requested on each line', () => {
    const check = checkApproval([
      { requestedQty: 10, approvedQty: 10, supplyingStock: 50 },
      { requestedQty: 5, approvedQty: 6, supplyingStock: 50 },
      { requestedQty: 5, approvedQty: null, supplyingStock: 50 },
    ]);
    expect(check.outOfRange).toEqual([1, 2]);
    expect(check.allZero).toBe(false);
  });

  it('not everything in 0', () => {
    expect(
      checkApproval([
        { requestedQty: 10, approvedQty: 0, supplyingStock: 50 },
        { requestedQty: 5, approvedQty: 0, supplyingStock: 50 },
      ]).allZero,
    ).toBe(true);
  });

  it('warns above the stock of the plant', () => {
    expect(
      checkApproval([
        { requestedQty: 10, approvedQty: 8, supplyingStock: 5 },
        { requestedQty: 5, approvedQty: 5, supplyingStock: 5 },
      ]).aboveStock,
    ).toEqual([0]);
  });
});
