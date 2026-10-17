import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Light, dark or the operating system's preference (default). Chosen per device. */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Theme of the app (frontend §4.1). The choice is kept in localStorage `pan.theme` ("system" removes the key) and applied
 * as html[data-theme]; without it the CSS follows prefers-color-scheme live. The inline script in index.html applies the
 * same key before Angular boots, so there is no flash.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  static readonly storageKey = 'pan.theme';

  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);

  /** The chosen mode. */
  readonly mode = signal<ThemeMode>(this.readStoredMode());

  /** Whether the screen is dark right now (the chosen mode or, with "system", the OS). */
  readonly isDark = computed(
    () => this.mode() === 'dark' || (this.mode() === 'system' && this.systemDark()),
  );

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemDark.set(event.matches));
    this.apply(this.mode());
  }

  setMode(mode: ThemeMode): void {
    try {
      if (mode === 'system') localStorage.removeItem(ThemeService.storageKey);
      else localStorage.setItem(ThemeService.storageKey, mode);
    } catch {
      // Storage may be unavailable (private mode): the theme still applies for this session.
    }
    this.mode.set(mode);
    this.apply(mode);
  }

  private apply(mode: ThemeMode): void {
    const root = this.document.documentElement;
    if (mode === 'system') delete root.dataset['theme'];
    else root.dataset['theme'] = mode;
  }

  private readStoredMode(): ThemeMode {
    try {
      const stored = localStorage.getItem(ThemeService.storageKey);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }
}
