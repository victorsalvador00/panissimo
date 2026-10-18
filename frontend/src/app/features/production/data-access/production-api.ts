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

export type Recipe = Schemas['RecipeDto'];
export type RecipeLine = Schemas['RecipeLineDto'];
export type RecipeListItem = Schemas['RecipeListItemDto'];
export type Explosion = Schemas['ExplosionDto'];
export type ProductionOrder = Schemas['ProductionOrderDto'];
export type ProductionOrderListItem = Schemas['ProductionOrderListItemDto'];
export type ProductionOrderTab = ApiEnum<'ProductionOrderTab'>;
export type ProductionCloseListItem = Schemas['ProductionCloseListItemDto'];

/** Versioned recipes (`/recipes`, RN-10). */
@Injectable({ providedIn: 'root' })
export class RecipesApi {
  private readonly http = inject(HttpClient);

  /** Active recipes; `includeInactive` adds the previous versions. */
  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<RecipeListItem>> {
    return this.http.get<Page<RecipeListItem>>('recipes', { params: toHttpParams(query, filters) });
  }

  get(id: string): Observable<Recipe> {
    return this.http.get<Recipe>(`recipes/${id}`);
  }

  /** Only one active recipe per item (RN-10). */
  create(request: Schemas['CreateRecipeRequest']): Observable<Recipe> {
    return this.http.post<Recipe>('recipes', request);
  }

  /** Edits the active version; if an order already used it, the answer is version N+1 (another id). */
  update(id: string, request: Schemas['UpdateRecipeRequest']): Observable<Recipe> {
    return this.http.put<Recipe>(`recipes/${id}`, request);
  }

  /** Activating needs the item's active version deactivated first (RN-10). */
  activate(id: string, version: number): Observable<Recipe> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Recipe>(`recipes/${id}/activate`, body);
  }

  deactivate(id: string, version: number): Observable<Recipe> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<Recipe>(`recipes/${id}/deactivate`, body);
  }

  /** RN-11/RN-12: theoretical consumption for `qty`; with a location, availability, shortage and estimated cost. */
  explode(id: string, qty: number, locationId: string | null): Observable<Explosion> {
    return this.http.get<Explosion>(`recipes/${id}/explode`, {
      params: httpParams({ qty, locationId }),
    });
  }
}

/** Production orders (`/production-orders`, RN-60). The closes arrive with F-11. */
@Injectable({ providedIn: 'root' })
export class ProductionOrdersApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<ProductionOrderListItem>> {
    return this.http.get<Page<ProductionOrderListItem>>('production-orders', {
      params: toHttpParams(query, filters),
    });
  }

  get(id: string): Observable<ProductionOrder> {
    return this.http.get<ProductionOrder>(`production-orders/${id}`);
  }

  /** A draft with the product's active recipe; the area defaults to the item's. */
  create(request: Schemas['CreateProductionOrderRequest']): Observable<ProductionOrder> {
    return this.http.post<ProductionOrder>('production-orders', request);
  }

  update(
    id: string,
    request: Schemas['UpdateProductionOrderRequest'],
  ): Observable<ProductionOrder> {
    return this.http.put<ProductionOrder>(`production-orders/${id}`, request);
  }

  release(id: string, version: number): Observable<ProductionOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<ProductionOrder>(`production-orders/${id}/release`, body);
  }

  /** A draft, or released without closes. */
  cancel(id: string, version: number): Observable<ProductionOrder> {
    const body: Schemas['VersionRequest'] = { version };
    return this.http.post<ProductionOrder>(`production-orders/${id}/cancel`, body);
  }

  closes(id: string): Observable<ProductionCloseListItem[]> {
    return this.http.get<ProductionCloseListItem[]>(`production-orders/${id}/closes`);
  }
}
