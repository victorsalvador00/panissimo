import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { MENU } from './menu';

export interface Crumb {
  label: string;
  /** Sin url, la miga no es enlace (sección o página actual). */
  url?: string;
}

/**
 * Migas de pan de la ruta actual: la sección del menú a la que pertenece y los títulos de las
 * rutas activas (`Inventario › Ajustes › AJU-000123`). La última es la página actual.
 */
@Injectable({ providedIn: 'root' })
export class BreadcrumbsService {
  private readonly router = inject(Router);

  readonly crumbs = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => buildCrumbs(this.router.routerState.snapshot.root, this.router.url)),
    ),
    { initialValue: [] as Crumb[] },
  );
}

export function buildCrumbs(root: ActivatedRouteSnapshot, currentUrl: string): Crumb[] {
  const crumbs: Crumb[] = [];
  const path = currentUrl.split(/[?#]/)[0];

  const section = MENU.find((s) =>
    s.items.some((item) => item.route !== '/' && path.startsWith(item.route)),
  );
  if (section) {
    crumbs.push({ label: section.label });
  }

  let url = '';
  let route: ActivatedRouteSnapshot | null = root;
  while (route) {
    const segment = route.url.map((s) => s.path).join('/');
    if (segment) {
      url += `/${segment}`;
    }
    const title: unknown = route.routeConfig?.title;
    if (typeof title === 'string' && route.firstChild?.routeConfig?.title !== title) {
      crumbs.push({ label: title, url: url || '/' });
    }
    route = route.firstChild;
  }

  if (crumbs.length) {
    delete crumbs[crumbs.length - 1].url;
  }
  return crumbs;
}
