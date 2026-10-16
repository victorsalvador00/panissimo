import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type PurchaseOrderDto = Schemas['PurchaseOrderDto'];
export type PurchaseOrderLine = Schemas['PurchaseOrderLineDto'];
export type PurchaseOrderListItem = Schemas['PurchaseOrderListItemDto'];
export type PurchaseOrdersPage = Schemas['PagedResultOfPurchaseOrderListItemDto'];
export type CreatePurchaseOrderRequest = Schemas['CreatePurchaseOrderRequest'];
export type UpdatePurchaseOrderRequest = Schemas['UpdatePurchaseOrderRequest'];
export type PurchaseOrderLineRequest = Schemas['PurchaseOrderLineRequest'];
export type PurchaseOrderStatus = ApiEnum<'PurchaseOrderStatus'>;

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus | null;
  supplierId?: string | null;
  locationId?: string | null;
  /** Aprobadas o parcialmente recibidas (las que se pueden recibir). */
  pendingReceipt?: boolean | null;
}

/**
 * Órdenes de compra (`purchasing.view`; capturar, enviar, cancelar y cerrar con
 * `purchasing.po.manage`; aprobar y rechazar con `purchasing.po.approve`). Solo con entrega en
 * ubicaciones a tu alcance.
 */
@Injectable({ providedIn: 'root' })
export class PurchaseOrdersApi {
  private readonly http = inject(HttpClient);

  list(
    query: Partial<ListQuery>,
    filters: PurchaseOrderFilters = {},
  ): Observable<PurchaseOrdersPage> {
    return this.http.get<PurchaseOrdersPage>('/purchase-orders', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<PurchaseOrderDto> {
    return this.http.get<PurchaseOrderDto>(`/purchase-orders/${id}`);
  }

  /** Borrador; solo artículos del catálogo activo del proveedor. Precio vacío = el del catálogo (RN-30). */
  create(request: CreatePurchaseOrderRequest): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>('/purchase-orders', request);
  }

  update(id: string, request: UpdatePurchaseOrderRequest): Observable<PurchaseOrderDto> {
    return this.http.put<PurchaseOrderDto>(`/purchase-orders/${id}`, request);
  }

  /** RN-31: por encima del umbral queda por aprobar; si no, aprobada. */
  submit(id: string, version: number): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>(`/purchase-orders/${id}/submit`, { version });
  }

  approve(id: string, version: number): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>(`/purchase-orders/${id}/approve`, { version });
  }

  /** El rechazo es final. */
  reject(id: string, version: number, reason: string): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>(`/purchase-orders/${id}/reject`, { version, reason });
  }

  cancel(id: string, version: number): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>(`/purchase-orders/${id}/cancel`, { version });
  }

  /** Solo parcialmente recibida: abandona el saldo pendiente (RN-32). */
  close(id: string, version: number): Observable<PurchaseOrderDto> {
    return this.http.post<PurchaseOrderDto>(`/purchase-orders/${id}/close`, { version });
  }
}
