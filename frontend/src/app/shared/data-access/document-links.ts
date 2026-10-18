/**
 * Route of the screen that shows a document, by the type the backend writes in the movements (`sourceDocType`).
 * Null for the documents without a screen yet; the folio is shown without a link.
 */
const ROUTES: Record<string, string> = {
  Adjustment: '/inventario/ajustes',
  PhysicalCount: '/inventario/conteos',
  Consumption: '/inventario/consumos',
  Transfer: '/logistica/traspasos',
  InternalTransfer: '/inventario/vales-internos',
  BranchOrder: '/logistica/pedidos',
  ProductionOrder: '/produccion/ordenes',
  ProductionClose: '/produccion/cierres',
  ProductionOrderImport: '/produccion/importaciones',
  PurchaseOrder: '/compras/ordenes',
  GoodsReceipt: '/compras/recepciones',
  CustomerOrder: '/ventas/pedidos',
  CustomerShipment: '/ventas/remisiones',
};

/** Screens already built (they grow task by task, frontend §11). */
const AVAILABLE = new Set([
  'Adjustment',
  'PhysicalCount',
  'Consumption',
  'Transfer',
  'InternalTransfer',
  'BranchOrder',
  'ProductionOrder',
  'ProductionClose',
  'ProductionOrderImport',
  'PurchaseOrder',
  'GoodsReceipt',
  'CustomerOrder',
  'CustomerShipment',
]);

export function documentLink(docType: string, id: string): string[] | null {
  const route = ROUTES[docType];
  return route && AVAILABLE.has(docType) ? [route, id] : null;
}
