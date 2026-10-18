import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Production (frontend §7.4). F-10 onward adds orders, closes and the plan. */
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
    path: 'areas',
    title: 'Áreas de producción · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'production.view', breadcrumb: 'Áreas' },
    loadComponent: () => import('./pages/areas-page').then((m) => m.AreasPage),
  },
];
