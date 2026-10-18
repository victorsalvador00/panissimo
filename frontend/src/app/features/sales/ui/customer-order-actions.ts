import type { ApiEnum } from '../../../core/api/api';

export type CustomerOrderAction = 'edit' | 'confirm' | 'cancel' | 'close' | 'ship';

/**
 * RN-80..RN-82 (frontend §7.7): what can be done with a customer order by state and permission. A draft is edited,
 * confirmed or cancelled; a confirmed one is shipped, or cancelled while nothing was shipped; a partially shipped one
 * is shipped again or closed with its balance. Shipping needs `sales.shipments.dispatch`.
 */
export function customerOrderActions(
  order: { status: ApiEnum<'CustomerOrderStatus'>; shippedAny: boolean },
  can: (permission: string) => boolean,
): CustomerOrderAction[] {
  const manage = can('sales.orders.manage');
  const ship = can('sales.shipments.dispatch');
  const actions: CustomerOrderAction[] = [];
  switch (order.status) {
    case 'Draft':
      if (manage) actions.push('edit', 'confirm', 'cancel');
      break;
    case 'Confirmed':
      if (ship) actions.push('ship');
      if (manage && !order.shippedAny) actions.push('cancel');
      break;
    case 'PartiallyShipped':
      if (ship) actions.push('ship');
      if (manage) actions.push('close');
      break;
  }
  return actions;
}

/** D-05/RN-80: a customer orders active finished goods, each item once. Returns the indexes of repeated lines. */
export function repeatedItems(itemIds: readonly (string | null)[]): number[] {
  const seen = new Set<string>();
  const repeated: number[] = [];
  itemIds.forEach((id, i) => {
    if (!id) return;
    if (seen.has(id)) repeated.push(i);
    seen.add(id);
  });
  return repeated;
}
