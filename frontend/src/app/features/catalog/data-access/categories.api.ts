import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type CategoryDto = Schemas['ItemCategoryDto'];
export type CategoriesPage = Schemas['PagedResultOfItemCategoryDto'];
export type CreateCategoryRequest = Schemas['CreateItemCategoryRequest'];
export type UpdateCategoryRequest = Schemas['UpdateItemCategoryRequest'];

/** Categorías de artículos (`/item-categories`, `catalog.view` / `catalog.manage`). */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, includeInactive = false): Observable<CategoriesPage> {
    return this.http.get<CategoriesPage>('/item-categories', {
      params: toHttpParams(query, { includeInactive: includeInactive || null }),
    });
  }

  create(request: CreateCategoryRequest): Observable<CategoryDto> {
    return this.http.post<CategoryDto>('/item-categories', request);
  }

  update(id: string, request: UpdateCategoryRequest): Observable<CategoryDto> {
    return this.http.put<CategoryDto>(`/item-categories/${id}`, request);
  }
}
