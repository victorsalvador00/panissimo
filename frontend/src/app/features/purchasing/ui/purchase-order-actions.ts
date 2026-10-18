import type { ApiEnum } from '../../../core/api/api';

export type PurchaseOrderAction =
  'edit' | 'submit' | 'approve' | 'reject' | 'cancel' | 'close' | 'receive';

/**
 * RN-31/RN-32 (frontend §7.6): what can be done with a purchase order by state and permission. A draft is edited and
 * sent; one pending approval is approved or rejected; approved or partially received ones are received; it is
 * cancelled while nothing was received (draft, pending approval or approved) and a partially received one is closed
 * with its balance.
 */
export function purchaseOrderActions(
  status: ApiEnum<'PurchaseOrderStatus'>,
  can: (permission: string) => boolean,
): PurchaseOrderAction[] {
  const manage = can('purchasing.po.manage');
  const actions: PurchaseOrderAction[] = [];
  if (status === 'Draft' && manage) actions.push('edit', 'submit');
  if (status === 'PendingApproval' && can('purchasing.po.approve'))
    actions.push('approve', 'reject');
  if ((status === 'Approved' || status === 'PartiallyReceived') && can('purchasing.receive'))
    actions.push('receive');
  if ((status === 'Draft' || status === 'PendingApproval' || status === 'Approved') && manage)
    actions.push('cancel');
  if (status === 'PartiallyReceived' && manage) actions.push('close');
  return actions;
}
