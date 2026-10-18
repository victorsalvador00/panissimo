import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Route data key with the permission, or list of permissions (any one is enough), a route needs. */
export const PERMISSION = 'permission';

/** Without a session, to /login remembering where the user was going. */
export const authGuard: CanActivateFn = (_route, state) =>
  inject(AuthService).isAuthenticated() ||
  inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

/** The login is only for users without a session; with one, straight to where they were going. */
export const guestGuard: CanActivateFn = (route) =>
  !inject(AuthService).isAuthenticated() ||
  inject(Router).parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl') ?? undefined));

/** Only paths of this app: never another site (`//host`) nor the login itself. */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login')
    ? url
    : '/';
}

/** Reads `data.permission` (string or list); without it, to /sin-acceso. The backend protects anyway. */
export const permissionGuard: CanActivateFn = (route) => {
  const permission = route.data[PERMISSION] as string | readonly string[] | undefined;
  return (
    permission === undefined ||
    inject(AuthService).can(permission) ||
    inject(Router).createUrlTree(['/sin-acceso'])
  );
};
