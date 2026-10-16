import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type AdjustmentDto = Schemas['AdjustmentDto'];
export type AdjustmentListItem = Schemas['AdjustmentListItemDto'];
export type AdjustmentsPage = Schemas['PagedResultOfAdjustmentListItemDto'];
export type CreateAdjustmentRequest = Schemas['CreateAdjustmentRequest'];
export type AdjustmentLineRequest = Schemas['AdjustmentLineRequest'];
export type AdjustmentReason = ApiEnum<'AdjustmentReason'>;
export type InitialStockImportResult = Schemas['InitialStockImportResult'];

export interface AdjustmentFilters {
  locationId?: string | null;
  reason?: AdjustmentReason | null;
  from?: string | null;
  to?: string | null;
}

/** Ajustes de inventario y existencias iniciales (ver: `inventory.view`, registrar: `inventory.adjust`). */
@Injectable({ providedIn: 'root' })
export class AdjustmentsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: AdjustmentFilters = {}): Observable<AdjustmentsPage> {
    return this.http.get<AdjustmentsPage>('/adjustments', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<AdjustmentDto> {
    return this.http.get<AdjustmentDto>(`/adjustments/${id}`);
  }

  /** Crea y registra de inmediato (mueve inventario). 409 `insufficient_stock` si faltaría existencia. */
  create(request: CreateAdjustmentRequest): Observable<AdjustmentDto> {
    return this.http.post<AdjustmentDto>('/adjustments', request);
  }

  /** CSV todo o nada; crea un ajuste por ubicación. */
  importInitialStock(file: File): Observable<InitialStockImportResult> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<InitialStockImportResult>('/imports/initial-stock', body);
  }
}
