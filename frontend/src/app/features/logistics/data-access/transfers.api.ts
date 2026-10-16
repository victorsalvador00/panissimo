import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type TransferDto = Schemas['TransferDto'];
export type TransferLine = Schemas['TransferLineDto'];
export type TransferListItem = Schemas['TransferListItemDto'];
export type TransfersPage = Schemas['PagedResultOfTransferListItemDto'];
export type CreateTransferRequest = Schemas['CreateTransferRequest'];
export type UpdateTransferRequest = Schemas['UpdateTransferRequest'];
export type TransferLineRequest = Schemas['TransferLineRequest'];
export type DispatchTransferRequest = Schemas['DispatchTransferRequest'];
export type DispatchLineRequest = Schemas['DispatchLineRequest'];
export type ReceiveTransferRequest = Schemas['ReceiveTransferRequest'];
export type ReceiveLineRequest = Schemas['ReceiveLineRequest'];
export type TransferStatus = ApiEnum<'TransferStatus'>;
export type DiscrepancyReason = ApiEnum<'DiscrepancyReason'>;

export interface TransferFilters {
  status?: TransferStatus | null;
  /** Recibidos con o sin diferencias. */
  received?: boolean | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  /** Origen o destino. */
  locationId?: string | null;
}

/**
 * Traspasos (ver: `logistics.view`; crear, editar, despachar y cancelar: `logistics.transfers.dispatch`;
 * recibir: `logistics.transfers.receive`). RN-21 a RN-23.
 */
@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: TransferFilters = {}): Observable<TransfersPage> {
    return this.http.get<TransfersPage>('/transfers', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<TransferDto> {
    return this.http.get<TransferDto>(`/transfers/${id}`);
  }

  create(request: CreateTransferRequest): Observable<TransferDto> {
    return this.http.post<TransferDto>('/transfers', request);
  }

  update(id: string, request: UpdateTransferRequest): Observable<TransferDto> {
    return this.http.put<TransferDto>(`/transfers/${id}`, request);
  }

  /** Registra la salida en el origen (FEFO o lotes elegidos). 409 `insufficient_stock` si falta. */
  dispatch(id: string, request: DispatchTransferRequest): Observable<TransferDto> {
    return this.http.post<TransferDto>(`/transfers/${id}/dispatch`, request);
  }

  /** Registra la entrada en el destino; recibir menos exige motivo (RN-22). */
  receive(id: string, request: ReceiveTransferRequest): Observable<TransferDto> {
    return this.http.post<TransferDto>(`/transfers/${id}/receive`, request);
  }

  cancel(id: string, version: number): Observable<TransferDto> {
    return this.http.post<TransferDto>(`/transfers/${id}/cancel`, { version });
  }
}
