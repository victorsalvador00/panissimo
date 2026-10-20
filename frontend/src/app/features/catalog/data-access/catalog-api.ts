import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { ListQuery, Page, ParamValues, toHttpParams } from '../../../shared/data-access/list-query';

export type Location = Schemas['LocationDto'];
export type Category = Schemas['ItemCategoryDto'];
export type Unit = Schemas['UnitOfMeasureDto'];
export type ItemListItem = Schemas['ItemListItemDto'];
export type Item = Schemas['ItemDto'];
export type ItemLocationSetting = Schemas['ItemLocationSettingDto'];
export type ItemImportResult = Schemas['ItemImportResult'];

/** Every row of a small catalog (categories, units): they are a few dozen at most. */
const all: ListQuery = { page: 1, pageSize: 100 };

/** Plants, branches and sub-warehouses (`/locations`). */
@Injectable({ providedIn: 'root' })
export class LocationsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ParamValues = {}): Observable<Page<Location>> {
    return this.http.get<Page<Location>>('locations', { params: toHttpParams(query, filters) });
  }

  create(request: Schemas['CreateLocationRequest']): Observable<Location> {
    return this.http.post<Location>('locations', request);
  }

  update(id: string, request: Schemas['UpdateLocationRequest']): Observable<Location> {
    return this.http.put<Location>(`locations/${id}`, request);
  }
}

/** Item categories (`/item-categories`). */
@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery = all, filters: ParamValues = {}): Observable<Page<Category>> {
    return this.http.get<Page<Category>>('item-categories', {
      params: toHttpParams(query, filters),
    });
  }

  create(request: Schemas['CreateItemCategoryRequest']): Observable<Category> {
    return this.http.post<Category>('item-categories', request);
  }

  update(id: string, request: Schemas['UpdateItemCategoryRequest']): Observable<Category> {
    return this.http.put<Category>(`item-categories/${id}`, request);
  }
}

/** Units of measure (`/units-of-measure`). */
@Injectable({ providedIn: 'root' })
export class UnitsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery = all, filters: ParamValues = {}): Observable<Page<Unit>> {
    return this.http.get<Page<Unit>>('units-of-measure', { params: toHttpParams(query, filters) });
  }

  create(request: Schemas['CreateUnitOfMeasureRequest']): Observable<Unit> {
    return this.http.post<Unit>('units-of-measure', request);
  }

  update(id: string, request: Schemas['UpdateUnitOfMeasureRequest']): Observable<Unit> {
    return this.http.put<Unit>(`units-of-measure/${id}`, request);
  }
}

export interface ItemFilters extends ParamValues {
  type?: string | null;
  presentation?: string | null;
  categoryId?: string | null;
  bulkItemId?: string | null;
  includeInactive?: boolean | null;
}

/** Items (`/items`), their min/max per location and the CSV import. */
@Injectable({ providedIn: 'root' })
export class ItemsApi {
  private readonly http = inject(HttpClient);

  list(query: ListQuery, filters: ItemFilters = {}): Observable<Page<ItemListItem>> {
    return this.http.get<Page<ItemListItem>>('items', { params: toHttpParams(query, filters) });
  }

  get(id: string): Observable<Item> {
    return this.http.get<Item>(`items/${id}`);
  }

  create(request: Schemas['CreateItemRequest']): Observable<Item> {
    return this.http.post<Item>('items', request);
  }

  update(id: string, request: Schemas['UpdateItemRequest']): Observable<Item> {
    return this.http.put<Item>(`items/${id}`, request);
  }

  locationSettings(id: string): Observable<ItemLocationSetting[]> {
    return this.http.get<ItemLocationSetting[]>(`items/${id}/location-settings`);
  }

  updateLocationSettings(
    id: string,
    settings: Schemas['ItemLocationSettingInput'][],
  ): Observable<ItemLocationSetting[]> {
    const body: Schemas['UpdateItemLocationSettingsRequest'] = { settings };
    return this.http.put<ItemLocationSetting[]>(`items/${id}/location-settings`, body);
  }

  /** All or nothing: a file with errors is a 400 `import_invalid` with the errors by row. */
  importCsv(file: File): Observable<ItemImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ItemImportResult>('imports/items', form);
  }
}
