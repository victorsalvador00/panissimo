import { customerOrderActions, repeatedItems } from './customer-order-actions';

describe('customerOrderActions (RN-80..RN-82)', () => {
  const all = () => true;
  const only =
    (...granted: string[]) =>
    (p: string) =>
      granted.includes(p);

  it('a draft is edited, confirmed or cancelled', () => {
    expect(customerOrderActions({ status: 'Draft', shippedAny: false }, all)).toEqual([
      'edit',
      'confirm',
      'cancel',
    ]);
  });

  it('a confirmed one is shipped, and cancelled only with nothing shipped', () => {
    expect(customerOrderActions({ status: 'Confirmed', shippedAny: false }, all)).toEqual([
      'ship',
      'cancel',
    ]);
    expect(customerOrderActions({ status: 'Confirmed', shippedAny: true }, all)).toEqual(['ship']);
    expect(
      customerOrderActions({ status: 'Confirmed', shippedAny: false }, only('sales.orders.manage')),
    ).toEqual(['cancel']);
  });

  it('a partially shipped one is shipped again or closed with its balance', () => {
    expect(customerOrderActions({ status: 'PartiallyShipped', shippedAny: true }, all)).toEqual([
      'ship',
      'close',
    ]);
  });

  it('shipped, closed or cancelled: nothing', () => {
    for (const status of ['Shipped', 'Closed', 'Cancelled'] as const)
      expect(customerOrderActions({ status, shippedAny: true }, all)).toEqual([]);
  });
});

describe('repeatedItems (D-05)', () => {
  it('marks the second and later lines of an item', () => {
    expect(repeatedItems(['a', 'b', 'a', null, 'a'])).toEqual([2, 4]);
  });
});
