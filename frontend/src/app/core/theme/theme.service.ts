import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

/** Clave en localStorage; `index.html` la lee antes de que arranque Angular para no mostrar un destello claro. */
export const THEME_STORAGE_KEY = 'sgo.theme';

export const THEME_OPTIONS: readonly { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Claro', icon: 'light_mode' },
  { mode: 'dark', label: 'Oscuro', icon: 'dark_mode' },
  { mode: 'system', label: 'Según el sistema', icon: 'brightness_auto' },
];

/**
 * Tema claro u oscuro por dispositivo (se guarda en el navegador). "Según el sistema" sigue la configuración del
 * celular o la computadora. El tema de Material usa `light-dark()`: basta con fijar `data-theme` en `<html>`
 * (ver styles.scss) y todo cambia sin recargar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = signal<ThemeMode>(readStoredMode());
  /** Lo que se ve en pantalla, resolviendo "Según el sistema". */
  readonly dark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    effect(() => {
      const mode = this.mode();
      const root = this.document.documentElement;
      if (mode === 'system') {
        delete root.dataset['theme'];
      } else {
        root.dataset['theme'] = mode;
      }
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      if (mode === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema aplica solo en esta sesión.
    }
  }
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
