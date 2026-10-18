import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Route, Router } from '@angular/router';
import { filter, map } from 'rxjs';

export interface Crumb {
  label: string;
  /** Null for the current page. */
  url: string | null;
}

/** Route data key with the label of the route in the breadcrumbs. */
export const BREADCRUMB = 'breadcrumb';

/**
 * Automatic breadcrumbs (frontend §4.1, §8): one crumb per route with `data.breadcrumb`, after "Inicio". A detail page
 * may replace the label of the last one with its folio (`setCurrent`), until the next navigation.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbsService {
  private readonly router = inject(Router);
  private readonly current = signal<string | null>(null);
  private readonly navigation = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => {
        this.current.set(null);
        return event.urlAfterRedirects;
      }),
    ),
    { initialValue: this.router.url },
  );

  readonly crumbs = computed<Crumb[]>(() => {
    this.navigation();
    const crumbs = buildCrumbs(this.router.routerState.snapshot.root);
    const current = this.current();
    if (current && crumbs.length > 1) crumbs[crumbs.length - 1] = { label: current, url: null };
    return crumbs;
  });

  /** The label of the current page (folio of a document, name of a record). */
  setCurrent(label: string): void {
    this.current.set(label);
  }
}

export function buildCrumbs(root: ActivatedRouteSnapshot): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Inicio', url: '/' }];
  const segments: string[] = [];
  for (let route: ActivatedRouteSnapshot | null = root; route; route = route.firstChild) {
    segments.push(...route.url.map((segment) => segment.path));
    const label = route.routeConfig?.data?.[BREADCRUMB] as string | undefined;
    if (label && segments.length > 0)
      crumbs.push({ label, url: hasPage(route.routeConfig) ? '/' + segments.join('/') : null });
  }
  crumbs[crumbs.length - 1] = { ...crumbs[crumbs.length - 1], url: null };
  return crumbs;
}

/** A grouping route without a page of its own (`/admin`) is a crumb without a link. */
function hasPage(config: Route | null): boolean {
  if (!config) return false;
  if (config.component || config.loadComponent) return true;
  return !!config.children?.some(
    (child) => child.path === '' && (child.component || child.loadComponent),
  );
}
