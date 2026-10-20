import type { Schemas } from '../api/api';

export type PendingTasks = Schemas['PendingTasksDto'];

/** Whoever has none of these has nothing waiting (RN-118): the request is not even made. */
export const TASK_PERMISSIONS = [
  'purchasing.po.approve',
  'purchasing.receive',
  'production.orders.close',
  'inventory.internal_transfers',
] as const;

/** A red badge of the menu: how many documents wait and what they are. */
export interface NavBadge {
  count: number;
  /** "2 por aprobar · 1 por recibir". */
  detail: string;
}

/** RN-118: the badge of each menu route, only where something waits. */
export function navBadges(tasks: PendingTasks | null): ReadonlyMap<string, NavBadge> {
  const badges = new Map<string, NavBadge>();
  if (!tasks) return badges;
  const add = (route: string, parts: [number | null | undefined, string][]) => {
    const waiting = parts.filter((p): p is [number, string] => (p[0] ?? 0) > 0);
    const count = waiting.reduce((sum, [n]) => sum + n, 0);
    if (count > 0)
      badges.set(route, {
        count,
        detail: waiting.map(([n, label]) => `${n} ${label}`).join(' · '),
      });
  };
  add('/compras/ordenes', [
    [tasks.purchaseOrdersToApprove, 'por aprobar'],
    [tasks.purchaseOrdersToReceive, 'por recibir'],
  ]);
  add('/produccion/ordenes', [
    [tasks.productionOrdersToProduce, 'por producir'],
    [tasks.productionOrdersInProgress, 'en proceso'],
  ]);
  add('/inventario/vales-internos', [
    [tasks.vouchersToSend, 'por enviar'],
    [tasks.vouchersToReceive, 'por recibir'],
  ]);
  return badges;
}

/** Like the phone apps: up to 99, then "99+". */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
