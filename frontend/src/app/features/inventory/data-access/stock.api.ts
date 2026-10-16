import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type StockLevel = Schemas['StockLevelDto'];
export type StockPage = Schemas['PagedResultOfStockLevelDto'];
export type LotStock = Schemas['LotStockDto'];
export type Alerts = Schemas['AlertsDto'];

export interface StockFilters {
  locationId?: string | null;
  itemId?: string | null;
  categoryId?: string | null;
  belowMin?: boolean | null;
}

/** Existencias, lotes y alertas (`inventory.view`). */
@Injectable({ providedIn: 'root' })
export class StockApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: StockFilters = {}): Observable<StockPage> {
    return this.http.get<StockPage>('/stock', { params: toHttpParams(query, { ...filters }) });
  }

  lots(locationId: string, itemId: string): Observable<LotStock[]> {
    return this.http.get<LotStock[]>(`/stock/${locationId}/${itemId}/lots`);
  }

  /** Bajo mínimo y lotes por caducar (con los días de alerta configurados). */
  alerts(locationId?: string | null): Observable<Alerts> {
    return this.http.get<Alerts>('/alerts', { params: toHttpParams({}, { locationId }) });
  }
}
