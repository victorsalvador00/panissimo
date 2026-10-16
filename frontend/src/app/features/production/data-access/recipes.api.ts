import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type RecipeDto = Schemas['RecipeDto'];
export type RecipeLine = Schemas['RecipeLineDto'];
export type RecipeListItem = Schemas['RecipeListItemDto'];
export type RecipesPage = Schemas['PagedResultOfRecipeListItemDto'];
export type CreateRecipeRequest = Schemas['CreateRecipeRequest'];
export type UpdateRecipeRequest = Schemas['UpdateRecipeRequest'];
export type RecipeLineRequest = Schemas['RecipeLineRequest'];
export type Explosion = Schemas['ExplosionDto'];
export type ExplosionLine = Schemas['ExplosionLineDto'];

export interface RecipeFilters {
  outputItemId?: string | null;
  /** También las versiones anteriores (inactivas). */
  includeInactive?: boolean | null;
}

/**
 * Recetas (ver: `production.view`; crear y editar: `production.recipes.manage`). RN-10: editar una
 * receta ya usada en una orden de producción crea la versión N+1 (la respuesta trae el id nuevo).
 */
@Injectable({ providedIn: 'root' })
export class RecipesApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: RecipeFilters = {}): Observable<RecipesPage> {
    return this.http.get<RecipesPage>('/recipes', { params: toHttpParams(query, { ...filters }) });
  }

  /** Todas las versiones de la receta de un artículo, de la más reciente a la más antigua. */
  versions(outputItemId: string): Observable<RecipeListItem[]> {
    return this.list({ page: 1, pageSize: 100 }, { outputItemId, includeInactive: true }).pipe(
      map((page) => page.items),
    );
  }

  get(id: string): Observable<RecipeDto> {
    return this.http.get<RecipeDto>(`/recipes/${id}`);
  }

  create(request: CreateRecipeRequest): Observable<RecipeDto> {
    return this.http.post<RecipeDto>('/recipes', request);
  }

  /**
   * Consumo teórico para producir `qty` (RN-11). Con `locationId`: disponibilidad (sin lotes
   * vencidos), faltante y costo estimado con el costo promedio de la ubicación.
   */
  explode(id: string, qty: number, locationId?: string | null): Observable<Explosion> {
    return this.http.get<Explosion>(`/recipes/${id}/explode`, {
      params: toHttpParams({}, { qty, locationId }),
    });
  }

  /** Edita la versión activa (o crea la N+1 si ya se usó), la desactiva o reactiva una anterior. */
  update(id: string, request: UpdateRecipeRequest): Observable<RecipeDto> {
    return this.http.put<RecipeDto>(`/recipes/${id}`, request);
  }
}
