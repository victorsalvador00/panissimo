import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const view = { canActivate: [permissionGuard], data: { permission: 'production.view' } };
const manageOrders = {
  canActivate: [permissionGuard],
  data: { permission: 'production.orders.manage' },
};
const completeOrders = {
  canActivate: [permissionGuard],
  data: { permission: 'production.orders.complete' },
};
const manageRecipes = {
  canActivate: [permissionGuard],
  data: { permission: 'production.recipes.manage' },
};

export const PRODUCTION_ROUTES: Routes = [
  {
    path: 'recetas',
    title: 'Recetas',
    ...view,
    loadComponent: () => import('./pages/recipes-list-page').then((m) => m.RecipesListPage),
  },
  {
    path: 'recetas/nueva',
    title: 'Nueva receta',
    ...manageRecipes,
    loadComponent: () => import('./pages/recipe-page').then((m) => m.RecipePage),
  },
  {
    // Quien solo tiene production.view la ve en solo lectura.
    path: 'recetas/:id',
    title: 'Receta',
    ...view,
    loadComponent: () => import('./pages/recipe-page').then((m) => m.RecipePage),
  },
  {
    path: 'ordenes',
    title: 'Órdenes de producción',
    ...view,
    loadComponent: () =>
      import('./pages/production-orders-list-page').then((m) => m.ProductionOrdersListPage),
  },
  {
    path: 'ordenes/nueva',
    title: 'Nueva orden de producción',
    ...manageOrders,
    loadComponent: () =>
      import('./pages/production-order-form-page').then((m) => m.ProductionOrderFormPage),
  },
  {
    path: 'ordenes/:id',
    title: 'Orden de producción',
    ...view,
    loadComponent: () =>
      import('./pages/production-order-detail-page').then((m) => m.ProductionOrderDetailPage),
  },
  {
    path: 'ordenes/:id/editar',
    title: 'Editar orden de producción',
    ...manageOrders,
    loadComponent: () =>
      import('./pages/production-order-form-page').then((m) => m.ProductionOrderFormPage),
  },
  {
    path: 'ordenes/:id/completar',
    title: 'Completar orden de producción',
    ...completeOrders,
    loadComponent: () =>
      import('./pages/production-order-complete-page').then((m) => m.ProductionOrderCompletePage),
  },
];
