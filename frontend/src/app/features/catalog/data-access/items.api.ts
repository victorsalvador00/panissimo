import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api-types';
import { ListQuery, toHttpParams } from '../../../core/http/list-query';

export type ItemDto = Schemas['ItemDto'];
export type ItemListItem = Schemas['ItemListItemDto'];
export type ItemsPage = Schemas['PagedResultOfItemListItemDto'];
export type CreateItemRequest = Schemas['CreateItemRequest'];
export type UpdateItemRequest = Schemas['UpdateItemRequest'];
export type ItemLocationSetting = Schemas['ItemLocationSettingDto'];
export type ItemLocationSettingInput = Schemas['ItemLocationSettingInput'];
export type ItemImportResult = Schemas['ItemImportResult'];
export type ItemType = ApiEnum<'ItemType'>;
export type StorageCondition = ApiEnum<'StorageCondition'>;

export interface ItemFilters {
  type?: ItemType | null;
  categoryId?: string | null;
  includeInactive?: boolean | null;
}

/** Artículos, mín/máx por ubicación e importación CSV (`catalog.view` / `catalog.manage`). */
@Injectable({ providedIn: 'root' })
export class ItemsApi {
  private readonly http = inject(HttpClient);

  list(query: Partial<ListQuery>, filters: ItemFilters = {}): Observable<ItemsPage> {
    return this.http.get<ItemsPage>('/items', { params: toHttpParams(query, { ...filters }) });
  }

  get(id: string): Observable<ItemDto> {
    return this.http.get<ItemDto>(`/items/${id}`);
  }

  create(request: CreateItemRequest): Observable<ItemDto> {
    return this.http.post<ItemDto>('/items', request);
  }

  update(id: string, request: UpdateItemRequest): Observable<ItemDto> {
    return this.http.put<ItemDto>(`/items/${id}`, request);
  }

  locationSettings(id: string): Observable<ItemLocationSetting[]> {
    return this.http.get<ItemLocationSetting[]>(`/items/${id}/location-settings`);
  }

  updateLocationSettings(
    id: string,
    settings: ItemLocationSettingInput[],
  ): Observable<ItemLocationSetting[]> {
    return this.http.put<ItemLocationSetting[]>(`/items/${id}/location-settings`, { settings });
  }

  /** Todo o nada: con errores responde 400 `import_invalid` con `rowErrors` y no importa nada. */
  import(file: File): Observable<ItemImportResult> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<ItemImportResult>('/imports/items', body);
  }
}
