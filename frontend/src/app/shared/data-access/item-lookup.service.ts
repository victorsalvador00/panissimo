import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import type { ApiEnum, Schemas } from '../../core/api/api-types';
import { toHttpParams } from '../../core/http/list-query';

export type ItemOption = Schemas['ItemLookupDto'];
export type ItemType = ApiEnum<'ItemType'>;

/**
 * Búsqueda ligera de artículos activos para los selectores (`GET /items/lookup`). No exige
 * `catalog.view`: la usan también sucursal, almacén, producción y compras.
 */
@Injectable({ providedIn: 'root' })
export class ItemLookupService {
  private readonly http = inject(HttpClient);

  search(q: string, type?: ItemType, limit = 20): Observable<ItemOption[]> {
    return this.http.get<ItemOption[]>('/items/lookup', {
      params: toHttpParams({ q }, { type, limit }),
    });
  }

  /** Un artículo por id (ej. el filtro que llega en la URL). */
  byId(id: string): Observable<ItemOption | null> {
    return this.http
      .get<ItemOption[]>('/items/lookup', { params: toHttpParams({}, { id }) })
      .pipe(map((items) => items[0] ?? null));
  }

  /** Existencia por artículo en una ubicación, para los artículos que coinciden con `q`. */
  stock(locationId: string, q: string, pageSize = 20): Observable<Map<string, number>> {
    return this.http
      .get<Schemas['PagedResultOfStockLevelDto']>('/stock', {
        params: toHttpParams({ q, pageSize, page: 1 }, { locationId }),
      })
      .pipe(map((result) => new Map(result.items.map((level) => [level.itemId, level.onHand]))));
  }
}
