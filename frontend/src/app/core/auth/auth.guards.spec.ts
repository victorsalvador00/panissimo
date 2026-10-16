import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authGuard, guestGuard, permissionGuard } from './auth.guards';
import { provideHttpTesting, signIn } from './testing';

@Component({ template: 'página' })
class DummyPage {}

describe('guardas', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: provideHttpTesting([
        { path: 'login', canActivate: [guestGuard], component: DummyPage },
        { path: 'sin-acceso', component: DummyPage },
        {
          path: '',
          canActivate: [authGuard],
          children: [
            { path: '', component: DummyPage },
            {
              path: 'admin/usuarios',
              canActivate: [permissionGuard],
              data: { permission: 'security.users.manage' },
              component: DummyPage,
            },
          ],
        },
      ]),
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function navigate(url: string): Promise<string> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  }

  it('authGuard sin sesión manda a /login con returnUrl', async () => {
    expect(await navigate('/admin/usuarios')).toBe('/login?returnUrl=%2Fadmin%2Fusuarios');
  });

  it('permissionGuard deja pasar con el permiso', async () => {
    signIn({ permissions: ['security.users.manage'] });
    expect(await navigate('/admin/usuarios')).toBe('/admin/usuarios');
  });

  it('permissionGuard sin el permiso manda a /sin-acceso', async () => {
    signIn({ permissions: ['inventory.view'] });
    expect(await navigate('/admin/usuarios')).toBe('/sin-acceso');
  });

  it('guestGuard con sesión manda del login al tablero', async () => {
    signIn();
    expect(await navigate('/login')).toBe('/');
  });
});
