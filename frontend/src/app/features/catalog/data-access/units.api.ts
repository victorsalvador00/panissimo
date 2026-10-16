import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type UnitDto = Schemas['UnitOfMeasureDto'];
export type UnitsPage = Schemas['PagedResultOfUnitOfMeasureDto'];
export type CreateUnitRequest = Schemas['CreateUnitOfMeasureRequest'];
export type UpdateUnitRequest = Schemas['UpdateUnitOfMeasureRequest'];
export type UomKind = ApiEnum<'UomKind'>;

/** Unidades de medida (`/units-of-measure`, `catalog.view` / `catalog.manage`). */
@Injectable({ providedIn: 'root' })
export class UnitsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, includeInactive = false): Observable<UnitsPage> {
    return this.http.get<UnitsPage>('/units-of-measure', {
      params: toHttpParams(query, { includeInactive: includeInactive || null }),
    });
  }

  create(request: CreateUnitRequest): Observable<UnitDto> {
    return this.http.post<UnitDto>('/units-of-measure', request);
  }

  update(id: string, request: UpdateUnitRequest): Observable<UnitDto> {
    return this.http.put<UnitDto>(`/units-of-measure/${id}`, request);
  }
}
