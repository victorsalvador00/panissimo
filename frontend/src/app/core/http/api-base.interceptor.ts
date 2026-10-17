import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Data services use paths relative to the API (`'items'`, `'auth/login'`); this prefixes them with `/api/v1`.
 * Absolute URLs and paths starting with `/` (assets, `/health`) pass unchanged.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) =>
  isApiRelative(req.url)
    ? next(req.clone({ url: `${environment.apiBaseUrl}/${req.url}` }))
    : next(req);

function isApiRelative(url: string): boolean {
  return !url.startsWith('/') && !/^[a-z][a-z0-9+.-]*:/i.test(url);
}
