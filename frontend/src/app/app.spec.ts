import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import type { Schemas } from './core/api/api';
import { AuthService } from './core/auth/auth.service';
import { Shell } from './core/layout/shell';

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
});
