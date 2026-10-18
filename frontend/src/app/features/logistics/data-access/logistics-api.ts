import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import {
  ListQuery,
  Page,
  ParamValues,
  httpParams,
  toHttpParams,
} from '../../../shared/data-access/list-query';

export type Transfer = Schemas['TransferDto'];
export type TransferLine = Schemas['TransferLineDto'];
export type TransferListItem = Schemas['TransferListItemDto'];
export type TransferTab = NonNullable<ApiEnum<'TransferTab'>>;
export type DiscrepancyReason = NonNullable<ApiEnum<'DiscrepancyReason'>>;
export type LocationLookup = Schemas['LocationLookupDto'];
export type BranchOrder = Schemas['BranchOrderDto'];
export type BranchOrderLine = Schemas['BranchOrderLineDto'];
export type BranchOrderListItem = Schemas['BranchOrderListItemDto'];
export type BranchOrderSuggestion = Schemas['BranchOrderSuggestionDto'];

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

/**
 * Internal vouchers between two sub-warehouses of the same plant or branch (`/internal-transfers`, RN-47): same
 * documents as a transfer, without vehicle or driver; sent with the chosen lots or the first to expire.
 */
@Injectable({ providedIn: 'root' })
export class InternalTransfersApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<TransferListItem>> {
    return this.http.get<Page<TransferListItem>>('internal-transfers', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Transfer> {
    return this.http.get<Transfer>(`internal-transfers/${id}`);
  }

  create(request: Schemas['CreateInternalTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>('internal-transfers', request);
  }

  /** `toLocationId` is the destination sub-warehouse. */
  update(id: string, request: Schemas['UpdateTransferRequest']): Observable<Transfer> {
    return this.http.put<Transfer>(`internal-transfers/${id}`, request);
  }

  dispatch(id: string, request: Schemas['DispatchInternalTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>(`internal-transfers/${id}/dispatch`, request);
  }

  receive(id: string, request: Schemas['ReceiveTransferRequest']): Observable<Transfer> {
    return this.http.post<Transfer>(`internal-transfers/${id}/receive`, request);
  }

  cancel(id: string, version: number): Observable<Transfer> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Transfer>(`internal-transfers/${id}/cancel`, body);
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

/** Branch orders to the plant (`/branch-orders`, RN-20). */
@Injectable({ providedIn: 'root' })
export class BranchOrdersApi {
  private readonly http = inject(HttpClient);

  /** `tab` (All, ToApprove), `locationId` (the branch), `q` by folio. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<BranchOrderListItem>> {
    return this.http.get<Page<BranchOrderListItem>>('branch-orders', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<BranchOrder> {
    return this.http.get<BranchOrder>(`branch-orders/${id}`);
  }

  /** Items at or below their minimum at the branch, with the quantity to reach the maximum (RN-20). */
  suggestion(locationId: string): Observable<BranchOrderSuggestion[]> {
    return this.http.get<BranchOrderSuggestion[]>('branch-orders/suggestion', {
      params: httpParams({ locationId }),
    });
  }

  create(request: Schemas['CreateBranchOrderRequest']): Observable<BranchOrder> {
    return this.http.post<BranchOrder>('branch-orders', request);
  }

  update(id: string, request: Schemas['UpdateBranchOrderRequest']): Observable<BranchOrder> {
    return this.http.put<BranchOrder>(`branch-orders/${id}`, request);
  }

  submit(id: string, version: number): Observable<BranchOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<BranchOrder>(`branch-orders/${id}/submit`, body);
  }

  /** A draft or a sent one; an approved order is cancelled by cancelling its transfer. */
  cancel(id: string, version: number): Observable<BranchOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<BranchOrder>(`branch-orders/${id}/cancel`, body);
  }

  /** 0 to the requested per line, not all 0; creates the draft transfer with what was approved. */
  approve(id: string, request: Schemas['ApproveBranchOrderRequest']): Observable<BranchOrder> {
    return this.http.post<BranchOrder>(`branch-orders/${id}/approve`, request);
  }

  reject(id: string, version: number, reason: string): Observable<BranchOrder> {
    const body: Schemas['RejectBranchOrderRequest'] = { version, reason };
    return this.http.post<BranchOrder>(`branch-orders/${id}/reject`, body);
  }
}
