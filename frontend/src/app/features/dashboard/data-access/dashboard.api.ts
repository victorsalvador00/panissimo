import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { toHttpParams } from '../../../core/http/list-query';

export type DashboardDto = Schemas['DashboardDto'];
export type LocationCount = Schemas['LocationCountDto'];

/** Contadores del tablero (`GET /dashboard`). Cada bloque llega en null si falta su permiso. */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  get(locationId: string): Observable<DashboardDto> {
    return this.http.get<DashboardDto>('/dashboard', { params: toHttpParams({}, { locationId }) });
  }
}
