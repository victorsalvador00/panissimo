import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

describe('ThemeService', () => {
  let systemDark: boolean;
  let changeListener: ((event: { matches: boolean }) => void) | undefined;

  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete document.documentElement.dataset['theme'];
    systemDark = false;
    changeListener = undefined;
    // jsdom no implementa matchMedia: se define uno controlable por la prueba.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) =>
        ({
          matches: systemDark,
          media: query,
          addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
            (changeListener = listener),
        }) as unknown as MediaQueryList,
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete document.documentElement.dataset['theme'];
  });

  function create(): ThemeService {
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    return service;
  }

  it('sin preferencia guardada sigue al sistema y no fija data-theme', () => {
    systemDark = true;
    const theme = create();

    expect(theme.mode()).toBe('system');
    expect(theme.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBeUndefined();

    changeListener!({ matches: false });
    expect(theme.dark()).toBe(false);
  });

  it('elegir oscuro lo aplica y lo guarda en el navegador', () => {
    const theme = create();

    theme.set('dark');
    TestBed.tick();

    expect(theme.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('lee la preferencia guardada al arrancar y "según el sistema" la borra', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    systemDark = true;
    const theme = create();

    expect(theme.mode()).toBe('light');
    expect(theme.dark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    theme.set('system');
    TestBed.tick();

    expect(theme.dark()).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });

  it('ignora valores guardados que no conoce', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

    expect(create().mode()).toBe('system');
  });
});
