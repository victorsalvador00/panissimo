import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Production (frontend §7.4). F-09 onward adds recipes, orders, closes and the plan. */
export const PRODUCTION_ROUTES: Routes = [
  {
    path: 'areas',
    title: 'Áreas de producción · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Áreas' },
    loadComponent: () => import('./pages/areas-page').then((m) => m.AreasPage),
  },
];
