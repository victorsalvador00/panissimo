import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { ListQuery, Page, ParamValues, toHttpParams } from '../../../shared/data-access/list-query';

export type Recipe = Schemas['RecipeDto'];
export type RecipeLine = Schemas['RecipeLineDto'];
export type RecipeListItem = Schemas['RecipeListItemDto'];

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
}
