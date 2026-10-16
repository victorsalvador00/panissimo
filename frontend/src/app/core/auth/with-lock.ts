import { Observable, Subscription } from 'rxjs';

/**
 * Ejecuta `work` mientras sostiene un candado compartido por todas las pestañas del sitio (Web Locks
 * API). Así dos pestañas no renuevan la sesión con la misma cookie al mismo tiempo: la segunda espera y
 * usa la cookie nueva. Sin la API (navegadores viejos, pruebas) ejecuta `work` directamente.
 */
export function withLock<T>(name: string, work: () => Observable<T>): Observable<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    return work();
  }
  return new Observable<T>((subscriber) => {
    let inner: Subscription | undefined;
    let release: (() => void) | undefined;

    locks
      .request(
        name,
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
            if (subscriber.closed) {
              resolve();
              return;
            }
            inner = work().subscribe({
              next: (value) => subscriber.next(value),
              error: (error: unknown) => {
                resolve();
                subscriber.error(error);
              },
              complete: () => {
                resolve();
                subscriber.complete();
              },
            });
          }),
      )
      .catch((error: unknown) => subscriber.error(error));

    return () => {
      inner?.unsubscribe();
      release?.();
    };
  });
}
