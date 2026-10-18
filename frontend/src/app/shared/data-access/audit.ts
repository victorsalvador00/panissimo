import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../core/api/api';
import { ListQuery, Page, ParamValues, toHttpParams } from './list-query';

export type AuditEntry = Schemas['AuditLogDto'];

export interface AuditFilters extends ParamValues {
  entityType?: string | null;
  /** History of one record, including its roles, locations or permissions. */
  entityId?: string | null;
  userId?: string | null;
  /** ISO date-time. */
  from?: string | null;
  to?: string | null;
}

/** The audit log (RN-41), newest first. */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: AuditFilters = {}): Observable<Page<AuditEntry>> {
    return this.http.get<Page<AuditEntry>>('audit-log', { params: toHttpParams(query, filters) });
  }
}

export const AUDIT_ACTIONS: Record<string, string> = {
  Created: 'Alta',
  Updated: 'Cambio',
  Deleted: 'Baja',
  // RN-109: a lot traceability query leaves its trace (entry, direction and nodes).
  Queried: 'Consulta',
};

/** Spanish names of the audited entities (the backend sends the class name). */
export const AUDIT_ENTITIES: Record<string, string> = {
  AppUser: 'Usuario',
  AppRole: 'Rol',
  'IdentityUserRole`1': 'Rol de usuario',
  UserLocation: 'Ubicación de usuario',
  RolePermission: 'Permiso de rol',
  AppSetting: 'Configuración',
  Location: 'Ubicación',
  Item: 'Artículo',
  ItemCategory: 'Categoría',
  UnitOfMeasure: 'Unidad de medida',
  ItemLocationSetting: 'Mínimo y máximo por ubicación',
  ProductionArea: 'Área de producción',
  Recipe: 'Receta',
  ProductionOrder: 'Orden de producción',
  ProductionClose: 'Cierre de producción',
  ProductionOrderImport: 'Importación de OP',
  InventoryAdjustment: 'Ajuste de inventario',
  PhysicalCount: 'Conteo físico',
  ConsumptionEntry: 'Consumo de sucursal',
  Transfer: 'Traspaso',
  BranchOrder: 'Pedido de sucursal',
  Customer: 'Cliente',
  CustomerDeliveryPoint: 'Punto de entrega',
  CustomerItem: 'Artículo de cliente',
  CustomerOrder: 'Pedido de cliente',
  CustomerShipment: 'Remisión',
  Supplier: 'Proveedor',
  SupplierItem: 'Artículo de proveedor',
  PurchaseRequisition: 'Requisición',
  PurchaseOrder: 'Orden de compra',
  GoodsReceipt: 'Recepción de compra',
  Traceability: 'Trazabilidad',
};

/** Labels of the fields that appear most; the rest show their own name. */
const FIELD_LABELS: Record<string, string> = {
  Name: 'Nombre',
  FullName: 'Nombre',
  Email: 'Correo',
  UserName: 'Usuario',
  IsActive: 'Activo',
  Description: 'Descripción',
  Code: 'Código',
  Value: 'Valor',
  Address: 'Dirección',
  DefaultLocationId: 'Ubicación default',
  RoleId: 'Rol',
  UserId: 'Usuario',
  LocationId: 'Ubicación',
  Permission: 'Permiso',
  PermissionCode: 'Permiso',
  Status: 'Estado',
  Notes: 'Notas',
  Reason: 'Motivo',
  Sku: 'SKU',
  InternalSku: 'SKU interno',
  Type: 'Tipo',
  Presentation: 'Presentación',
  Quantity: 'Cantidad',
  Qty: 'Cantidad',
  MinQty: 'Mínimo',
  MaxQty: 'Máximo',
  LockoutEnd: 'Bloqueado hasta',
  AccessFailedCount: 'Intentos fallidos',
};

/** Internal fields (keys, Identity bookkeeping) that say nothing to the user. */
const HIDDEN_FIELDS = new Set([
  'Id',
  'NormalizedEmail',
  'NormalizedUserName',
  'NormalizedName',
  'EmailConfirmed',
  'PhoneNumber',
  'PhoneNumberConfirmed',
  'TwoFactorEnabled',
  'LockoutEnabled',
  'SecurityStamp',
  'ConcurrencyStamp',
  'PasswordHash',
]);

export interface ChangeRow {
  field: string;
  before: string;
  after: string;
}

/**
 * The `changes` of an entry as rows: a create lists the new values, a delete the old ones and an update each changed
 * field with `{ old, new }`.
 */
export function formatChanges(action: string, changes: unknown): ChangeRow[] {
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes as Record<string, unknown>)
    .filter(([key]) => !HIDDEN_FIELDS.has(key.charAt(0).toUpperCase() + key.slice(1)))
    .map(([key, value]) => {
      const field = fieldLabel(key);
      if (action === 'Updated' && value && typeof value === 'object' && 'new' in value) {
        const pair = value as { old?: unknown; new?: unknown };
        return { field, before: formatValue(pair.old), after: formatValue(pair.new) };
      }
      return action === 'Deleted'
        ? { field, before: formatValue(value), after: '' }
        : { field, before: '', after: formatValue(value) };
    });
}

export function fieldLabel(key: string): string {
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  return FIELD_LABELS[pascal] ?? pascal;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
