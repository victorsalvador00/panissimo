import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/guards';

/** Purchasing (frontend §7.6). */
export const PURCHASING_ROUTES: Routes = [
  {
    path: 'requerimiento',
    title: 'Requerimiento de materia prima · SGO Paníssimo',
    canActivate: [permissionGuard],
    // Purchasing or production (frontend §7.6).
    data: {
      permission: ['purchasing.view', 'production.view'],
      breadcrumb: 'Requerimiento',
    },
    loadComponent: () => import('./pages/requirement-page').then((m) => m.RequirementPage),
  },
  {
    path: 'proveedores',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Proveedores' },
    children: [
      {
        path: '',
        title: 'Proveedores · SGO Paníssimo',
        loadComponent: () => import('./pages/suppliers-list-page').then((m) => m.SuppliersListPage),
      },
      {
        path: 'nuevo',
        title: 'Nuevo proveedor · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.suppliers.manage', breadcrumb: 'Nuevo proveedor' },
        loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
      },
      {
        path: ':id',
        title: 'Proveedor · SGO Paníssimo',
        data: { breadcrumb: 'Proveedor' },
        loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
      },
    ],
  },
  {
    path: 'requisiciones',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Requisiciones' },
    children: [
      {
        path: '',
        title: 'Requisiciones · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/requisitions-list-page').then((m) => m.RequisitionsListPage),
      },
      {
        path: 'nueva',
        title: 'Nueva requisición · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.requisitions.manage', breadcrumb: 'Nueva requisición' },
        loadComponent: () =>
          import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
      },
      {
        path: ':id',
        title: 'Requisición · SGO Paníssimo',
        data: { breadcrumb: 'Requisición' },
        loadComponent: () =>
          import('./pages/requisition-detail-page').then((m) => m.RequisitionDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar requisición · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.requisitions.manage', breadcrumb: 'Editar requisición' },
        loadComponent: () =>
          import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
      },
    ],
  },
  {
    path: 'ordenes',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Órdenes de compra' },
    children: [
      {
        path: '',
        title: 'Órdenes de compra · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/purchase-orders-list-page').then((m) => m.PurchaseOrdersListPage),
      },
      {
        path: 'nueva',
        title: 'Nueva orden de compra · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.po.manage', breadcrumb: 'Nueva orden' },
        loadComponent: () =>
          import('./pages/purchase-order-form-page').then((m) => m.PurchaseOrderFormPage),
      },
      {
        path: ':id',
        title: 'Orden de compra · SGO Paníssimo',
        data: { breadcrumb: 'Orden de compra' },
        loadComponent: () =>
          import('./pages/purchase-order-detail-page').then((m) => m.PurchaseOrderDetailPage),
      },
      {
        path: ':id/editar',
        title: 'Editar orden de compra · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.po.manage', breadcrumb: 'Editar orden' },
        loadComponent: () =>
          import('./pages/purchase-order-form-page').then((m) => m.PurchaseOrderFormPage),
      },
    ],
  },
  {
    path: 'recepciones',
    canActivate: [permissionGuard],
    data: { permission: 'purchasing.view', breadcrumb: 'Recepciones' },
    children: [
      {
        path: '',
        title: 'Recepciones de compra · SGO Paníssimo',
        loadComponent: () =>
          import('./pages/goods-receipts-list-page').then((m) => m.GoodsReceiptsListPage),
      },
      {
        path: 'nueva',
        title: 'Recibir orden de compra · SGO Paníssimo',
        canActivate: [permissionGuard],
        data: { permission: 'purchasing.receive', breadcrumb: 'Recibir' },
        loadComponent: () => import('./pages/goods-receipt-page').then((m) => m.GoodsReceiptPage),
      },
      {
        path: ':id',
        title: 'Recepción de compra · SGO Paníssimo',
        data: { breadcrumb: 'Recepción' },
        loadComponent: () =>
          import('./pages/goods-receipt-detail-page').then((m) => m.GoodsReceiptDetailPage),
      },
    ],
  },
];
