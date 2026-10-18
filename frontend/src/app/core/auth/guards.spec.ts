import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Schemas } from '../api/api';
import { AuthService } from './auth.service';
import { authGuard, guestGuard, permissionGuard } from './guards';

function signInWith(permissions: string[]): void {
  const user: Schemas['MeDto'] = {
    id: 'u1',
    email: 'a@b.mx',
    fullName: 'Ana',
    defaultLocationId: null,
    permissions,
    allLocations: false,
    locations: [],
  };
  TestBed.inject(AuthService).user.set(user);
}

function route(data: Record<string, unknown>): ActivatedRouteSnapshot {
  return { data, queryParamMap: convertToParamMap({}) } as unknown as ActivatedRouteSnapshot;
}

const state = { url: '/inventario/existencias' } as RouterStateSnapshot;
const run = (guard: typeof authGuard, data: Record<string, unknown> = {}) =>
  TestBed.runInInjectionContext(() => guard(route(data), state));
const serialize = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

describe('guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('authGuard sends to the login with the return url', () => {
    expect(serialize(run(authGuard))).toBe('/login?returnUrl=%2Finventario%2Fexistencias');
    signInWith([]);
    expect(run(authGuard)).toBe(true);
  });

  it('guestGuard keeps signed-in users out of the login, towards their return url', () => {
    expect(run(guestGuard)).toBe(true);
    signInWith([]);
    expect(serialize(run(guestGuard))).toBe('/');
    const withReturn = {
      data: {},
      queryParamMap: convertToParamMap({ returnUrl: '/admin/usuarios' }),
    };
    expect(
      serialize(TestBed.runInInjectionContext(() => guestGuard(withReturn as never, state))),
    ).toBe('/admin/usuarios');
  });

  it('permissionGuard accepts the permission or any of the list', () => {
    signInWith(['purchasing.view']);
    expect(run(permissionGuard)).toBe(true);
    expect(run(permissionGuard, { permission: 'purchasing.view' })).toBe(true);
    expect(run(permissionGuard, { permission: ['production.view', 'purchasing.view'] })).toBe(true);
    expect(serialize(run(permissionGuard, { permission: 'catalog.manage' }))).toBe('/sin-acceso');
  });
});
