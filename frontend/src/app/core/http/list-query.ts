import { HttpParams } from '@angular/common/http';

/** Consulta de listados del backend (spec backend §6.1): `?page=1&pageSize=25&sort=folio:desc&q=texto`. */
export interface ListQuery {
  page: number;
  pageSize: number;
  /** `campo:asc` o `campo:desc`. */
  sort?: string;
  q?: string;
}

export const DEFAULT_PAGE_SIZE = 25;

export function defaultListQuery(sort?: string): ListQuery {
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort };
}

type ParamValue = string | number | boolean | null | undefined;

/** Arma los query params omitiendo vacíos. `extra` lleva los filtros propios de cada pantalla. */
export function toHttpParams(
  query: Partial<ListQuery>,
  extra: Record<string, ParamValue> = {},
): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries({ ...query, ...extra })) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
