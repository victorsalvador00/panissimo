import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { PendingTasksService } from './pending-tasks.service';

/** RN-118: after a change is saved (any successful request other than GET) the menu badges refresh. */
export const pendingTasksInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next(req);
  const tasks = inject(PendingTasksService);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.ok) tasks.refreshSoon();
    }),
  );
};
