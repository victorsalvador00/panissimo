import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';
import type { Schemas } from '../../core/api/api-types';

export type LocationOption = Schemas['LocationLookupDto'];

/**
 * Todas las ubicaciones activas (`GET /locations/lookup`), no solo las del usuario: el destino de un
 * traspaso suele ser una ubicación a la que quien despacha no tiene acceso. Se pide una vez por sesión.
 */
@Injectable({ providedIn: 'root' })
export class LocationLookupService {
  private readonly http = inject(HttpClient);
  private cache$?: Observable<LocationOption[]>;

  all(): Observable<LocationOption[]> {
    this.cache$ ??= this.http.get<LocationOption[]>('/locations/lookup').pipe(
      // Si falla, el siguiente intento vuelve a pedirla.
      catchError((error: unknown) => {
        this.cache$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.cache$;
  }
}
