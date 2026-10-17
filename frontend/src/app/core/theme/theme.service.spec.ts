import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.clear();
    delete root.dataset['theme'];
    TestBed.resetTestingModule();
  });

  it('follows the system by default and does not pin the theme', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode()).toBe('system');
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('applies and remembers a chosen mode', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    expect(root.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(ThemeService.storageKey)).toBe('dark');
    expect(theme.isDark()).toBe(true);

    theme.setMode('light');
    expect(root.dataset['theme']).toBe('light');
    expect(theme.isDark()).toBe(false);
  });

  it('"Según el sistema" removes the key and the attribute', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');
    theme.setMode('system');
    expect(localStorage.getItem(ThemeService.storageKey)).toBeNull();
    expect(root.dataset['theme']).toBeUndefined();
  });

  it('starts with the stored mode and ignores unknown values', () => {
    localStorage.setItem(ThemeService.storageKey, 'dark');
    expect(TestBed.inject(ThemeService).mode()).toBe('dark');

    TestBed.resetTestingModule();
    localStorage.setItem(ThemeService.storageKey, 'sepia');
    expect(TestBed.inject(ThemeService).mode()).toBe('system');
  });
});
