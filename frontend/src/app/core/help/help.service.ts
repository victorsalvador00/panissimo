import { computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { GENERIC_HELP, HELP, HelpTopic } from './help-content';

/**
 * Patrón de la ruta actual tal como está en la configuración, sin parámetros resueltos:
 * `/logistica/traspasos/0193…/recibir` → `logistica/traspasos/:id/recibir`; el tablero es `''`.
 */
export function routePattern(root: ActivatedRouteSnapshot): string {
  const segments: string[] = [];
  for (let node: ActivatedRouteSnapshot | null = root; node; node = node.firstChild) {
    const path = node.routeConfig?.path;
    if (path) {
      segments.push(path);
    }
  }
  return segments.join('/');
}

/** Ayuda de la pantalla en la que está el usuario (botón flotante, ver HelpButton). */
@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly router = inject(Router);

  readonly pattern = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => routePattern(this.router.routerState.snapshot.root)),
    ),
    { initialValue: routePattern(this.router.routerState.snapshot.root) },
  );

  readonly topic = computed<HelpTopic>(() => HELP[this.pattern()] ?? GENERIC_HELP);
}
