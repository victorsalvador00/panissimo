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

export type Supplier = Schemas['SupplierDto'];
export type SupplierListItem = Schemas['SupplierListItemDto'];
export type SupplierItem = Schemas['SupplierItemDto'];

/** Suppliers and their catalog of items (`/suppliers`, RN-30, RN-35). */
@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);

  /** `q` by business name or RFC; `includeInactive`. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<SupplierListItem>> {
    return this.http.get<Page<SupplierListItem>>('suppliers', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Supplier> {
    return this.http.get<Supplier>(`suppliers/${id}`);
  }

  create(request: Schemas['CreateSupplierRequest']): Observable<Supplier> {
    return this.http.post<Supplier>('suppliers', request);
  }

  /** Deactivating removes its preferences (RN-35). */
  update(id: string, request: Schemas['UpdateSupplierRequest']): Observable<Supplier> {
    return this.http.put<Supplier>(`suppliers/${id}`, request);
  }

  /** Items it sells with the price per purchase unit and per base unit. */
  items(id: string, includeInactive = true): Observable<SupplierItem[]> {
    return this.http.get<SupplierItem[]>(`suppliers/${id}/items`, {
      params: httpParams({ includeInactive }),
    });
  }

  /** A raw material or supply; marking it preferred unmarks the previous one (RN-35). */
  addItem(id: string, request: Schemas['CreateSupplierItemRequest']): Observable<SupplierItem> {
    return this.http.post<SupplierItem>(`suppliers/${id}/items`, request);
  }

  updateItem(
    id: string,
    supplierItemId: string,
    request: Schemas['UpdateSupplierItemRequest'],
  ): Observable<SupplierItem> {
    return this.http.put<SupplierItem>(`suppliers/${id}/items/${supplierItemId}`, request);
  }
}
