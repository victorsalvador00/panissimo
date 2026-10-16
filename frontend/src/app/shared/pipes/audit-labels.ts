import { Pipe, PipeTransform } from '@angular/core';

/**
 * Nombres en español de las entidades que registra la bitácora (`entityType` es el nombre de la clase
 * del backend). Las que no estén aquí se muestran tal cual.
 */
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  AppUser: 'Usuario',
  AppRole: 'Rol',
  RolePermission: 'Permiso de rol',
  'IdentityUserRole`1': 'Rol de usuario',
  UserLocation: 'Ubicación de usuario',
  AppSetting: 'Configuración',
  Location: 'Ubicación',
  UnitOfMeasure: 'Unidad de medida',
  ItemCategory: 'Categoría',
  Item: 'Artículo',
  ItemLocationSetting: 'Mín/máx por ubicación',
  InventoryAdjustment: 'Ajuste de inventario',
  PhysicalCount: 'Conteo físico',
  ConsumptionEntry: 'Consumo',
  Transfer: 'Traspaso',
  BranchOrder: 'Pedido de sucursal',
  Recipe: 'Receta',
  ProductionOrder: 'Orden de producción',
  Supplier: 'Proveedor',
  SupplierItem: 'Artículo de proveedor',
  PurchaseRequisition: 'Requisición',
  PurchaseOrder: 'Orden de compra',
  GoodsReceipt: 'Recepción de compra',
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  Created: 'Creado',
  Updated: 'Modificado',
  Deleted: 'Eliminado',
};

export function auditEntityLabel(entityType: string): string {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

@Pipe({ name: 'auditEntity' })
export class AuditEntityPipe implements PipeTransform {
  transform(entityType: string): string {
    return auditEntityLabel(entityType);
  }
}

@Pipe({ name: 'auditAction' })
export class AuditActionPipe implements PipeTransform {
  transform(action: string): string {
    return auditActionLabel(action);
  }
}
