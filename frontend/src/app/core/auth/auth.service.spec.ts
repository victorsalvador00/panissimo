import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { buildMe, provideHttpTesting, signIn } from './testing';

describe('AuthService e interceptor de autenticación', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideHttpTesting() });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  it('inicia sesión: guarda el token, carga /me y expone los permisos', () => {
    signIn({ permissions: ['inventory.view'] });

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.accessToken()).toBe('token-1');
    expect(auth.can('inventory.view')).toBe(true);
    expect(auth.can('security.users.manage')).toBe(false);
  });

  it('agrega el Bearer a las peticiones', () => {
    signIn();

    client.get('/items').subscribe();

    const req = http.expectOne('/api/v1/items');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush([]);
  });

  it('ante varios 401 concurrentes hace un solo refresh y reintenta todas con el token nuevo', () => {
    signIn();
    const results: unknown[] = [];

    client.get('/items').subscribe((r) => results.push(r));
    client.get('/stock').subscribe((r) => results.push(r));
    client.get('/alerts').subscribe((r) => results.push(r));

    for (const url of ['/api/v1/items', '/api/v1/stock', '/api/v1/alerts']) {
      http.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
    }

    const refreshes = http.match('/api/v1/auth/refresh');
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush({ accessToken: 'token-2', expiresIn: 900 });

    for (const url of ['/api/v1/items', '/api/v1/stock', '/api/v1/alerts']) {
      const retry = http.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
      retry.flush({ ok: url });
    }
    expect(results).toHaveLength(3);
    expect(auth.accessToken()).toBe('token-2');
  });

  it('si el refresh falla cierra la sesión y manda a /login con returnUrl', () => {
    signIn();
    vi.spyOn(router, 'url', 'get').mockReturnValue('/inventario/kardex');
    const errors: unknown[] = [];

    client.get('/items').subscribe({ error: (e) => errors.push(e) });
    client.get('/stock').subscribe({ error: (e) => errors.push(e) });
    http.expectOne('/api/v1/items').flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/v1/stock').flush(null, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ code: 'session_expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(errors).toHaveLength(2);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.accessToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/inventario/kardex' },
    });
  });

  it('no intenta refresh cuando el 401 viene del login (credenciales inválidas)', () => {
    let failed = false;
    auth.login({ email: 'a@b.mx', password: 'mala' }).subscribe({ error: () => (failed = true) });

    http
      .expectOne('/api/v1/auth/login')
      .flush(
        { detail: 'Correo o contraseña incorrectos.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    http.expectNone('/api/v1/auth/refresh');
    expect(failed).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('restoreSession recupera la sesión con la cookie de refresh (F5)', async () => {
    const restoring = auth.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'token-9', expiresIn: 900 });
    await Promise.resolve();
    http.expectOne('/api/v1/me').flush(buildMe({ fullName: 'Ana' }));
    await restoring;

    expect(auth.user()?.fullName).toBe('Ana');
    expect(auth.accessToken()).toBe('token-9');
  });

  it('restoreSession sin cookie deja la app sin sesión', async () => {
    const restoring = auth.restoreSession();
    http.expectOne('/api/v1/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await restoring;

    expect(auth.isAuthenticated()).toBe(false);
  });

  it('logout revoca la sesión en el backend y vuelve al login', () => {
    signIn();

    auth.logout();
    const req = http.expectOne('/api/v1/auth/logout');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
