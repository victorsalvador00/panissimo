import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Purchasing (frontend §7.6). F-14 adds the requisitions and F-15 the purchase orders and receipts. */
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
];
