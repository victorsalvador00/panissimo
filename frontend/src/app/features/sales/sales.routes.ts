import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Sales to third parties (frontend §7.7): customers, their orders and shipments. */
export const SALES_ROUTES: Routes = [
  {
    path: 'clientes',
    canActivate: [permissionGuard],
    data: { permission: 'sales.view', breadcrumb: 'Clientes' },
    children: [
      {
        path: '',
        title: 'Clientes · SGO Paníssimo',
        loadComponent: () => import('./pages/customers-list-page').then((m) => m.CustomersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo cliente · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'sales.customers.manage', breadcrumb: 'Nuevo cliente' },
        loadComponent: () => import('./pages/customer-form-page').then((m) => m.CustomerFormPage),
      },
      {
        path: ':id',
        title: 'Cliente · SGO Paníssimo',
        data: { breadcrumb: 'Cliente' },
        loadComponent: () => import('./pages/customer-form-page').then((m) => m.CustomerFormPage),
      },
    ],
  },
  {
    path: 'pedidos',
    canActivate: [permissionGuard],
    data: { permission: 'sales.view', breadcrumb: 'Pedidos de cliente' },
    children: [
      {
        path: '',
        title: 'Pedidos de cliente · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/customer-orders-list-page').then((m) => m.CustomerOrdersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo pedido de cliente · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'sales.orders.manage', breadcrumb: 'Nuevo pedido' },
        loadComponent: () =>
          import('./pages/customer-order-form-page').then((m) => m.CustomerOrderFormPage),
      },
      {
        path: ':id',
        title: 'Pedido de cliente · SGO Paníssimo',
        data: { breadcrumb: 'Pedido' },
        loadComponent: () =>
          import('./pages/customer-order-detail-page').then((m) => m.CustomerOrderDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar pedido de cliente · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'sales.orders.manage', breadcrumb: 'Editar pedido' },
        loadComponent: () =>
          import('./pages/customer-order-form-page').then((m) => m.CustomerOrderFormPage),
      },
    ],
  },
  {
    path: 'remisiones',
    canActivate: [permissionGuard],
    data: { permission: 'sales.view', breadcrumb: 'Remisiones' },
    children: [
      {
        path: '',
        title: 'Remisiones · SGO Paníssimo',
        loadComponent: () => import('./pages/shipments-list-page').then((m) => m.ShipmentsListPage),
      },
      {
        path: ':id',
        title: 'Remisión · SGO Paníssimo',
        data: { breadcrumb: 'Remisión' },
        loadComponent: () => import('./pages/shipment-page').then((m) => m.ShipmentPage),
      },
    ],
  },
];
