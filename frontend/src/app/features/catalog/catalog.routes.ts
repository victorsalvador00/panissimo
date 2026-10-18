import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Catalogs (frontend §7.2). */
export const CATALOG_ROUTES: Routes = [
  {
    path: 'ubicaciones',
    title: 'Ubicaciones · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'locations.view', breadcrumb: 'Ubicaciones' },
    loadComponent: () => import('./pages/locations-page').then((m) => m.LocationsPage),
  },
  {
    path: 'articulos',
    canActivate: [permissionGuard],
    data: { permission: 'catalog.view', breadcrumb: 'Artículos' },
    children: [
      {
        path: '',
        title: 'Artículos · SGO Paníssimo',
        loadComponent: () => import('./pages/items-list-page').then((m) => m.ItemsListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo artículo · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'catalog.manage', breadcrumb: 'Nuevo artículo' },
        loadComponent: () => import('./pages/item-form-page').then((m) => m.ItemFormPage),
      },
      {
        path: 'importar',
        title: 'Importar artículos · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'catalog.manage', breadcrumb: 'Importar' },
        loadComponent: () => import('./pages/items-import-page').then((m) => m.ItemsImportPage),
      },
      {
        path: ':id',
        title: 'Artículo · SGO Paníssimo',
        data: { breadcrumb: 'Artículo' },
        loadComponent: () => import('./pages/item-form-page').then((m) => m.ItemFormPage),
      },
    ],
  },
  {
    path: 'categorias',
    title: 'Categorías · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'catalog.view', breadcrumb: 'Categorías' },
    loadComponent: () => import('./pages/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'unidades',
    title: 'Unidades de medida · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'catalog.view', breadcrumb: 'Unidades' },
    loadComponent: () => import('./pages/units-page').then((m) => m.UnitsPage),
  },
];
