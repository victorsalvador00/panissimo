import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** Antepone `apiBaseUrl` (`/api/v1`) a las rutas relativas: los servicios usan `/me`, `/items`, etc. */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const isAbsolute = /^https?:\/\//i.test(req.url);
  if (isAbsolute || req.url.startsWith(environment.apiBaseUrl) || !req.url.startsWith('/')) {
    return next(req);
  }
  return next(req.clone({ url: environment.apiBaseUrl + req.url }));
};
