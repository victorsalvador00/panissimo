import type { ApiEnum } from '../../../core/api/api';

export type BranchOrderAction = 'edit' | 'submit' | 'approve' | 'reject' | 'cancel';

/**
 * RN-20 (frontend §7.5): what can be done with a branch order by state and permission. The branch edits, sends and
 * cancels its draft, and may still cancel it once sent; the plant approves or rejects a sent one. An approved order
 * is cancelled by cancelling its transfer.
 */
export function branchOrderActions(
  status: ApiEnum<'BranchOrderStatus'>,
  can: (permission: string) => boolean,
): BranchOrderAction[] {
  const create = can('logistics.orders.create');
  const actions: BranchOrderAction[] = [];
  if (status === 'Draft' && create) actions.push('edit', 'submit');
  if (status === 'Submitted' && can('logistics.orders.approve')) actions.push('approve', 'reject');
  if ((status === 'Draft' || status === 'Submitted') && create) actions.push('cancel');
  return actions;
}

export interface ApprovalLine {
  requestedQty: number;
  approvedQty: number | null;
  supplyingStock: number;
}

export interface ApprovalCheck {
  /** Lines (indexes) outside 0..requested. */
  outOfRange: number[];
  /** Everything in 0: an order is rejected with a reason, not approved empty. */
  allZero: boolean;
  /** Lines (indexes) above the plant's stock: a warning, approving does not reserve stock. */
  aboveStock: number[];
}

/** RN-20: approved quantity from 0 to the requested on each line, not all 0; a warning above the plant's stock. */
export function checkApproval(lines: readonly ApprovalLine[]): ApprovalCheck {
  const indexes = (predicate: (line: ApprovalLine) => boolean) =>
    lines.map((line, i) => (predicate(line) ? i : -1)).filter((i) => i >= 0);
  return {
    outOfRange: indexes(
      (l) => l.approvedQty === null || l.approvedQty < 0 || l.approvedQty > l.requestedQty,
    ),
    allZero: lines.every((l) => (l.approvedQty ?? 0) === 0),
    aboveStock: indexes((l) => (l.approvedQty ?? 0) > l.supplyingStock),
  };
}

/** Tomorrow, the default required date of a branch order. */
export function tomorrow(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return date;
}
