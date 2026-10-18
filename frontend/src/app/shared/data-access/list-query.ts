import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { Subject } from 'rxjs';
import { formatQty } from '../pipes/pipes';

/** Server-side list query (backend PageQuery): `sort` is `field` or `field:desc`. */
export interface ListQuery {
  page: number;
  pageSize: number;
  sort?: string;
  q?: string;
}

/** A page of results (backend PagedResult<T>). */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DEFAULT_LIST_QUERY: ListQuery = { page: 1, pageSize: 25 };

export type ParamValues = Record<string, string | number | boolean | null | undefined>;

/** HTTP params without the empty values (null, undefined, ''). */
export function httpParams(values: ParamValues): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '')
      params = params.set(key, String(value));
  }
  return params;
}

/** The list query plus the screen filters as HTTP params. */
export function toHttpParams(query: ListQuery, filters: ParamValues = {}): HttpParams {
  return httpParams({ ...filters, ...query });
}

/** Paginator texts in Spanish. */
@Injectable()
export class EsMxPaginatorIntl implements MatPaginatorIntl {
  readonly changes = new Subject<void>();
  itemsPerPageLabel = 'Por página:';
  nextPageLabel = 'Página siguiente';
  previousPageLabel = 'Página anterior';
  firstPageLabel = 'Primera página';
  lastPageLabel = 'Última página';

  getRangeLabel(page: number, pageSize: number, length: number): string {
    if (length === 0) return 'Sin resultados';
    const start = page * pageSize + 1;
    const end = Math.min(length, (page + 1) * pageSize);
    return `${formatQty(start)} – ${formatQty(end)} de ${formatQty(length)}`;
  }
}
