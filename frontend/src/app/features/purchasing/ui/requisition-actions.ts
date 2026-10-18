import type { ApiEnum } from '../../../core/api/api';

export type RequisitionAction = 'edit' | 'submit' | 'approve' | 'reject' | 'cancel' | 'convert';

/**
 * RN-34 (frontend §7.6): what can be done with a requisition by state and permission. A draft is edited and sent;
 * a sent one is approved or rejected (`purchasing.po.approve`); draft, sent or approved ones are cancelled; an
 * approved one is converted to a purchase order (`purchasing.po.manage`).
 */
export function requisitionActions(
  status: ApiEnum<'RequisitionStatus'>,
  can: (permission: string) => boolean,
): RequisitionAction[] {
  const manage = can('purchasing.requisitions.manage');
  const approve = can('purchasing.po.approve');
  const actions: RequisitionAction[] = [];
  if (status === 'Draft' && manage) actions.push('edit', 'submit');
  if (status === 'Submitted' && approve) actions.push('approve', 'reject');
  if (status === 'Approved' && can('purchasing.po.manage')) actions.push('convert');
  if ((status === 'Draft' || status === 'Submitted' || status === 'Approved') && manage)
    actions.push('cancel');
  return actions;
}

/**
 * RN-34: an item may repeat (another supplier, for example); every repeated line needs a note that explains why.
 * Returns the indexes of the lines that miss it.
 */
export function repeatedWithoutNote(
  lines: readonly { itemId: string | null; notes: string }[],
): number[] {
  const counts = new Map<string, number>();
  for (const line of lines)
    if (line.itemId) counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1);
  return lines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.itemId && (counts.get(line.itemId) ?? 0) > 1 && !line.notes.trim())
    .map(({ i }) => i);
}
