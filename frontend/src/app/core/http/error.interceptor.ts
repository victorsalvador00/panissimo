import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Notifier } from './notifier.service';
import { toProblem } from './problem-details';

/** Pon este token en `true` cuando la pantalla muestra el error por su cuenta (ej. login). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

export const MESSAGES = {
  forbidden: 'No tienes permiso para esta acción.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  unexpected: 'Ocurrió un error inesperado. Intenta de nuevo.',
  rateLimited: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
} as const;

/**
 * Muestra un aviso para los errores que no maneja la pantalla (spec frontend §6):
 * 403, 422, 429, 5xx y errores de red. 400 y 409 se reenvían al componente (formulario o diálogo),
 * 401 lo maneja `authInterceptor` y 404 depende del contexto.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifier = inject(Notifier);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !req.context.get(SKIP_ERROR_TOAST)) {
        const message = messageFor(error);
        if (message) {
          notifier.error(message);
        }
      }
      return throwError(() => error);
    }),
  );
};

function messageFor(error: HttpErrorResponse): string | null {
  const problem = toProblem(error);
  if (error.status === 0) {
    return MESSAGES.network;
  }
  if (error.status === 403) {
    return MESSAGES.forbidden;
  }
  if (error.status === 422) {
    return problem?.detail ?? MESSAGES.unexpected;
  }
  if (error.status === 429) {
    return problem?.detail ?? MESSAGES.rateLimited;
  }
  if (error.status >= 500) {
    const traceId = problem?.traceId;
    return traceId ? `${MESSAGES.unexpected} Código para soporte: ${traceId}` : MESSAGES.unexpected;
  }
  return null;
}
