import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Purchasing (frontend §7.6). F-15 adds the purchase orders and receipts; F-20 the requirement. */
export const PURCHASING_ROUTES: Routes = [
  {
    path: 'proveedores',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Proveedores' },
    children: [
      {
        path: '',
        title: 'Proveedores · SGO Paníssimo',
        loadComponent: () => import('./pages/suppliers-list-page').then((m) => m.SuppliersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo proveedor · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.suppliers.manage', breadcrumb: 'Nuevo proveedor' },
        loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
      },
      {
        path: ':id',
        title: 'Proveedor · SGO Paníssimo',
        data: { breadcrumb: 'Proveedor' },
        loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
      },
    ],
  },
  {
    path: 'requisiciones',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Requisiciones' },
    children: [
      {
        path: '',
        title: 'Requisiciones · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/requisitions-list-page').then((m) => m.RequisitionsListPage),
      },
      {
        path: 'nueva',
        title: 'Nueva requisición · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.requisitions.manage', breadcrumb: 'Nueva requisición' },
        loadComponent: () =>
          import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
      },
      {
        path: ':id',
        title: 'Requisición · SGO Paníssimo',
        data: { breadcrumb: 'Requisición' },
        loadComponent: () =>
          import('./pages/requisition-detail-page').then((m) => m.RequisitionDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar requisición · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.requisitions.manage', breadcrumb: 'Editar requisición' },
        loadComponent: () =>
          import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
      },
    ],
  },
];
