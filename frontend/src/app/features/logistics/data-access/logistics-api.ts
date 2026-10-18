import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { ListQuery, Page, ParamValues, toHttpParams } from '../../../shared/data-access/list-query';

export type Transfer = Schemas['TransferDto'];
export type TransferLine = Schemas['TransferLineDto'];
export type TransferListItem = Schemas['TransferListItemDto'];
export type TransferTab = NonNullable<ApiEnum<'TransferTab'>>;
export type DiscrepancyReason = NonNullable<ApiEnum<'DiscrepancyReason'>>;
export type LocationLookup = Schemas['LocationLookupDto'];

/** Direct transfers between the plant and the branches (`/transfers`, RN-21..RN-25). */
@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<TransferListItem>> {
    return this.http.get<Page<TransferListItem>>('transfers', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Transfer> {
    return this.http.get<Transfer>(`transfers/${id}`);
  }

  /** A draft; outside plant → branch it needs `logistics.transfers.special` (RN-25). */
  create(request: Schemas['CreateTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>('transfers', request);
  }

  update(id: string, request: Schemas['UpdateTransferRequest']): Observable<Transfer> {
    return this.http.put<Transfer>(`transfers/${id}`, request);
  }

  /** RN-21: posts the exit at the origin (planned lot, chosen lots or first to expire); in transit afterwards. */
  dispatch(id: string, request: Schemas['DispatchTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>(`transfers/${id}/dispatch`, request);
  }

  /** RN-22: receiving less than shipped needs a reason and leaves it with discrepancies. */
  receive(id: string, request: Schemas['ReceiveTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>(`transfers/${id}/receive`, request);
  }

  /** Only a draft (RN-23); a branch order's transfer cancels its order too. */
  cancel(id: string, version: number): Observable<Transfer> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Transfer>(`transfers/${id}/cancel`, body);
  }
}

/** Every active location, also those outside the user's scope: destinations of transfers (`/locations/lookup`). */
@Injectable({ providedIn: 'root' })
export class DestinationsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<LocationLookup[]> {
    return this.http.get<LocationLookup[]>('locations/lookup');
  }
}
