import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const users = { canActivate: [permissionGuard], data: { permission: 'security.users.manage' } };
const roles = { canActivate: [permissionGuard], data: { permission: 'security.roles.manage' } };

export const ADMIN_ROUTES: Routes = [
  {
    path: 'usuarios',
    title: 'Usuarios',
    ...users,
    loadComponent: () => import('./pages/users-list-page').then((m) => m.UsersListPage),
  },
  {
    path: 'usuarios/nuevo',
    title: 'Nuevo usuario',
    ...users,
    loadComponent: () => import('./pages/user-form-page').then((m) => m.UserFormPage),
  },
  {
    path: 'usuarios/:id',
    title: 'Usuario',
    ...users,
    loadComponent: () => import('./pages/user-form-page').then((m) => m.UserFormPage),
  },
  {
    path: 'roles',
    title: 'Roles',
    ...roles,
    loadComponent: () => import('./pages/roles-list-page').then((m) => m.RolesListPage),
  },
  {
    path: 'roles/nuevo',
    title: 'Nuevo rol',
    ...roles,
    loadComponent: () => import('./pages/role-form-page').then((m) => m.RoleFormPage),
  },
  {
    path: 'roles/:id',
    title: 'Rol',
    ...roles,
    loadComponent: () => import('./pages/role-form-page').then((m) => m.RoleFormPage),
  },
  {
    path: 'bitacora',
    title: 'Bitácora',
    canActivate: [permissionGuard],
    data: { permission: 'security.audit.view' },
    loadComponent: () => import('./pages/audit-log-page').then((m) => m.AuditLogPage),
  },
  {
    path: 'configuracion',
    title: 'Configuración',
    canActivate: [permissionGuard],
    data: { permission: 'settings.manage' },
    loadComponent: () => import('./pages/settings-page').then((m) => m.SettingsPage),
  },
];
