import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';
import type { MeDto } from '../api/api-types';
import { apiBaseInterceptor } from '../http/api-base.interceptor';
import { errorInterceptor } from '../http/error.interceptor';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/** HttpClient con los mismos interceptores que la app, contra HttpTestingController. */
export function provideHttpTesting(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiBaseInterceptor, authInterceptor, errorInterceptor])),
    provideHttpClientTesting(),
  ];
}

export function buildMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u-1',
    email: 'usuario@sgo.test',
    fullName: 'Usuario de Prueba',
    defaultLocationId: null,
    permissions: [],
    allLocations: false,
    locations: [],
    ...overrides,
  };
}

/** Inicia sesión respondiendo el login y `/me` con el usuario dado. */
export function signIn(me: Partial<MeDto> = {}, accessToken = 'token-1'): void {
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthService).login({ email: 'usuario@sgo.test', password: 'x' }).subscribe();
  http.expectOne('/api/v1/auth/login').flush({ accessToken, expiresIn: 900 });
  http.expectOne('/api/v1/me').flush(buildMe(me));
}
