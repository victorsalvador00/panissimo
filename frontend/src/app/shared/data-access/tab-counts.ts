import { ResourceRef } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { forkJoin, map, Observable, of } from 'rxjs';
import { ListQuery, Page } from './list-query';

/** The query that only asks for a list's `total`: one row. */
export const COUNT_QUERY: ListQuery = { page: 1, pageSize: 1 };

/**
 * How many rows each tab of a list holds (the `.tab-count` next to its label): one call per tab with `COUNT_QUERY`,
 * again whenever `params` changes; `params` returning `undefined` counts nothing. Call it in an injection context.
 */
export function tabCounts<T extends string, P>(
  tabs: readonly T[],
  params: () => P | undefined,
  list: (tab: T, params: P) => Observable<Page<unknown>>,
): ResourceRef<Partial<Record<string, number>>> {
  return rxResource({
    params,
    stream: ({ params }) => {
      const calls = tabs.map((tab) =>
        list(tab, params).pipe(map((page) => [tab, page.total] as const)),
      );
      return calls.length === 0
        ? of({})
        : forkJoin(calls).pipe(
            map((totals) => Object.fromEntries(totals) as Partial<Record<string, number>>),
          );
    },
    defaultValue: {},
  });
}
