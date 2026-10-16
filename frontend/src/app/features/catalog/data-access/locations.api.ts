import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type LocationDto = Schemas['LocationDto'];
export type LocationsPage = Schemas['PagedResultOfLocationDto'];
export type CreateLocationRequest = Schemas['CreateLocationRequest'];
export type UpdateLocationRequest = Schemas['UpdateLocationRequest'];
export type LocationType = ApiEnum<'LocationType'>;

export interface LocationFilters {
  includeInactive?: boolean;
  type?: LocationType | null;
}

/** Ubicaciones (`/locations`): ver con `locations.view`, crear/editar con `locations.manage`. */
@Injectable({ providedIn: 'root' })
export class LocationsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: LocationFilters = {}): Observable<LocationsPage> {
    return this.http.get<LocationsPage>('/locations', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  create(request: CreateLocationRequest): Observable<LocationDto> {
    return this.http.post<LocationDto>('/locations', request);
  }

  update(id: string, request: UpdateLocationRequest): Observable<LocationDto> {
    return this.http.put<LocationDto>(`/locations/${id}`, request);
  }
}
