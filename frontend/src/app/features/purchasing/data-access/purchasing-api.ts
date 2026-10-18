import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
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
export type SupplierOffer = Schemas['SupplierOfferDto'];
export type Requisition = Schemas['RequisitionDto'];
export type RequisitionListItem = Schemas['RequisitionListItemDto'];
export type ConvertedOrder = Schemas['ConvertedPurchaseOrderDto'];

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

/** Purchase requisitions of the plant (`/requisitions`, RN-34) and their conversion to purchase orders. */
@Injectable({ providedIn: 'root' })
export class RequisitionsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<RequisitionListItem>> {
    return this.http.get<Page<RequisitionListItem>>('requisitions', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<Requisition> {
    return this.http.get<Requisition>(`requisitions/${id}`);
  }

  create(request: Schemas['CreateRequisitionRequest']): Observable<Requisition> {
    return this.http.post<Requisition>('requisitions', request);
  }

  update(id: string, request: Schemas['UpdateRequisitionRequest']): Observable<Requisition> {
    return this.http.put<Requisition>(`requisitions/${id}`, request);
  }

  /** Every line needs its supplier. */
  submit(id: string, version: number): Observable<Requisition> {
    return this.http.post<Requisition>(`requisitions/${id}/submit`, this.version(version));
  }

  approve(id: string, version: number): Observable<Requisition> {
    return this.http.post<Requisition>(`requisitions/${id}/approve`, this.version(version));
  }

  reject(id: string, version: number, reason: string): Observable<Requisition> {
    const body: Schemas['RejectRequisitionRequest'] = { version, reason };
    return this.http.post<Requisition>(`requisitions/${id}/reject`, body);
  }

  cancel(id: string, version: number): Observable<Requisition> {
    return this.http.post<Requisition>(`requisitions/${id}/cancel`, this.version(version));
  }

  /** Approved requisitions → draft purchase orders grouped by supplier and delivery location. All or nothing. */
  convert(requisitionIds: string[]): Observable<ConvertedOrder[]> {
    const body: Schemas['ConvertRequisitionsRequest'] = { requisitionIds };
    return this.http
      .post<Schemas['ConvertRequisitionsResult']>('requisitions/convert', body)
      .pipe(map((result) => result.purchaseOrders));
  }

  private version(version: number): Schemas['VersionRequest'] {
    return { version };
  }
}

/** Active suppliers that sell an item: the preferred one first, then the cheapest per base unit. */
@Injectable({ providedIn: 'root' })
export class SupplierOffersApi {
  private readonly http = inject(HttpClient);

  of(itemId: string): Observable<SupplierOffer[]> {
    return this.http.get<SupplierOffer[]>(`items/${itemId}/supplier-offers`);
  }
}
