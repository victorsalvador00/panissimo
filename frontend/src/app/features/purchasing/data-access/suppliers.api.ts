import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type SupplierDto = Schemas['SupplierDto'];
export type SuppliersPage = Schemas['PagedResultOfSupplierDto'];
export type CreateSupplierRequest = Schemas['CreateSupplierRequest'];
export type UpdateSupplierRequest = Schemas['UpdateSupplierRequest'];
export type SupplierItemDto = Schemas['SupplierItemDto'];
export type SupplierItemsPage = Schemas['PagedResultOfSupplierItemDto'];
export type CreateSupplierItemRequest = Schemas['CreateSupplierItemRequest'];
export type UpdateSupplierItemRequest = Schemas['UpdateSupplierItemRequest'];
export type ItemSupplierOffers = Schemas['ItemSupplierOffersDto'];
export type SupplierOffer = Schemas['SupplierOfferDto'];

export interface SupplierFilters {
  includeInactive?: boolean | null;
}

export interface SupplierItemFilters extends SupplierFilters {
  itemId?: string | null;
}

/** Proveedores y sus artículos (`purchasing.view` / `purchasing.suppliers.manage`). Catálogo global. */
@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: SupplierFilters = {}): Observable<SuppliersPage> {
    return this.http.get<SuppliersPage>('/suppliers', {
      params: toHttpParams(query, { ...filters }),
    });
  }

  get(id: string): Observable<SupplierDto> {
    return this.http.get<SupplierDto>(`/suppliers/${id}`);
  }

  create(request: CreateSupplierRequest): Observable<SupplierDto> {
    return this.http.post<SupplierDto>('/suppliers', request);
  }

  /** Al desactivarlo deja de ser el proveedor preferido de sus artículos. */
  update(id: string, request: UpdateSupplierRequest): Observable<SupplierDto> {
    return this.http.put<SupplierDto>(`/suppliers/${id}`, request);
  }

  items(
    supplierId: string,
    query: Partial<ListQuery>,
    filters: SupplierItemFilters = {},
  ): Observable<SupplierItemsPage> {
    return this.http.get<SupplierItemsPage>(`/suppliers/${supplierId}/items`, {
      params: toHttpParams(query, { ...filters }),
    });
  }

  /** 422 si el artículo está inactivo o ya está ligado al proveedor, o si el proveedor está inactivo. */
  addItem(supplierId: string, request: CreateSupplierItemRequest): Observable<SupplierItemDto> {
    return this.http.post<SupplierItemDto>(`/suppliers/${supplierId}/items`, request);
  }

  /** Marcarlo como preferido desmarca al preferido anterior del artículo. */
  updateItem(
    supplierId: string,
    supplierItemId: string,
    request: UpdateSupplierItemRequest,
  ): Observable<SupplierItemDto> {
    return this.http.put<SupplierItemDto>(
      `/suppliers/${supplierId}/items/${supplierItemId}`,
      request,
    );
  }

  /** Proveedores activos que venden el artículo (preferido primero) y su unidad de compra. */
  offers(itemId: string): Observable<ItemSupplierOffers> {
    return this.http.get<ItemSupplierOffers>(`/items/${itemId}/supplier-offers`);
  }
}
