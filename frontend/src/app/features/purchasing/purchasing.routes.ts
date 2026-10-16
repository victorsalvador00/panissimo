import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/auth/auth.guards';

const view = { canActivate: [permissionGuard], data: { permission: 'purchasing.view' } };
const manageRequisitions = {
  canActivate: [permissionGuard],
  data: { permission: 'purchasing.requisitions.manage' },
};
const managePurchaseOrders = {
  canActivate: [permissionGuard],
  data: { permission: 'purchasing.po.manage' },
};
const receive = { canActivate: [permissionGuard], data: { permission: 'purchasing.receive' } };
const manageSuppliers = {
  canActivate: [permissionGuard],
  data: { permission: 'purchasing.suppliers.manage' },
};

export const PURCHASING_ROUTES: Routes = [
  {
    path: 'proveedores',
    title: 'Proveedores',
    ...view,
    loadComponent: () => import('./pages/suppliers-list-page').then((m) => m.SuppliersListPage),
  },
  {
    path: 'proveedores/nuevo',
    title: 'Nuevo proveedor',
    ...manageSuppliers,
    loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
  },
  {
    // Quien solo tiene purchasing.view lo ve en solo lectura.
    path: 'proveedores/:id',
    title: 'Proveedor',
    ...view,
    loadComponent: () => import('./pages/supplier-form-page').then((m) => m.SupplierFormPage),
  },
  {
    path: 'requisiciones',
    title: 'Requisiciones',
    ...view,
    loadComponent: () =>
      import('./pages/requisitions-list-page').then((m) => m.RequisitionsListPage),
  },
  {
    path: 'requisiciones/nueva',
    title: 'Nueva requisición',
    ...manageRequisitions,
    loadComponent: () => import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
  },
  {
    path: 'requisiciones/:id',
    title: 'Requisición',
    ...view,
    loadComponent: () =>
      import('./pages/requisition-detail-page').then((m) => m.RequisitionDetailPage),
  },
  {
    path: 'requisiciones/:id/editar',
    title: 'Editar requisición',
    ...manageRequisitions,
    loadComponent: () => import('./pages/requisition-form-page').then((m) => m.RequisitionFormPage),
  },
  {
    path: 'ordenes',
    title: 'Órdenes de compra',
    ...view,
    loadComponent: () =>
      import('./pages/purchase-orders-list-page').then((m) => m.PurchaseOrdersListPage),
  },
  {
    path: 'ordenes/nueva',
    title: 'Nueva orden de compra',
    ...managePurchaseOrders,
    loadComponent: () =>
      import('./pages/purchase-order-form-page').then((m) => m.PurchaseOrderFormPage),
  },
  {
    // Quien solo tiene purchasing.view (ej. almacén, que recibe) la ve en solo lectura.
    path: 'ordenes/:id',
    title: 'Orden de compra',
    ...view,
    loadComponent: () =>
      import('./pages/purchase-order-detail-page').then((m) => m.PurchaseOrderDetailPage),
  },
  {
    path: 'ordenes/:id/editar',
    title: 'Editar orden de compra',
    ...managePurchaseOrders,
    loadComponent: () =>
      import('./pages/purchase-order-form-page').then((m) => m.PurchaseOrderFormPage),
  },
  {
    path: 'recepciones',
    title: 'Recepciones',
    ...view,
    loadComponent: () =>
      import('./pages/goods-receipts-list-page').then((m) => m.GoodsReceiptsListPage),
  },
  {
    path: 'recepciones/nueva',
    title: 'Recibir orden de compra',
    ...receive,
    loadComponent: () =>
      import('./pages/goods-receipt-form-page').then((m) => m.GoodsReceiptFormPage),
  },
  {
    path: 'recepciones/:id',
    title: 'Recepción',
    ...view,
    loadComponent: () =>
      import('./pages/goods-receipt-detail-page').then((m) => m.GoodsReceiptDetailPage),
  },
];
