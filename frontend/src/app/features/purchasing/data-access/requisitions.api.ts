import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type RequisitionDto = Schemas['RequisitionDto'];
export type RequisitionLine = Schemas['RequisitionLineDto'];
export type RequisitionListItem = Schemas['RequisitionListItemDto'];
export type RequisitionsPage = Schemas['PagedResultOfRequisitionListItemDto'];
export type CreateRequisitionRequest = Schemas['CreateRequisitionRequest'];
export type UpdateRequisitionRequest = Schemas['UpdateRequisitionRequest'];
export type RequisitionLineRequest = Schemas['RequisitionLineRequest'];
export type RequisitionStatus = ApiEnum<'RequisitionStatus'>;
export type PurchaseOrderListItem = Schemas['PurchaseOrderListItemDto'];

export interface RequisitionFilters {
  status?: RequisitionStatus | null;
  locationId?: string | null;
}

/**
 * Requisiciones de compra (`purchasing.view`; crear/editar/enviar/cancelar con
 * `purchasing.requisitions.manage`, aprobar/rechazar con `purchasing.po.approve` y convertir a OC
 * con `purchasing.po.manage`). Solo de ubicaciones a tu alcance.
 */
@Injectable({ providedIn: 'root' })
export class RequisitionsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: RequisitionFilters = {}): Observable<RequisitionsPage> {
    return this.http.get<RequisitionsPage>('/requisitions', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<RequisitionDto> {
    return this.http.get<RequisitionDto>(`/requisitions/${id}`);
  }

  /** Borrador; solo fábrica o comisariato. Una línea sin proveedor toma el preferido del artículo. */
  create(request: CreateRequisitionRequest): Observable<RequisitionDto> {
    return this.http.post<RequisitionDto>('/requisitions', request);
  }

  update(id: string, request: UpdateRequisitionRequest): Observable<RequisitionDto> {
    return this.http.put<RequisitionDto>(`/requisitions/${id}`, request);
  }

  /** 422 si alguna línea no tiene proveedor sugerido. */
  submit(id: string, version: number): Observable<RequisitionDto> {
    return this.http.post<RequisitionDto>(`/requisitions/${id}/submit`, { version });
  }

  approve(id: string, version: number): Observable<RequisitionDto> {
    return this.http.post<RequisitionDto>(`/requisitions/${id}/approve`, { version });
  }

  reject(id: string, version: number, reason: string): Observable<RequisitionDto> {
    return this.http.post<RequisitionDto>(`/requisitions/${id}/reject`, { version, reason });
  }

  cancel(id: string, version: number): Observable<RequisitionDto> {
    return this.http.post<RequisitionDto>(`/requisitions/${id}/cancel`, { version });
  }

  /** RN-34: una OC en borrador por proveedor sugerido y ubicación de entrega. Todo o nada. */
  convert(requisitionIds: string[]): Observable<PurchaseOrderListItem[]> {
    return this.http.post<PurchaseOrderListItem[]>('/requisitions/convert', { requisitionIds });
  }
}
