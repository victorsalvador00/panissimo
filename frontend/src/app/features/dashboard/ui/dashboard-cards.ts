import { formatQty } from '../../../shared/pipes/pipes';
import type { Dashboard, DashboardDocument } from '../data-access/dashboard-api';

/** `Plant` or `Branch` (the type of the active location, as the session brings it). */
export type LocationKind = string;

/** A row under the count: what to open first. */
export interface CardLine {
  text: string;
  detail: string;
  link: string[];
  queryParams?: Record<string, string>;
}

export interface DashboardCard {
  key: string;
  title: string;
  icon: string;
  count: number;
  /** Alerts with something pending are highlighted in orange (frontend §7.9); work queues are not. */
  alert: boolean;
  /** Extra line under the count (e.g. "2 vencidos"). */
  note: string | null;
  /** The list filtered by URL that the card opens. */
  link: string;
  queryParams: Record<string, string> | null;
  lines: CardLine[];
  empty: string;
}

const dateText = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

function documents(
  docs: readonly DashboardDocument[],
  base: string,
  datePrefix: string,
): CardLine[] {
  return docs.map((d) => ({
    text: d.folio,
    detail: d.date ? `${d.title} · ${datePrefix} ${dateText(d.date)}` : d.title,
    link: [base, d.id],
  }));
}

/**
 * The cards of the dashboard (frontend §7.9, `dashboardCards`): a block that came null (no permission) has no card; the
 * location type decides which side of a flow applies (a branch receives transfers and follows its orders; the plant
 * dispatches, approves, buys, produces and sells). Production today and low stock per location are charts, not cards.
 */
export function dashboardCards(d: Dashboard, kind: LocationKind | null): DashboardCard[] {
  const plant = kind === 'Plant';
  const branch = kind === 'Branch';
  const cards: DashboardCard[] = [];

  if (d.lowStock)
    cards.push({
      key: 'lowStock',
      title: 'Bajo mínimo',
      icon: 'trending_down',
      count: d.lowStock.count,
      alert: d.lowStock.count > 0,
      note: null,
      link: '/inventario/existencias',
      queryParams: { bajoMinimo: '1' },
      lines: d.lowStock.items.map((i) => ({
        text: i.sku,
        detail: `${i.itemName} · ${formatQty(i.onHand, i.baseUomCode)} de mín. ${formatQty(i.minQty, i.baseUomCode)}`,
        link: ['/inventario/kardex'],
        queryParams: { locationId: i.locationId, itemId: i.itemId },
      })),
      empty: 'Todo está sobre su mínimo.',
    });
  if (d.expiringLots)
    cards.push({
      key: 'expiringLots',
      title: 'Lotes por caducar',
      icon: 'event_busy',
      count: d.expiringLots.count,
      alert: d.expiringLots.count > 0,
      note:
        d.expiringLots.expiredCount > 0
          ? `${d.expiringLots.expiredCount} ${d.expiringLots.expiredCount === 1 ? 'vencido' : 'vencidos'}`
          : `En los próximos ${d.expiringLots.expiryAlertDays} días`,
      link: '/inventario/existencias',
      queryParams: { porCaducar: '1' },
      lines: d.expiringLots.items.map((l) => ({
        text: `${l.sku} · ${l.lotNumber}`,
        detail: `${formatQty(l.quantity, l.baseUomCode)} · ${l.isExpired ? 'venció' : 'caduca'} el ${dateText(l.expirationDate)}`,
        link: ['/inventario/existencias'],
        queryParams: { porCaducar: '1' },
      })),
      empty: 'Ningún lote por caducar.',
    });
  if (branch && d.transfersToReceive)
    cards.push({
      key: 'transfersToReceive',
      title: 'Traspasos por recibir',
      icon: 'move_to_inbox',
      count: d.transfersToReceive.count,
      alert: false,
      note: null,
      link: '/logistica/traspasos',
      queryParams: { tab: 'InTransit' },
      lines: d.transfersToReceive.items.map((t) => ({
        text: t.folio,
        detail: t.date ? `De ${t.title} · despachado el ${dateText(t.date)}` : `De ${t.title}`,
        link: ['/logistica/traspasos', t.id, 'recibir'],
      })),
      empty: 'No hay traspasos en camino.',
    });
  if (plant && d.transfersToDispatch)
    cards.push({
      key: 'transfersToDispatch',
      title: 'Traspasos por despachar',
      icon: 'local_shipping',
      count: d.transfersToDispatch.count,
      alert: false,
      note: null,
      link: '/logistica/traspasos',
      queryParams: { tab: 'ToDispatch' },
      lines: d.transfersToDispatch.items.map((t) => ({
        text: t.folio,
        detail: `Para ${t.title}`,
        link: ['/logistica/traspasos', t.id],
      })),
      empty: 'No hay traspasos por despachar.',
    });
  if (branch && d.branchOrdersInProgress)
    cards.push({
      key: 'branchOrdersInProgress',
      title: 'Pedidos en curso',
      icon: 'shopping_cart',
      count: d.branchOrdersInProgress.count,
      alert: false,
      note: null,
      link: '/logistica/pedidos',
      queryParams: null,
      lines: documents(d.branchOrdersInProgress.items, '/logistica/pedidos', 'para el'),
      empty: 'No hay pedidos en curso.',
    });
  if (plant && d.branchOrdersToApprove)
    cards.push({
      key: 'branchOrdersToApprove',
      title: 'Pedidos por aprobar',
      icon: 'approval',
      count: d.branchOrdersToApprove.count,
      alert: false,
      note: null,
      link: '/logistica/pedidos',
      queryParams: { tab: 'ToApprove' },
      lines: documents(d.branchOrdersToApprove.items, '/logistica/pedidos', 'para el'),
      empty: 'No hay pedidos por aprobar.',
    });
  if (d.purchaseOrdersToApprove && (plant || d.purchaseOrdersToApprove.count > 0))
    cards.push({
      key: 'purchaseOrdersToApprove',
      title: 'OC por aprobar',
      icon: 'request_quote',
      count: d.purchaseOrdersToApprove.count,
      alert: false,
      note: null,
      link: '/compras/ordenes',
      queryParams: { tab: 'ToApprove' },
      lines: documents(d.purchaseOrdersToApprove.items, '/compras/ordenes', 'entrega el'),
      empty: 'No hay órdenes de compra por aprobar.',
    });
  if (plant && d.productionInProgress)
    cards.push({
      key: 'productionInProgress',
      title: 'OP en proceso',
      icon: 'precision_manufacturing',
      count: d.productionInProgress.count,
      alert: false,
      note: null,
      link: '/produccion/ordenes',
      queryParams: { tab: 'InProgress' },
      lines: d.productionInProgress.items.map((o) => ({
        text: o.folio,
        detail: `${o.outputSku} · ${formatQty(o.producedQty, o.baseUomCode)} de ${formatQty(o.plannedQty, o.baseUomCode)}`,
        link: ['/produccion/ordenes', o.id],
      })),
      empty: 'No hay órdenes en proceso.',
    });
  if (plant && d.recipesWithCostIncreases)
    cards.push({
      key: 'recipesWithCostIncreases',
      title: 'Recetas con alza de insumos',
      icon: 'trending_up',
      count: d.recipesWithCostIncreases.count,
      alert: d.recipesWithCostIncreases.count > 0,
      note: `Alza de ${d.recipesWithCostIncreases.alertPct} % o más en los últimos 30 días`,
      link: '/produccion/recetas',
      queryParams: null,
      lines: d.recipesWithCostIncreases.items.map((r) => ({
        text: r.outputSku,
        detail: r.components.map((c) => `${c.sku} +${c.increasePct} %`).join(', '),
        link: ['/produccion/recetas', r.recipeId],
        queryParams: { tab: 'costos' },
      })),
      empty: 'Ningún insumo subió de precio.',
    });
  if (plant && d.customerOrdersDue)
    cards.push({
      key: 'customerOrdersDue',
      title: 'Pedidos de cliente por surtir',
      icon: 'storefront',
      count: d.customerOrdersDue.count,
      alert: d.customerOrdersDue.overdueCount > 0,
      note:
        d.customerOrdersDue.overdueCount > 0
          ? `${d.customerOrdersDue.overdueCount} ${d.customerOrdersDue.overdueCount === 1 ? 'vencido' : 'vencidos'}`
          : 'Para hoy',
      link: '/ventas/pedidos',
      queryParams: { tab: 'ToFulfill' },
      lines: documents(d.customerOrdersDue.items, '/ventas/pedidos', 'para el'),
      empty: 'No hay pedidos para hoy ni vencidos.',
    });
  if (plant && d.customerShipmentsToDispatch)
    cards.push({
      key: 'customerShipmentsToDispatch',
      title: 'Remisiones por despachar',
      icon: 'outbox',
      count: d.customerShipmentsToDispatch.count,
      alert: false,
      note: null,
      link: '/ventas/remisiones',
      queryParams: { tab: 'ToDispatch' },
      lines: documents(d.customerShipmentsToDispatch.items, '/ventas/remisiones', 'para el'),
      empty: 'No hay remisiones por despachar.',
    });
  return cards;
}

