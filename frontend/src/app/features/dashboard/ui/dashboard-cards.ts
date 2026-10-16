import type { DashboardDto } from '../data-access/dashboard.api';

export interface DashboardCard {
  id: string;
  icon: string;
  label: string;
  count: number;
  /** Texto secundario (ej. "2 ya caducaron"). */
  detail?: string;
  /** El conteo mayor a 0 pide atención (se resalta). */
  alert: boolean;
  link: string;
  queryParams?: Record<string, string>;
}

/**
 * Tarjetas del tablero para la ubicación activa (spec frontend §7.8). Solo las de bloques que el
 * backend devolvió (permiso) y que aplican al tipo de ubicación: la sucursal recibe traspasos y
 * sigue sus pedidos; la fábrica y el comisariato despachan, aprueban pedidos y OC y producen.
 */
export function dashboardCards(
  dashboard: DashboardDto,
  locationType: string | null | undefined,
): DashboardCard[] {
  const branch = locationType === 'Branch';
  const cards: DashboardCard[] = [];

  const inventory = dashboard.inventory;
  if (inventory) {
    cards.push({
      id: 'lowStock',
      icon: 'trending_down',
      label: 'Artículos bajo mínimo',
      count: inventory.lowStock,
      alert: true,
      link: '/inventario/existencias',
      queryParams: { bajoMinimo: '1' },
    });
    cards.push({
      id: 'expiringLots',
      icon: 'event_busy',
      label: 'Lotes por caducar',
      count: inventory.expiringLots,
      detail: inventory.expiredLots
        ? `${inventory.expiredLots} ya ${inventory.expiredLots === 1 ? 'caducó' : 'caducaron'}`
        : `En ${inventory.expirationAlertDays} días o menos`,
      alert: true,
      link: '/inventario/existencias',
      queryParams: { porCaducar: '1' },
    });
  }

  const transfers = dashboard.transfers;
  if (transfers) {
    cards.push(
      branch
        ? {
            id: 'toReceive',
            icon: 'local_shipping',
            label: 'Traspasos por recibir',
            count: transfers.toReceive,
            detail: 'En tránsito hacia aquí',
            alert: true,
            link: '/logistica/traspasos',
            queryParams: { pestana: 'en-transito' },
          }
        : {
            id: 'toDispatch',
            icon: 'local_shipping',
            label: 'Traspasos por despachar',
            count: transfers.toDispatch,
            detail: 'Borradores que salen de aquí',
            alert: true,
            link: '/logistica/traspasos',
            queryParams: { pestana: 'por-despachar' },
          },
    );
  }

  if (branch && dashboard.branchOrdersInProgress !== null) {
    cards.push({
      id: 'ordersInProgress',
      icon: 'shopping_cart',
      label: 'Pedidos en curso',
      count: dashboard.branchOrdersInProgress,
      detail: 'Enviados o aprobados, sin recibir',
      alert: false,
      link: '/logistica/pedidos',
    });
  }
  if (!branch && dashboard.branchOrdersToApprove !== null) {
    cards.push({
      id: 'ordersToApprove',
      icon: 'fact_check',
      label: 'Pedidos por aprobar',
      count: dashboard.branchOrdersToApprove,
      alert: true,
      link: '/logistica/pedidos',
      queryParams: { pestana: 'por-aprobar' },
    });
  }
  if (!branch && dashboard.purchaseOrdersToApprove !== null) {
    cards.push({
      id: 'purchaseOrdersToApprove',
      icon: 'request_quote',
      label: 'OC por aprobar',
      count: dashboard.purchaseOrdersToApprove,
      alert: true,
      link: '/compras/ordenes',
      queryParams: { pestana: 'por-aprobar' },
    });
  }
  if (!branch && dashboard.productionOrdersToday !== null) {
    cards.push({
      id: 'productionToday',
      icon: 'precision_manufacturing',
      label: 'OP liberadas para hoy',
      count: dashboard.productionOrdersToday,
      alert: false,
      link: '/produccion/ordenes',
      queryParams: { estado: 'Released', fecha: 'hoy' },
    });
  }
  return cards;
}
