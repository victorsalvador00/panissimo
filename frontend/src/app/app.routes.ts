import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión',
    canActivate: [guestGuard],
    loadComponent: () => import('./core/auth/pages/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
      },
      {
        path: 'perfil',
        title: 'Cambiar contraseña',
        loadComponent: () =>
          import('./core/auth/pages/change-password-page').then((m) => m.ChangePasswordPage),
      },
      {
        path: 'sin-acceso',
        title: 'Sin acceso',
        loadComponent: () =>
          import('./core/layout/pages/no-access-page').then((m) => m.NoAccessPage),
      },
      {
        path: 'inventario',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then((m) => m.INVENTORY_ROUTES),
      },
      {
        path: 'logistica',
        loadChildren: () =>
          import('./features/logistics/logistics.routes').then((m) => m.LOGISTICS_ROUTES),
      },
      {
        path: 'produccion',
        loadChildren: () =>
          import('./features/production/production.routes').then((m) => m.PRODUCTION_ROUTES),
      },
      {
        path: 'compras',
        loadChildren: () =>
          import('./features/purchasing/purchasing.routes').then((m) => m.PURCHASING_ROUTES),
      },
      {
        path: 'catalogos',
        loadChildren: () =>
          import('./features/catalog/catalog.routes').then((m) => m.CATALOG_ROUTES),
      },
      {
        // Catálogo interno de componentes compartidos (F-03); solo administradores.
        path: 'demo/componentes',
        title: 'Componentes',
        canActivate: [permissionGuard],
        data: { permission: 'settings.manage' },
        loadComponent: () =>
          import('./features/demo/pages/components-demo-page').then((m) => m.ComponentsDemoPage),
      },
      {
        path: 'admin',
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