/** A quick action of the dashboard on a phone (frontend §7.9, up to four). */
export interface QuickAction {
  key: string;
  label: string;
  icon: string;
}

/**
 * The quick actions for the location type and permissions, in priority order (at most four). "Recibir traspaso" and
 * "Contar inventario" open the single pending document when there is only one; the page resolves that on click.
 */
export function quickActions(
  kind: LocationKind | null,
  can: (permission: string) => boolean,
): QuickAction[] {
  const actions: (QuickAction & { show: boolean })[] = [
    {
      key: 'receive',
      label: 'Recibir traspaso',
      icon: 'move_to_inbox',
      show: kind === 'Branch' && can('logistics.transfers.receive'),
    },
    {
      key: 'close',
      label: 'Cerrar producción',
      icon: 'task_alt',
      show: kind === 'Plant' && can('production.orders.close'),
    },
    { key: 'count', label: 'Contar inventario', icon: 'fact_check', show: can('inventory.count') },
    {
      key: 'consumption',
      label: 'Registrar consumo',
      icon: 'restaurant',
      show: kind === 'Branch' && can('inventory.consumption'),
    },
    {
      key: 'order',
      label: 'Nuevo pedido',
      icon: 'add_shopping_cart',
      show: kind === 'Branch' && can('logistics.orders.create'),
    },
    {
      key: 'dispatch',
      label: 'Despachar traspaso',
      icon: 'local_shipping',
      show: kind === 'Plant' && can('logistics.transfers.dispatch'),
    },
    {
      key: 'receipt',
      label: 'Recibir compra',
      icon: 'inventory',
      show: kind === 'Plant' && can('purchasing.receive'),
    },
  ];
  return actions
    .filter((a) => a.show)
    .slice(0, 4)
    .map(({ key, label, icon }) => ({ key, label, icon }));
}
