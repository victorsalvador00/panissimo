import { lineSubtotal, lineTax, money, orderTotals } from './purchase-math';
import { purchaseOrderActions } from './purchase-order-actions';

describe('purchase order amounts (same rounding as the backend)', () => {
  it('rounds cents half away from zero without binary noise', () => {
    expect(money(2.675)).toBe(2.68);
    expect(money(1.005)).toBe(1.01);
    expect(money(-1.005)).toBe(-1.01);
    expect(money(0.1 + 0.2)).toBe(0.3);
  });

  it('VAT on the rounded subtotal of each line; totals add the rounded lines', () => {
    expect(lineSubtotal(3, 18.335)).toBe(55.01);
    expect(lineTax(3, 18.335, 0.16)).toBe(8.8);
    expect(
      orderTotals([
        { quantity: 3, unitPrice: 18.335, taxRate: 0.16 },
        { quantity: 1.5, unitPrice: 9.99, taxRate: 0 },
      ]),
    ).toEqual({ subtotal: 70, tax: 8.8, total: 78.8 });
  });
});

describe('purchaseOrderActions (RN-31, RN-32)', () => {
  const all = () => true;
  const only =
    (...granted: string[]) =>
    (p: string) =>
      granted.includes(p);

  it('a draft is edited, sent and cancelled by whoever manages orders', () => {
    expect(purchaseOrderActions('Draft', all)).toEqual(['edit', 'submit', 'cancel']);
  });

  it('pending approval: approve or reject; cancel too for the manager', () => {
    expect(purchaseOrderActions('PendingApproval', only('purchasing.po.approve'))).toEqual([
      'approve',
      'reject',
    ]);
    expect(purchaseOrderActions('PendingApproval', all)).toEqual(['approve', 'reject', 'cancel']);
  });

  it('approved: receive or cancel; partially received: receive or close with its balance', () => {
    expect(purchaseOrderActions('Approved', all)).toEqual(['receive', 'cancel']);
    expect(purchaseOrderActions('PartiallyReceived', all)).toEqual(['receive', 'close']);
    expect(purchaseOrderActions('PartiallyReceived', only('purchasing.receive'))).toEqual([
      'receive',
    ]);
  });

  it('final states have nothing', () => {
    for (const status of ['Received', 'Rejected', 'Cancelled', 'Closed'] as const)
      expect(purchaseOrderActions(status, all)).toEqual([]);
  });
});
