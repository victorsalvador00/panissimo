import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import type { Schemas } from '../../core/api/api';
import { ParamValues, httpParams } from './list-query';

export type ItemOption = Schemas['ItemLookupDto'];

/** `/items/lookup`: items by SKU or name for the pickers, or one item by id (even if inactive). */
@Injectable({ providedIn: 'root' })
export class ItemLookupApi {
  private readonly http = inject(HttpClient);

  search(q: string, filters: ParamValues = {}): Observable<ItemOption[]> {
    return this.http.get<ItemOption[]>('items/lookup', {
      params: httpParams({ q, limit: 20, ...filters }),
    });
  }

  byId(id: string): Observable<ItemOption | null> {
    return this.http
      .get<ItemOption[]>('items/lookup', { params: httpParams({ id }) })
      .pipe(map((items) => items[0] ?? null));
  }
}
