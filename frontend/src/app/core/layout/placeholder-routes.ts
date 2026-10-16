import { Route } from '@angular/router';
import { permissionGuard } from '../auth/auth.guards';

/**
 * Ruta de una pantalla que llega en una tarea posterior: ya exige su permiso real y muestra
 * "Esta sección estará disponible pronto". Cada tarea F-xx la reemplaza por la pantalla real.
 */
export function placeholderRoute(path: string, title: string, permission: string): Route {
  return {
    path,
    title,
    canActivate: [permissionGuard],
    data: { permission },
    loadComponent: () => import('./pages/coming-soon-page').then((m) => m.ComingSoonPage),
  };
}
