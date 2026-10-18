import type { ApiEnum } from '../../../core/api/api';

export type OrderAction = 'release' | 'edit' | 'cancel' | 'closePartial' | 'closeFinal';

/**
 * RN-60 (frontend §7.4.2): what can be done with an order by state and permission. A draft is released, edited or
 * cancelled; a released one without closes may still be cancelled; released or in progress, it closes partially or
 * finally. Completed and cancelled are final.
 */
export function productionOrderActions(
  order: { status: ApiEnum<'ProductionOrderStatus'>; closeCount: number },
  can: (permission: string) => boolean,
): OrderAction[] {
  const manage = can('production.orders.manage');
  const close = can('production.orders.close');
  const actions: OrderAction[] = [];
  switch (order.status) {
    case 'Draft':
      if (manage) actions.push('release', 'edit', 'cancel');
      break;
    case 'Released':
      if (manage && order.closeCount === 0) actions.push('cancel');
      if (close) actions.push('closePartial', 'closeFinal');
      break;
    case 'InProgress':
      if (close) actions.push('closePartial', 'closeFinal');
      break;
  }
  return actions;
}

/**
 * RN-13 by component: actual consumption minus the theoretical for what was produced (RN-11 scales linearly, so it is
 * the planned theoretical × produced / planned). Null while nothing was produced.
 */
export function componentWaste(
  line: { theoreticalQty: number; actualQty: number },
  order: { plannedQty: number; producedQty: number },
): number | null {
  if (order.producedQty <= 0 || order.plannedQty <= 0) return null;
  const theoretical = (line.theoreticalQty * order.producedQty) / order.plannedQty;
  return Math.round((line.actualQty - theoretical) * 10_000) / 10_000;
}
