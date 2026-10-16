import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type ProductionOrderDto = Schemas['ProductionOrderDto'];
export type ProductionOrderLine = Schemas['ProductionOrderLineDto'];
export type ProductionOrderListItem = Schemas['ProductionOrderListItemDto'];
export type ProductionOrdersPage = Schemas['PagedResultOfProductionOrderListItemDto'];
export type CreateProductionOrderRequest = Schemas['CreateProductionOrderRequest'];
export type UpdateProductionOrderRequest = Schemas['UpdateProductionOrderRequest'];
export type CompleteProductionOrderRequest = Schemas['CompleteProductionOrderRequest'];
export type CompleteLineRequest = Schemas['CompleteLineRequest'];
export type ProductionOrderStatus = ApiEnum<'ProductionOrderStatus'>;

export interface ProductionOrderFilters {
  locationId?: string | null;
  status?: ProductionOrderStatus | null;
  /** Fecha programada, `yyyy-MM-dd`. */
  from?: string | null;
  to?: string | null;
}

/**
 * Órdenes de producción (ver: `production.view`; crear, editar, liberar y cancelar:
 * `production.orders.manage`; completar: `production.orders.complete`). RN-10 a RN-14.
 */
@Injectable({ providedIn: 'root' })
export class ProductionOrdersApi {
  private readonly http = inject(HttpClient);

  list(
    query: Partial<ListQuery>,
    filters: ProductionOrderFilters = {},
  ): Observable<ProductionOrdersPage> {
    return this.http.get<ProductionOrdersPage>('/production-orders', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<ProductionOrderDto> {
    return this.http.get<ProductionOrderDto>(`/production-orders/${id}`);
  }

  /** Borrador con la receta activa del producto (queda fija en la orden, RN-10). */
  create(request: CreateProductionOrderRequest): Observable<ProductionOrderDto> {
    return this.http.post<ProductionOrderDto>('/production-orders', request);
  }

  update(id: string, request: UpdateProductionOrderRequest): Observable<ProductionOrderDto> {
    return this.http.put<ProductionOrderDto>(`/production-orders/${id}`, request);
  }

  release(id: string, version: number): Observable<ProductionOrderDto> {
    return this.http.post<ProductionOrderDto>(`/production-orders/${id}/release`, { version });
  }

  cancel(id: string, version: number): Observable<ProductionOrderDto> {
    return this.http.post<ProductionOrderDto>(`/production-orders/${id}/cancel`, { version });
  }

  /** RN-12 en una transacción. 409 `insufficient_stock` si falta existencia de algún componente. */
  complete(id: string, request: CompleteProductionOrderRequest): Observable<ProductionOrderDto> {
    return this.http.post<ProductionOrderDto>(`/production-orders/${id}/complete`, request);
  }
}
