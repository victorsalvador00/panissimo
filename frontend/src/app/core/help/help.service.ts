import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { HELP, HelpTopic } from './help-content';

/** The route pattern of a snapshot chain: `produccion/ordenes/:id/cerrar`; `''` for the dashboard. */
export function routePattern(root: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  let route: ActivatedRouteSnapshot | null = root;
  while (route) {
    const path = route.routeConfig?.path;
    if (path) parts.push(path);
    route = route.firstChild;
  }
  return parts.join('/');
}

/**
 * Contextual help (frontend §4.3): the manual of the current screen, resolved by its route pattern. The panel closes when
 * the screen changes; the topic follows the route.
 */
@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly pattern = signal(routePattern(this.router.routerState.snapshot.root));
  readonly topic = signal<HelpTopic | null>(null);
  /** A navigation started with the panel open: it closes when that navigation ends. */
  private closeOnEnd = false;

  constructor() {
    this.update();
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      // Only navigations started after opening close the panel: the first one of the app may end later than that.
      if (event instanceof NavigationStart && this.open()) this.closeOnEnd = true;
      if (event instanceof NavigationEnd) {
        if (this.closeOnEnd) this.open.set(false);
        this.closeOnEnd = false;
        this.update();
      }
    });
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  close(): void {
    this.open.set(false);
  }

  private update(): void {
    const pattern = routePattern(this.router.routerState.snapshot.root);
    this.pattern.set(pattern);
    this.topic.set(HELP[pattern] ?? null);
  }
}
