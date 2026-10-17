import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/guards';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · SGO Paníssimo',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/account/pages/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    // Lazy too: the login does not download the shell (sidebar, menus, select).
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Inicio · SGO Paníssimo',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'perfil',
        title: 'Mi perfil · SGO Paníssimo',
        loadComponent: () =>
          import('./features/account/pages/profile-page').then((m) => m.ProfilePage),
      },
      {
        path: 'sin-acceso',
        title: 'Sin acceso · SGO Paníssimo',
        loadComponent: () =>
          import('./features/account/pages/no-access-page').then((m) => m.NoAccessPage),
      },
      // Each feature adds its routes with loadChildren and data.permission (permissionGuard) from F-04 on.
      {
        path: '**',
        title: 'En construcción · SGO Paníssimo',
        loadComponent: () => import('./core/layout/coming-soon-page').then((m) => m.ComingSoonPage),
      },
    ],
  },
];
