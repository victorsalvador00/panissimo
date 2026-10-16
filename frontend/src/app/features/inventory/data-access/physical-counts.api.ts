import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type PhysicalCountDto = Schemas['PhysicalCountDto'];
export type PhysicalCountLine = Schemas['PhysicalCountLineDto'];
export type PhysicalCountListItem = Schemas['PhysicalCountListItemDto'];
export type PhysicalCountsPage = Schemas['PagedResultOfPhysicalCountListItemDto'];
export type CreatePhysicalCountRequest = Schemas['CreatePhysicalCountRequest'];
export type UpdatePhysicalCountRequest = Schemas['UpdatePhysicalCountRequest'];
export type CountInput = Schemas['CountInput'];
export type PhysicalCountStatus = ApiEnum<'PhysicalCountStatus'>;

export interface PhysicalCountFilters {
  locationId?: string | null;
  status?: PhysicalCountStatus | null;
}

/** Conteos físicos (ver: `inventory.view`, capturar/iniciar/cerrar: `inventory.count`). RN-06. */
@Injectable({ providedIn: 'root' })
export class PhysicalCountsApi {
  private readonly http = inject(HttpClient);

  list(
    query: Partial<ListQuery>,
    filters: PhysicalCountFilters = {},
  ): Observable<PhysicalCountsPage> {
    return this.http.get<PhysicalCountsPage>('/physical-counts', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<PhysicalCountDto> {
    return this.http.get<PhysicalCountDto>(`/physical-counts/${id}`);
  }

  create(request: CreatePhysicalCountRequest): Observable<PhysicalCountDto> {
    return this.http.post<PhysicalCountDto>('/physical-counts', request);
  }

  /** Borrador: categoría y notas. En captura: notas y cantidades contadas. */
  update(id: string, request: UpdatePhysicalCountRequest): Observable<PhysicalCountDto> {
    return this.http.put<PhysicalCountDto>(`/physical-counts/${id}`, request);
  }

  /** Toma el snapshot de existencias. 422 si ya hay otro conteo en captura en la ubicación. */
  start(id: string, version: number): Observable<PhysicalCountDto> {
    return this.http.post<PhysicalCountDto>(`/physical-counts/${id}/start`, { version });
  }

  /** Registra contado − snapshot de cada línea (mueve inventario). Todas deben estar contadas. */
  close(id: string, version: number): Observable<PhysicalCountDto> {
    return this.http.post<PhysicalCountDto>(`/physical-counts/${id}/close`, { version });
  }

  cancel(id: string, version: number): Observable<PhysicalCountDto> {
    return this.http.post<PhysicalCountDto>(`/physical-counts/${id}/cancel`, { version });
  }
}
