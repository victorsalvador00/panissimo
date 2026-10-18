import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import {
  ListQuery,
  Page,
  ParamValues,
  httpParams,
  toHttpParams,
} from '../../../shared/data-access/list-query';

export type StockLevelRow = Schemas['StockLevelDto'];
export type LotStock = Schemas['LotStockDto'];
export type Alerts = Schemas['AlertsDto'];
export type KardexEntry = Schemas['KardexEntryDto'];
export type AdjustmentListItem = Schemas['AdjustmentListItemDto'];
export type Adjustment = Schemas['AdjustmentDto'];
export type InitialStockResult = Schemas['InitialStockImportResult'];
export type WarehouseOption = Schemas['WarehouseDto'];

/** Stock by location and item, its lots and the alerts (`/stock`, `/alerts`). */
@Injectable({ providedIn: 'root' })
export class StockApi {
  private readonly http = inject(HttpClient);

  /** A plant or branch with sub-warehouses brings its own total row and one per sub-warehouse (RN-46). */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<StockLevelRow>> {
    return this.http.get<Page<StockLevelRow>>('stock', { params: toHttpParams(query, filters) });
  }

  /** Lots with stock, first to expire first; at a plant or branch, also those of its sub-warehouses. */
  lots(locationId: string, itemId: string): Observable<LotStock[]> {
    return this.http.get<LotStock[]>(`stock/${locationId}/${itemId}/lots`);
  }

  alerts(locationId: string): Observable<Alerts> {
    return this.http.get<Alerts>('alerts', { params: httpParams({ locationId }) });
  }

  /** Sub-warehouses of a plant or branch (empty when it keeps stock itself). */
  warehouses(locationId: string): Observable<WarehouseOption[]> {
    return this.http.get<WarehouseOption[]>(`locations/${locationId}/warehouses`);
  }
}

/** Kardex (`/movements`): with location and item, each entry brings its running balance. */
@Injectable({ providedIn: 'root' })
export class MovementsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<KardexEntry>> {
    return this.http.get<Page<KardexEntry>>('movements', { params: toHttpParams(query, filters) });
  }
}

/** Inventory adjustments (`/adjustments`) and the initial stock CSV. */
@Injectable({ providedIn: 'root' })
export class AdjustmentsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<AdjustmentListItem>> {
    return this.http.get<Page<AdjustmentListItem>>('adjustments', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Adjustment> {
    return this.http.get<Adjustment>(`adjustments/${id}`);
  }

  /** Posts at once (RN-02: a 409 `insufficient_stock` lists the shortages). */
  create(request: Schemas['CreateAdjustmentRequest']): Observable<Adjustment> {
    return this.http.post<Adjustment>('adjustments', request);
  }

  importInitialStock(file: File): Observable<InitialStockResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<InitialStockResult>('imports/initial-stock', form);
  }
}
