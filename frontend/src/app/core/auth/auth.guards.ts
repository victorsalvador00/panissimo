import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Exige sesión; si no hay, manda a `/login?returnUrl=`. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isAuthenticated()) {
    return true;
  }
  const queryParams = state.url && state.url !== '/' ? { returnUrl: state.url } : {};
  return inject(Router).createUrlTree(['/login'], { queryParams });
};

/** El login solo se ve sin sesión. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;

/** Lee `route.data.permission`; sin ese permiso manda a `/sin-acceso`. */
export const permissionGuard: CanActivateFn = (route) => {
  const permission = route.data['permission'] as string | undefined;
  if (!permission || inject(AuthService).can(permission)) {
    return true;
  }
  return inject(Router).createUrlTree(['/sin-acceso']);
};
