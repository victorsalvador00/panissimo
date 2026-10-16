/**
 * Ruta de la pantalla de un documento que movió inventario (`sourceDocType` del kardex). Las pantallas
 * que aún no existen devuelven `null` y el folio se muestra sin enlace; cada tarea F-xx agrega la suya.
 */
const DOCUMENT_ROUTES: Record<string, (id: string) => string> = {
  Adjustment: (id) => `/inventario/ajustes/${id}`,
  PhysicalCount: (id) => `/inventario/conteos/${id}`,
  Consumption: (id) => `/inventario/consumos/${id}`,
  Transfer: (id) => `/logistica/traspasos/${id}`,
  ProductionOrder: (id) => `/produccion/ordenes/${id}`,
  GoodsReceipt: (id) => `/compras/recepciones/${id}`,
};

export const DOCUMENT_LABELS: Record<string, string> = {
  Adjustment: 'Ajuste',
  PhysicalCount: 'Conteo físico',
  Consumption: 'Consumo',
  Transfer: 'Traspaso',
  ProductionOrder: 'Orden de producción',
  GoodsReceipt: 'Recepción de compra',
};

export function documentRoute(docType: string, id: string): string | null {
  return DOCUMENT_ROUTES[docType]?.(id) ?? null;
}

export function documentLabel(docType: string): string {
  return DOCUMENT_LABELS[docType] ?? docType;
}
