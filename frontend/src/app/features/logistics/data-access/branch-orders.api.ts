import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type BranchOrderDto = Schemas['BranchOrderDto'];
export type BranchOrderLine = Schemas['BranchOrderLineDto'];
export type BranchOrderListItem = Schemas['BranchOrderListItemDto'];
export type BranchOrdersPage = Schemas['PagedResultOfBranchOrderListItemDto'];
export type BranchOrderSuggestion = Schemas['BranchOrderSuggestionDto'];
export type CreateBranchOrderRequest = Schemas['CreateBranchOrderRequest'];
export type UpdateBranchOrderRequest = Schemas['UpdateBranchOrderRequest'];
export type BranchOrderLineRequest = Schemas['BranchOrderLineRequest'];
export type ApproveBranchOrderRequest = Schemas['ApproveBranchOrderRequest'];
export type BranchOrderStatus = ApiEnum<'BranchOrderStatus'>;

export interface BranchOrderFilters {
  status?: BranchOrderStatus | null;
  requestingLocationId?: string | null;
  supplyingLocationId?: string | null;
  /** Sucursal u origen. */
  locationId?: string | null;
}

/**
 * Pedidos de sucursal (ver: `logistics.view`; capturar, enviar y cancelar:
 * `logistics.orders.create`; aprobar y rechazar: `logistics.orders.approve`). RN-20 y RN-24.
 */
@Injectable({ providedIn: 'root' })
export class BranchOrdersApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: BranchOrderFilters = {}): Observable<BranchOrdersPage> {
    return this.http.get<BranchOrdersPage>('/branch-orders', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<BranchOrderDto> {
    return this.http.get<BranchOrderDto>(`/branch-orders/${id}`);
  }

  /** Sugerido por mín/máx de la sucursal (solo artículos en o por debajo de su mínimo). */
  suggestion(locationId: string): Observable<BranchOrderSuggestion[]> {
    return this.http.get<BranchOrderSuggestion[]>('/branch-orders/suggestion', {
      params: toHttpParams({}, { locationId }),
    });
  }

  create(request: CreateBranchOrderRequest): Observable<BranchOrderDto> {
    return this.http.post<BranchOrderDto>('/branch-orders', request);
  }

  update(id: string, request: UpdateBranchOrderRequest): Observable<BranchOrderDto> {
    return this.http.put<BranchOrderDto>(`/branch-orders/${id}`, request);
  }

  submit(id: string, version: number): Observable<BranchOrderDto> {
    return this.http.post<BranchOrderDto>(`/branch-orders/${id}/submit`, { version });
  }

  /** Solo en borrador o enviado; uno aprobado se cancela cancelando su traspaso en borrador. */
  cancel(id: string, version: number): Observable<BranchOrderDto> {
    return this.http.post<BranchOrderDto>(`/branch-orders/${id}/cancel`, { version });
  }

  /** RN-20: aprueba con la cantidad de cada línea y crea el traspaso en borrador. */
  approve(id: string, request: ApproveBranchOrderRequest): Observable<BranchOrderDto> {
    return this.http.post<BranchOrderDto>(`/branch-orders/${id}/approve`, request);
  }

  reject(id: string, version: number, reason: string): Observable<BranchOrderDto> {
    return this.http.post<BranchOrderDto>(`/branch-orders/${id}/reject`, { version, reason });
  }
}
