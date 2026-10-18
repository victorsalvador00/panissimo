import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Inventory (frontend §7.3). F-07 adds counts and consumptions; F-22 the consumption analysis. */
export const INVENTORY_ROUTES: Routes = [
  {
    path: 'existencias',
    title: 'Existencias · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'inventory.view', breadcrumb: 'Existencias' },
    loadComponent: () => import('./pages/stock-page').then((m) => m.StockPage),
  },
  {
    path: 'kardex',
    title: 'Kardex · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'inventory.view', breadcrumb: 'Kardex' },
    loadComponent: () => import('./pages/kardex-page').then((m) => m.KardexPage),
  },
  {
    path: 'ajustes',
    canActivate: [permissionGuard],
    data: { permission: 'inventory.adjust', breadcrumb: 'Ajustes' },
    children: [
      {
        path: '',
        title: 'Ajustes · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/adjustments-list-page').then((m) => m.AdjustmentsListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo ajuste · SGO Paníssimo',
        data: { breadcrumb: 'Nuevo ajuste' },
        loadComponent: () =>
          import('./pages/adjustment-form-page').then((m) => m.AdjustmentFormPage),
      },
      {
        path: ':id',
        title: 'Ajuste · SGO Paníssimo',
        data: { breadcrumb: 'Ajuste' },
        loadComponent: () =>
          import('./pages/adjustment-detail-page').then((m) => m.AdjustmentDetailPage),
      },
    ],
  },
  {
    path: 'existencias-iniciales',
    title: 'Existencias iniciales · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'inventory.adjust', breadcrumb: 'Existencias iniciales' },
    loadComponent: () => import('./pages/initial-stock-page').then((m) => m.InitialStockPage),
  },
];
