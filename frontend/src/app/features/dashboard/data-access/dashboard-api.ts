import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { httpParams } from '../../../shared/data-access/list-query';

export type Dashboard = Schemas['DashboardDto'];
export type DashboardDocument = Schemas['DashboardDocumentDto'];
export type ProductionTodayRow = Schemas['ProductionTodayRowDto'];
export type LocationLowStock = Schemas['LocationLowStockDto'];

/** `/dashboard` (backend §8.2): every block is null without its permission. */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  get(locationId: string | null): Observable<Dashboard> {
    return this.http.get<Dashboard>('dashboard', { params: httpParams({ locationId }) });
  }
}
