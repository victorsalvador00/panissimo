import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import type { Schemas } from './core/api/api';
import { AuthService } from './core/auth/auth.service';
import { NAVIGATION } from './core/layout/navigation';
import { Shell, sectionOf } from './core/layout/shell';

const location = (id: string, type: string): Schemas['MeLocationDto'] => ({
  id,
  code: id,
  name: id,
  type,
  isActive: true,
});

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('renders the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull();
  });

  it('shell shows the menu filtered by permissions and hides the selector with one location', async () => {
    TestBed.inject(AuthService).user.set({
      id: 'u1',
      email: 'encargado@panissimo.mx',
      fullName: 'Encargado Centro',
      defaultLocationId: 'centro',
      permissions: ['inventory.view', 'inventory.consumption', 'logistics.view'],
      allLocations: false,
      locations: [location('centro', 'Branch')],
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const sections = [...element.querySelectorAll('.nav-section')].map((h) =>
      h.textContent?.trim(),
    );
    expect(sections).toEqual(['General', 'Inventario', 'Logística']);
    expect(element.textContent).not.toContain('Usuarios');
    expect(element.querySelector('[aria-label="Ubicación activa"]')).toBeNull();
    expect(element.querySelector('[aria-label="Cuenta de Encargado Centro"]')).not.toBeNull();
  });

  it('folds a section from its header and remembers it', async () => {
    localStorage.removeItem('pan.sidebar.closed');
    TestBed.inject(AuthService).user.set({
      id: 'u1',
      email: 'encargado@panissimo.mx',
      fullName: 'Encargado Centro',
      defaultLocationId: 'centro',
      permissions: ['inventory.view'],
      allLocations: false,
      locations: [location('centro', 'Branch')],
    });
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = [...element.querySelectorAll<HTMLButtonElement>('.nav-section-toggle')].find(
      (b) => b.textContent?.trim() === 'Inventario',
    )!;
    const group = element.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(group.inert).toBe(false);

    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(group.inert).toBe(true);
    expect(group.classList).not.toContain('open');
    expect(JSON.parse(localStorage.getItem('pan.sidebar.closed')!)).toEqual(['Inventario']);

    toggle.click();
    await fixture.whenStable();
    expect(group.inert).toBe(false);
    expect(localStorage.getItem('pan.sidebar.closed')).toBeNull();
  });

  it('finds the section of the current page', () => {
    expect(sectionOf(NAVIGATION, '/')).toBe('General');
    expect(sectionOf(NAVIGATION, '/inventario/existencias?bajoMinimo=1')).toBe('Inventario');
    expect(sectionOf(NAVIGATION, '/produccion/ordenes/123')).toBe('Producción');
    expect(sectionOf(NAVIGATION, '/no-existe')).toBeNull();
  });
});
