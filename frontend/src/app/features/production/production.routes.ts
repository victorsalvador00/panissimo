import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Production (frontend §7.4). F-19 adds the plan and F-21 the summary. */
export const PRODUCTION_ROUTES: Routes = [
  {
    path: 'recetas',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Recetas' },
    children: [
      {
        path: '',
        title: 'Recetas · SGO Paníssimo',
        loadComponent: () => import('./pages/recipes-list-page').then((m) => m.RecipesListPage),
      },
      {
        path: 'nueva',
        title: 'Nueva receta · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'production.recipes.manage', breadcrumb: 'Nueva receta' },
        loadComponent: () => import('./pages/recipe-form-page').then((m) => m.RecipeFormPage),
      },
      {
        path: ':id',
        title: 'Receta · SGO Paníssimo',
        data: { breadcrumb: 'Receta' },
        loadComponent: () => import('./pages/recipe-form-page').then((m) => m.RecipeFormPage),
      },
    ],
  },
  {
    path: 'ordenes',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Órdenes' },
    children: [
      {
        path: '',
        title: 'Órdenes de producción · SGO Paníssimo',
        loadComponent: () => import('./pages/orders-list-page').then((m) => m.OrdersListPage),
      },
      {
        path: 'nueva',
        title: 'Nueva orden · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'production.orders.manage', breadcrumb: 'Nueva orden' },
        loadComponent: () => import('./pages/order-form-page').then((m) => m.OrderFormPage),
      },
      {
        path: ':id',
        title: 'Orden de producción · SGO Paníssimo',
        data: { breadcrumb: 'Orden' },
        loadComponent: () => import('./pages/order-detail-page').then((m) => m.OrderDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar orden · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'production.orders.manage', breadcrumb: 'Editar orden' },
        loadComponent: () => import('./pages/order-form-page').then((m) => m.OrderFormPage),
      },
      {
        path: ':id/cerrar',
        title: 'Cierre de producción · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'production.orders.close', breadcrumb: 'Cierre' },
        loadComponent: () => import('./pages/close-page').then((m) => m.ClosePage),
      },
    ],
  },
  {
    path: 'cierres',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Cierres' },
    children: [
      {
        path: '',
        title: 'Cierres de producción · SGO Paníssimo',
        loadComponent: () => import('./pages/closes-list-page').then((m) => m.ClosesListPage),
      },
      {
        path: ':id',
        title: 'Cierre · SGO Paníssimo',
        data: { breadcrumb: 'Cierre' },
        loadComponent: () => import('./pages/close-detail-page').then((m) => m.CloseDetailPage),
      },
    ],
  },
  {
    path: 'importar',
    title: 'Importar órdenes · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'production.orders.import', breadcrumb: 'Importar órdenes' },
    loadComponent: () => import('./pages/orders-import-page').then((m) => m.OrdersImportPage),
  },
  {
    path: 'importaciones',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Importaciones' },
    children: [
      {
        path: '',
        title: 'Importaciones de órdenes · SGO Paníssimo',
        loadComponent: () => import('./pages/imports-list-page').then((m) => m.ImportsListPage),
      },
      {
        path: ':id',
        title: 'Importación · SGO Paníssimo',
        data: { breadcrumb: 'Importación' },
        loadComponent: () => import('./pages/import-detail-page').then((m) => m.ImportDetailPage),
      },
    ],
  },
  {
    path: 'areas',
    title: 'Áreas de producción · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Áreas' },
    loadComponent: () => import('./pages/areas-page').then((m) => m.AreasPage),
  },
];
