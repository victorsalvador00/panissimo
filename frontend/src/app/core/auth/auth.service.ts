import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, firstValueFrom, map, Observable, shareReplay, switchMap, tap } from 'rxjs';
import type { ChangePasswordRequest, LoginRequest, MeDto, TokenResponse } from '../api/api-types';
import { SKIP_ERROR_TOAST } from '../http/error.interceptor';
import { withLock } from './with-lock';

const REFRESH_LOCK = 'sgo-auth-refresh';

/**
 * Sesión del usuario (spec frontend §5). El access token vive solo en memoria; el refresh token
 * está en una cookie HttpOnly que el navegador envía a `/api/v1/auth/*`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly token = signal<string | null>(null);
  private readonly me = signal<MeDto | null>(null);
  private refreshInFlight: Observable<string> | null = null;

  readonly accessToken = this.token.asReadonly();
  readonly user = this.me.asReadonly();
  readonly isAuthenticated = computed(() => this.me() !== null);
  readonly permissions = computed(() => new Set(this.me()?.permissions ?? []));

  /** Reactivo: dentro de un template o `computed` se reevalúa al cambiar la sesión. */
  can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  login(request: LoginRequest): Observable<void> {
    return this.http
      .post<TokenResponse>('/auth/login', request, { context: silent() })
      .pipe(switchMap((response) => this.startSession(response.accessToken)));
  }

  /**
   * Pide un access token nuevo con la cookie de refresh. Las llamadas concurrentes comparten
   * una sola petición: el backend rota el refresh token en cada uso.
   */
  refreshAccessToken(): Observable<string> {
    // Dentro de la pestaña se comparte la petición; entre pestañas se turnan con un candado.
    this.refreshInFlight ??= withLock(REFRESH_LOCK, () =>
      this.http.post<TokenResponse>('/auth/refresh', null, { context: silent() }),
    ).pipe(
      map((response) => response.accessToken),
      tap((accessToken) => this.token.set(accessToken)),
      finalize(() => (this.refreshInFlight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight;
  }

  /** Al iniciar la app: si la cookie de refresh sigue vigente, recupera la sesión (F5). */
  async restoreSession(): Promise<void> {
    try {
      const accessToken = await firstValueFrom(this.refreshAccessToken());
      await firstValueFrom(this.startSession(accessToken));
    } catch {
      this.clearSession();
    }
  }

  logout(): void {
    const done = () => {
      this.clearSession();
      void this.router.navigate(['/login']);
    };
    this.http
      .post('/auth/logout', null, { context: silent() })
      .subscribe({ next: done, error: done });
  }

  /** El backend cierra todas las sesiones al cambiar la contraseña: hay que volver a entrar. */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>('/me/change-password', request).pipe(
      tap(() => {
        this.clearSession();
        void this.router.navigate(['/login'], { queryParams: { motivo: 'contrasena' } });
      }),
    );
  }

  /** La sesión ya no se puede renovar: vuelve al login conservando la ruta actual. */
  sessionExpired(returnUrl: string): void {
    this.clearSession();
    const keep = returnUrl && returnUrl !== '/' && !returnUrl.startsWith('/login');
    void this.router.navigate(['/login'], { queryParams: keep ? { returnUrl } : {} });
  }

  /** Recarga `/me` (permisos y ubicaciones) sin tocar el token, ej. tras editar un rol propio. */
  reloadUser(): void {
    this.http
      .get<MeDto>('/me')
      .subscribe({ next: (me) => this.me.set(me), error: () => undefined });
  }

  clearSession(): void {
    this.token.set(null);
    this.me.set(null);
  }

  private startSession(accessToken: string): Observable<void> {
    this.token.set(accessToken);
    return this.http.get<MeDto>('/me').pipe(
      tap((me) => this.me.set(me)),
      map(() => undefined),
    );
  }
}

function silent(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_TOAST, true);
}
