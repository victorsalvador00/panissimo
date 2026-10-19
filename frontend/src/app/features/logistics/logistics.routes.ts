import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Logistics (frontend §7.5): branch orders, transfers and the fleet (RN-113). */
export const LOGISTICS_ROUTES: Routes = [
  {
    path: 'pedidos',
    canActivate: [permissionGuard],
    data: { permission: 'logistics.view', breadcrumb: 'Pedidos de sucursal' },
    children: [
      {
        path: '',
        title: 'Pedidos de sucursal · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/branch-orders-list-page').then((m) => m.BranchOrdersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo pedido · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.orders.create', breadcrumb: 'Nuevo pedido' },
        loadComponent: () =>
          import('./pages/branch-order-form-page').then((m) => m.BranchOrderFormPage),
      },
      {
        path: ':id',
        title: 'Pedido de sucursal · SGO Paníssimo',
        data: { breadcrumb: 'Pedido' },
        loadComponent: () =>
          import('./pages/branch-order-detail-page').then((m) => m.BranchOrderDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar pedido · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.orders.create', breadcrumb: 'Editar pedido' },
        loadComponent: () =>
          import('./pages/branch-order-form-page').then((m) => m.BranchOrderFormPage),
      },
    ],
  },
  {
    path: 'traspasos',
    canActivate: [permissionGuard],
    data: { permission: 'logistics.view', breadcrumb: 'Traspasos' },
    children: [
      {
        path: '',
        title: 'Traspasos · SGO Paníssimo',
        loadComponent: () => import('./pages/transfers-list-page').then((m) => m.TransfersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.dispatch', breadcrumb: 'Nuevo traspaso' },
        loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
      },
      {
        path: ':id',
        title: 'Traspaso · SGO Paníssimo',
        data: { breadcrumb: 'Traspaso' },
        loadComponent: () =>
          import('./pages/transfer-detail-page').then((m) => m.TransferDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.dispatch', breadcrumb: 'Editar traspaso' },
        loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
      },
      {
        path: ':id/recibir',
        title: 'Recibir traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.receive', breadcrumb: 'Recibir' },
        loadComponent: () =>
          import('./pages/transfer-receive-page').then((m) => m.TransferReceivePage),
      },
    ],
  },
  {
    path: 'flotilla',
    title: 'Vehículos y choferes · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'logistics.fleet.manage', breadcrumb: 'Vehículos y choferes' },
    loadComponent: () => import('./pages/fleet-page').then((m) => m.FleetPage),
  },
];
