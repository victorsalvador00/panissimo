import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Production (frontend §7.4). F-11 onward adds the closes, the import and the plan. */
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
