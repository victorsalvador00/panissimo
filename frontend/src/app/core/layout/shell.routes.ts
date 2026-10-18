import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { Routes } from '@angular/router';
import { permissionGuard } from '../auth/guards';
import { EsMxPaginatorIntl } from '../../shared/data-access/list-query';
import { provideEsMxDates } from '../../shared/forms/es-mx-date-adapter';
import { Shell } from './shell';

/**
 * Everything behind the login, loaded lazily: the shell, its pages and the providers of the shared components
 * (dates, paginator texts, field defaults), so the login does not download them.
 */
export const SHELL_ROUTES: Routes = [
  {
    path: '',
    component: Shell,
    providers: [
      provideEsMxDates(),
      { provide: MatPaginatorIntl, useClass: EsMxPaginatorIntl },
      // Filled fields (pills, styles/_ui.scss); hints and errors take room only when present.
      {
        provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
        useValue: { appearance: 'fill', subscriptSizing: 'dynamic' },
      },
    ],
    children: [
      {
        path: '',
        title: 'Inicio · SGO Paníssimo',
        loadComponent: () =>
          import('../../features/dashboard/pages/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil · SGO Paníssimo',
        data: { breadcrumb: 'Mi perfil' },
        loadComponent: () =>
          import('../../features/account/pages/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'sin-acceso',
        title: 'Sin acceso · SGO Paníssimo',
        data: { breadcrumb: 'Sin acceso' },
        loadComponent: () =>
          import('../../features/account/pages/no-access-page').then((m) => m.NoAccessPage),
      },
      {
        path: 'demo/componentes',
        title: 'Demostración de componentes · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'settings.manage', breadcrumb: 'Demostración de componentes' },
        loadComponent: () =>
          import('../../features/demo/pages/components-demo-page').then(
            (m) => m.ComponentsDemoPage,
          ),
      },
      {
        path: 'inventario',
        data: { breadcrumb: 'Inventario' },
        loadChildren: () =>
          import('../../features/inventory/inventory.routes').then((m) => m.INVENTORY_ROUTES),
      },
      {
        path: 'catalogos',
        data: { breadcrumb: 'Catálogos' },
        loadChildren: () =>
          import('../../features/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
      },
      {
        path: 'produccion',
        data: { breadcrumb: 'Producción' },
        loadChildren: () =>
          import('../../features/production/production.routes').then((m) => m.PRODUCTION_ROUTES),
      },
      {
        path: 'logistica',
        data: { breadcrumb: 'Logística' },
        loadChildren: () =>
          import('../../features/logistics/logistics.routes').then((m) => m.LOGISTICS_ROUTES),
      },
      {
        path: 'ventas',
        data: { breadcrumb: 'Ventas' },
        loadChildren: () => import('../../features/sales/sales.routes').then((m) => m.SALES_ROUTES),
      },
      {
        path: 'compras',
        data: { breadcrumb: 'Compras' },
        loadChildren: () =>
          import('../../features/purchasing/purchasing.routes').then((m) => m.PURCHASING_ROUTES),
      },
      {
        path: 'admin',
        data: { breadcrumb: 'Administración' },
        loadChildren: () => import('../../features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      // Each feature adds its routes with loadChildren and data.permission (permissionGuard) from F-04 on.
      {
        path: '**',
        title: 'En construcción · SGO Paníssimo',
        loadComponent: () => import('./coming-soon-page').then((m) => m.ComingSoonPage),
      },
    ],
  },
];
