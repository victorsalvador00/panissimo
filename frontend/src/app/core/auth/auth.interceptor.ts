import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Agrega `Authorization: Bearer`. Ante un 401 renueva el token una sola vez (compartido entre
 * peticiones concurrentes) y reintenta; si la renovación falla, cierra la sesión y va a `/login`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();

  return next(token ? withBearer(req, token) : req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthEndpoint(req)) {
        return throwError(() => error);
      }
      return auth.refreshAccessToken().pipe(
        catchError(() => {
          auth.sessionExpired(router.url);
          return throwError(() => error);
        }),
        switchMap((newToken) => next(withBearer(req, newToken))),
      );
    }),
  );
};

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** Login, refresh y logout responden 401 por sí mismos: no se reintentan. */
function isAuthEndpoint(req: HttpRequest<unknown>): boolean {
  return req.url.includes('/auth/');
}
