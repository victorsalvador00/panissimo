import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const view = { canActivate: [permissionGuard], data: { permission: 'catalog.view' } };
const manage = { canActivate: [permissionGuard], data: { permission: 'catalog.manage' } };

export const CATALOG_ROUTES: Routes = [
  {
    path: 'ubicaciones',
    title: 'Ubicaciones',
    canActivate: [permissionGuard],
    data: { permission: 'locations.view' },
    loadComponent: () => import('./pages/locations-page').then((m) => m.LocationsPage),
  },
  {
    path: 'categorias',
    title: 'Categorías',
    ...view,
    loadComponent: () => import('./pages/categories-page').then((m) => m.CategoriesPage),
  },
  {
    path: 'unidades',
    title: 'Unidades',
    ...view,
    loadComponent: () => import('./pages/units-page').then((m) => m.UnitsPage),
  },
  {
    path: 'articulos',
    title: 'Artículos',
    ...view,
    loadComponent: () => import('./pages/items-list-page').then((m) => m.ItemsListPage),
  },
  {
    path: 'articulos/importar',
    title: 'Importar artículos',
    ...manage,
    loadComponent: () => import('./pages/item-import-page').then((m) => m.ItemImportPage),
  },
  {
    path: 'articulos/nuevo',
    title: 'Nuevo artículo',
    ...manage,
    loadComponent: () => import('./pages/item-form-page').then((m) => m.ItemFormPage),
  },
  {
    path: 'articulos/:id',
    title: 'Artículo',
    ...manage,
    loadComponent: () => import('./pages/item-form-page').then((m) => m.ItemFormPage),
  },
];
