import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../api/api';
import { apiBaseInterceptor } from '../http/api-base.interceptor';
import { Notifier } from '../http/notifier';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const me: Schemas['MeDto'] = {
  id: 'u1',
  email: 'ana@panissimo.mx',
  fullName: 'Ana',
  defaultLocationId: null,
  permissions: ['inventory.view'],
  allLocations: false,
  locations: [],
};

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('AuthService', () => {
  const notifier = { info: vi.fn(), error: vi.fn() };
  let auth: AuthService;
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([apiBaseInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: Notifier, useValue: notifier },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  async function signIn(token = 'token-1'): Promise<void> {
    const restoring = auth.restoreSession();
    backend.expectOne('/api/v1/auth/refresh').flush({ accessToken: token, expiresIn: 900 });
    await tick();
    backend.expectOne('/api/v1/me').flush(me);
    await restoring;
  }

  it('restores the session from the refresh cookie and loads /me', async () => {
    await signIn();
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe('token-1');
    expect(auth.can('inventory.view')).toBe(true);
    expect(auth.can(['catalog.manage', 'inventory.view'])).toBe(true);
    expect(auth.can('catalog.manage')).toBe(false);
  });

  it('starts without a session when the refresh is rejected', async () => {
    const restoring = auth.restoreSession();
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await restoring;
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('sends the bearer and renews only once for concurrent 401s', async () => {
    await signIn();
    const items = firstValueFrom(http.get<string[]>('items'));
    const units = firstValueFrom(http.get<string[]>('units'));

    for (const url of ['/api/v1/items', '/api/v1/units']) {
      const request = backend.expectOne(url);
      expect(request.request.headers.get('Authorization')).toBe('Bearer token-1');
      request.flush({}, { status: 401, statusText: 'Unauthorized' });
    }

    const refresh = backend.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ accessToken: 'token-2', expiresIn: 900 });
    await tick();

    for (const url of ['/api/v1/items', '/api/v1/units']) {
      const retry = backend.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
      retry.flush([url]);
    }
    expect(await items).toEqual(['/api/v1/items']);
    expect(await units).toEqual(['/api/v1/units']);
  });

  it('expires the session when the renewal fails and goes to the login with the return url', async () => {
    await signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const request = firstValueFrom(http.get('items'));

    backend.expectOne('/api/v1/items').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(request).rejects.toMatchObject({ status: 401 });
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/' } });
    expect(notifier.info).toHaveBeenCalledWith('Tu sesión terminó. Inicia sesión de nuevo.');
  });

  it('does not renew for a 401 without a session (wrong password at login)', async () => {
    const login = auth.login('ana@panissimo.mx', 'mala');
    backend.expectOne('/api/v1/auth/login').flush(
      {
        title: 'No autenticado',
        status: 401,
        code: 'invalid_credentials',
        detail: 'Correo o contraseña incorrectos.',
      },
      { status: 401, statusText: 'Unauthorized' },
    );
    await expect(login).rejects.toMatchObject({ status: 401 });
    backend.expectNone('/api/v1/auth/refresh');
  });
});
