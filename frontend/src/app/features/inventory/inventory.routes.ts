import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const view = { canActivate: [permissionGuard], data: { permission: 'inventory.view' } };
const adjust = { canActivate: [permissionGuard], data: { permission: 'inventory.adjust' } };
const consume = { canActivate: [permissionGuard], data: { permission: 'inventory.consumption' } };

export const INVENTORY_ROUTES: Routes = [
  {
    path: 'existencias',
    title: 'Existencias',
    ...view,
    loadComponent: () => import('./pages/stock-page').then((m) => m.StockPage),
  },
  {
    path: 'kardex',
    title: 'Kardex',
    ...view,
    loadComponent: () => import('./pages/kardex-page').then((m) => m.KardexPage),
  },
  {
    path: 'ajustes',
    title: 'Ajustes',
    ...view,
    loadComponent: () => import('./pages/adjustments-list-page').then((m) => m.AdjustmentsListPage),
  },
  {
    path: 'ajustes/nuevo',
    title: 'Nuevo ajuste',
    ...adjust,
    loadComponent: () => import('./pages/adjustment-form-page').then((m) => m.AdjustmentFormPage),
  },
  {
    path: 'ajustes/:id',
    title: 'Ajuste',
    ...view,
    loadComponent: () =>
      import('./pages/adjustment-detail-page').then((m) => m.AdjustmentDetailPage),
  },
  {
    path: 'existencias-iniciales',
    title: 'Existencias iniciales',
    ...adjust,
    loadComponent: () => import('./pages/initial-stock-page').then((m) => m.InitialStockPage),
  },
  {
    path: 'conteos',
    title: 'Conteos físicos',
    ...view,
    loadComponent: () => import('./pages/counts-list-page').then((m) => m.CountsListPage),
  },
  {
    path: 'conteos/:id',
    title: 'Conteo físico',
    ...view,
    loadComponent: () => import('./pages/count-detail-page').then((m) => m.CountDetailPage),
  },
  {
    path: 'consumos',
    title: 'Consumos',
    ...view,
    loadComponent: () =>
      import('./pages/consumptions-list-page').then((m) => m.ConsumptionsListPage),
  },
  {
    path: 'consumos/nuevo',
    title: 'Consumo del día',
    ...consume,
    loadComponent: () => import('./pages/consumption-form-page').then((m) => m.ConsumptionFormPage),
  },
  {
    path: 'consumos/:id',
    title: 'Consumo',
    ...view,
    loadComponent: () =>
      import('./pages/consumption-detail-page').then((m) => m.ConsumptionDetailPage),
  },
];
