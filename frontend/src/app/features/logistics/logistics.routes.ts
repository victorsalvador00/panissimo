import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const view = { canActivate: [permissionGuard], data: { permission: 'logistics.view' } };
const createOrder = {
  canActivate: [permissionGuard],
  data: { permission: 'logistics.orders.create' },
};
const dispatch = {
  canActivate: [permissionGuard],
  data: { permission: 'logistics.transfers.dispatch' },
};
const receive = {
  canActivate: [permissionGuard],
  data: { permission: 'logistics.transfers.receive' },
};

export const LOGISTICS_ROUTES: Routes = [
  {
    path: 'pedidos',
    title: 'Pedidos',
    ...view,
    loadComponent: () =>
      import('./pages/branch-orders-list-page').then((m) => m.BranchOrdersListPage),
  },
  {
    path: 'pedidos/nuevo',
    title: 'Nuevo pedido',
    ...createOrder,
    loadComponent: () =>
      import('./pages/branch-order-form-page').then((m) => m.BranchOrderFormPage),
  },
  {
    path: 'pedidos/:id',
    title: 'Pedido',
    ...view,
    loadComponent: () =>
      import('./pages/branch-order-detail-page').then((m) => m.BranchOrderDetailPage),
  },
  {
    path: 'pedidos/:id/editar',
    title: 'Editar pedido',
    ...createOrder,
    loadComponent: () =>
      import('./pages/branch-order-form-page').then((m) => m.BranchOrderFormPage),
  },
  {
    path: 'traspasos',
    title: 'Traspasos',
    ...view,
    loadComponent: () => import('./pages/transfers-list-page').then((m) => m.TransfersListPage),
  },
  {
    path: 'traspasos/nuevo',
    title: 'Nuevo traspaso',
    ...dispatch,
    loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
  },
  {
    path: 'traspasos/:id',
    title: 'Traspaso',
    ...view,
    loadComponent: () => import('./pages/transfer-detail-page').then((m) => m.TransferDetailPage),
  },
  {
    path: 'traspasos/:id/editar',
    title: 'Editar traspaso',
    ...dispatch,
    loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
  },
  {
    path: 'traspasos/:id/recibir',
    title: 'Recibir traspaso',
    ...receive,
    loadComponent: () => import('./pages/transfer-receive-page').then((m) => m.TransferReceivePage),
  },
];
