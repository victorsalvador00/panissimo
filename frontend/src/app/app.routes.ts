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
    canActivate: [authGuard],
    loadChildren: () => import('./core/layout/shell.routes').then((m) => m.SHELL_ROUTES),
  },
];
