import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ConflictHandler } from './conflict-handler';
import { Notifier } from './notifier';
import { toProblem } from './problem-details';

/** The caller shows the error itself (login, imports): the interceptor stays quiet. */
export const SILENT_ERRORS = new HttpContextToken<boolean>(() => false);

/**
 * Notices for failed requests (frontend §6). 400 is left to the form (`FormErrors`) and 401 to the auth interceptor;
 * the 409 `concurrency` and `insufficient_stock` open their dialogs (ConflictHandler). The error is always rethrown so
 * the caller can react.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifier = inject(Notifier);
  const conflicts = inject(ConflictHandler);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        !req.context.get(SILENT_ERRORS) &&
        !conflicts.handle(error)
      ) {
        const message = noticeFor(error);
        if (message) notifier.error(message);
      }
      return throwError(() => error);
    }),
  );
};

/** The notice for a failed request, or null when someone else handles it. */
export function noticeFor(error: HttpErrorResponse): string | null {
  const problem = toProblem(error);
  switch (problem.status) {
    case 400:
    case 401:
      return null;
    case 403:
      return 'No tienes permiso para esta acción.';
    case 0:
      return problem.detail ?? null;
  }
  if (problem.status >= 500) {
    const detail = problem.detail ?? 'Ocurrió un error inesperado.';
    return problem.traceId ? `${detail} (Folio: ${problem.traceId})` : detail;
  }
  return problem.detail ?? problem.title ?? 'No se pudo completar la acción.';
}
