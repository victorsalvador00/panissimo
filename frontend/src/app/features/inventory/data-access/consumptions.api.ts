import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type ConsumptionDto = Schemas['ConsumptionDto'];
export type ConsumptionListItem = Schemas['ConsumptionListItemDto'];
export type ConsumptionsPage = Schemas['PagedResultOfConsumptionListItemDto'];
export type CreateConsumptionRequest = Schemas['CreateConsumptionRequest'];
export type ConsumptionLineRequest = Schemas['ConsumptionLineRequest'];

export interface ConsumptionFilters {
  locationId?: string | null;
  /** Días del negocio (`yyyy-MM-dd`). */
  from?: string | null;
  to?: string | null;
}

/** Consumo de sucursal (ver: `inventory.view`, registrar: `inventory.consumption`). */
@Injectable({ providedIn: 'root' })
export class ConsumptionsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: ConsumptionFilters = {}): Observable<ConsumptionsPage> {
    return this.http.get<ConsumptionsPage>('/consumptions', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<ConsumptionDto> {
    return this.http.get<ConsumptionDto>(`/consumptions/${id}`);
  }

  /** Registra y descuenta de inmediato (FEFO sin lote). 409 `insufficient_stock` si faltaría. */
  create(request: CreateConsumptionRequest): Observable<ConsumptionDto> {
    return this.http.post<ConsumptionDto>('/consumptions', request);
  }
}
