import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Logistics (frontend §7.5). F-16 adds the branch orders. */
export const LOGISTICS_ROUTES: Routes = [
  {
    path: 'traspasos',
    canActivate: [permissionGuard],
    data: { permission: 'logistics.view', breadcrumb: 'Traspasos' },
    children: [
      {
        path: '',
        title: 'Traspasos · SGO Paníssimo',
        loadComponent: () => import('./pages/transfers-list-page').then((m) => m.TransfersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.dispatch', breadcrumb: 'Nuevo traspaso' },
        loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
      },
      {
        path: ':id',
        title: 'Traspaso · SGO Paníssimo',
        data: { breadcrumb: 'Traspaso' },
        loadComponent: () =>
          import('./pages/transfer-detail-page').then((m) => m.TransferDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.dispatch', breadcrumb: 'Editar traspaso' },
        loadComponent: () => import('./pages/transfer-form-page').then((m) => m.TransferFormPage),
      },
      {
        path: ':id/recibir',
        title: 'Recibir traspaso · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'logistics.transfers.receive', breadcrumb: 'Recibir' },
        loadComponent: () =>
          import('./pages/transfer-receive-page').then((m) => m.TransferReceivePage),
      },
    ],
  },
];
