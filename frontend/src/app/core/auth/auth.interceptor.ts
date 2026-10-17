import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adds `Authorization: Bearer` (frontend §5). On a 401 it renews the token once (shared among concurrent requests and
 * serialized across tabs by AuthService.refresh) and repeats the request; if the renewal fails the session expires.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (isTokenEndpoint(req.url)) return next(req);

  return next(withToken(req, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !auth.isAuthenticated())
        return throwError(() => error);
      return from(auth.refresh()).pipe(
        catchError(() => {
          auth.expire();
          return throwError(() => error);
        }),
        switchMap((token) => next(withToken(req, token))),
      );
    }),
  );
};

/** Login and refresh authenticate with the body or the cookie, never with the bearer. */
function isTokenEndpoint(url: string): boolean {
  return /\/auth\/(login|refresh)$/.test(url);
}

function withToken<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
