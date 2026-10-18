import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Administration (frontend §7.8). */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'usuarios',
    canActivate: [permissionGuard],
    data: { permission: 'security.users.manage', breadcrumb: 'Usuarios' },
    children: [
      {
        path: '',
        title: 'Usuarios · SGO Paníssimo',
        loadComponent: () => import('./pages/users-list-page').then((m) => m.UsersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo usuario · SGO Paníssimo',
        data: { breadcrumb: 'Nuevo usuario' },
        loadComponent: () => import('./pages/user-form-page').then((m) => m.UserFormPage),
      },
      {
        path: ':id',
        title: 'Usuario · SGO Paníssimo',
        data: { breadcrumb: 'Usuario' },
        loadComponent: () => import('./pages/user-form-page').then((m) => m.UserFormPage),
      },
    ],
  },
  {
    path: 'roles',
    canActivate: [permissionGuard],
    data: { permission: 'security.roles.manage', breadcrumb: 'Roles' },
    children: [
      {
        path: '',
        title: 'Roles · SGO Paníssimo',
        loadComponent: () => import('./pages/roles-list-page').then((m) => m.RolesListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo rol · SGO Paníssimo',
        data: { breadcrumb: 'Nuevo rol' },
        loadComponent: () => import('./pages/role-form-page').then((m) => m.RoleFormPage),
      },
      {
        path: ':id',
        title: 'Rol · SGO Paníssimo',
        data: { breadcrumb: 'Rol' },
        loadComponent: () => import('./pages/role-form-page').then((m) => m.RoleFormPage),
      },
    ],
  },
  {
    path: 'bitacora',
    title: 'Bitácora · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'security.audit.view', breadcrumb: 'Bitácora' },
    loadComponent: () => import('./pages/audit-page').then((m) => m.AuditPage),
  },
  {
    path: 'configuracion',
    title: 'Configuración · SGO Paníssimo',
    canActivate: [permissionGuard],
    data: { permission: 'settings.manage', breadcrumb: 'Configuración' },
    loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage),
  },
];
