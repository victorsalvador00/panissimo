import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type KardexEntry = Schemas['KardexEntryDto'];
export type KardexPage = Schemas['PagedResultOfKardexEntryDto'];
export type MovementType = ApiEnum<'MovementType'>;

export interface KardexFilters {
  locationId?: string | null;
  itemId?: string | null;
  type?: MovementType | null;
  from?: string | null;
  to?: string | null;
}

/** Kardex (`/movements`, `inventory.view`). El saldo solo viene con ubicación y artículo. */
@Injectable({ providedIn: 'root' })
export class MovementsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: KardexFilters = {}): Observable<KardexPage> {
    return this.http.get<KardexPage>('/movements', { params: toHttpParams(query, { ...filters }) });
  }
}
