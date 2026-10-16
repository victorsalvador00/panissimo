import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type GoodsReceiptDto = Schemas['GoodsReceiptDto'];
export type GoodsReceiptLine = Schemas['GoodsReceiptLineDto'];
export type GoodsReceiptListItem = Schemas['GoodsReceiptListItemDto'];
export type GoodsReceiptsPage = Schemas['PagedResultOfGoodsReceiptListItemDto'];
export type CreateGoodsReceiptRequest = Schemas['CreateGoodsReceiptRequest'];
export type GoodsReceiptLineRequest = Schemas['GoodsReceiptLineRequest'];

export interface GoodsReceiptFilters {
  purchaseOrderId?: string | null;
  supplierId?: string | null;
  locationId?: string | null;
  /** Instantes ISO (ver `dayRange`). */
  from?: string | null;
  to?: string | null;
}

/** Recepciones de compra (`purchasing.view`; registrar con `purchasing.receive`). */
@Injectable({ providedIn: 'root' })
export class GoodsReceiptsApi {
  private readonly http = inject(HttpClient);

  list(
    query: Partial<ListQuery>,
    filters: GoodsReceiptFilters = {},
  ): Observable<GoodsReceiptsPage> {
    return this.http.get<GoodsReceiptsPage>('/goods-receipts', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<GoodsReceiptDto> {
    return this.http.get<GoodsReceiptDto>(`/goods-receipts/${id}`);
  }

  /**
   * Recibe una OC aprobada o parcialmente recibida al costo de la OC (RN-33). Una línea puede repetirse
   * para varios lotes. 409 si la OC cambió (`poVersion`); 422 si excede la tolerancia (RN-32).
   */
  create(request: CreateGoodsReceiptRequest): Observable<GoodsReceiptDto> {
    return this.http.post<GoodsReceiptDto>('/goods-receipts', request);
  }
}
