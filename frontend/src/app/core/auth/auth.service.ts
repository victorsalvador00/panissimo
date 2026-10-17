import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../api/api';
import { SILENT_ERRORS } from '../http/error.interceptor';
import { Notifier } from '../http/notifier';

type Me = Schemas['MeDto'];
type TokenResponse = Schemas['TokenResponse'];

/**
 * Session (frontend §5). The access token lives only in memory; the refresh token is an HttpOnly cookie the backend
 * rotates on every `POST /auth/refresh`. On start the session is restored from that cookie, so it survives F5.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  /** Tells the other tabs that this one signed out. */
  private readonly channel =
    typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('pan.auth');

  private readonly token = signal<string | null>(null);
  private pendingRefresh: Promise<string> | null = null;

  /** Current user with effective permissions and allowed locations (`GET /me`); null without a session. */
  readonly user = signal<Me | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  private readonly permissions = computed(() => new Set(this.user()?.permissions ?? []));

  constructor() {
    this.channel?.addEventListener('message', (event: MessageEvent) => {
      if (event.data === 'logout' && this.isAuthenticated()) this.endSession();
    });
  }

  accessToken(): string | null {
    return this.token();
  }

  /** Whether the user has the permission, or at least one of the list. Reactive: reads signals. */
  can(permission: string | readonly string[]): boolean {
    const granted = this.permissions();
    return typeof permission === 'string'
      ? granted.has(permission)
      : permission.some((p) => granted.has(p));
  }

  /** App start: restores the session from the refresh cookie; without one the guards send to /login. */
  async restoreSession(): Promise<void> {
    try {
      await this.refresh();
      await this.loadMe();
    } catch {
      this.clear();
    }
  }

  /** Signs in; a 401 or 429 rejects with the backend problem, which the login page shows. */
  async login(email: string, password: string): Promise<void> {
    const body: Schemas['LoginRequest'] = { email, password };
    const response = await firstValueFrom(
      this.http.post<TokenResponse>('auth/login', body, { context: silent() }),
    );
    this.token.set(response.accessToken);
    await this.loadMe();
  }

  /**
   * New access token from the refresh cookie. Concurrent callers share one request, and tabs take turns through a
   * Web Lock: the cookie rotates, so two tabs must not send the same one at once.
   */
  refresh(): Promise<string> {
    this.pendingRefresh ??= this.withRefreshLock(async () => {
      const response = await firstValueFrom(
        this.http.post<TokenResponse>('auth/refresh', null, { context: silent() }),
      );
      this.token.set(response.accessToken);
      return response.accessToken;
    }).finally(() => (this.pendingRefresh = null));
    return this.pendingRefresh;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('auth/logout', null, { context: silent() }));
    } catch {
      // The session ends locally anyway.
    }
    this.channel?.postMessage('logout');
    this.endSession();
  }

  /** The session could not be renewed: back to the login, returning to this page afterwards. */
  expire(): void {
    if (!this.isAuthenticated()) return;
    const returnUrl = this.router.url;
    this.clear();
    this.notifier.info('Tu sesión terminó. Inicia sesión de nuevo.');
    void this.router.navigate(['/login'], { queryParams: { returnUrl } });
  }

  /** Changes the password; the backend closes every session, so this one ends too. */
  async changePassword(request: Schemas['ChangePasswordRequest']): Promise<void> {
    await firstValueFrom(this.http.post('me/change-password', request));
    this.channel?.postMessage('logout');
    this.clear();
  }

  private async loadMe(): Promise<void> {
    this.user.set(await firstValueFrom(this.http.get<Me>('me')));
  }

  private endSession(): void {
    this.clear();
    void this.router.navigate(['/login']);
  }

  private clear(): void {
    this.token.set(null);
    this.user.set(null);
  }

  private withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request('pan.auth.refresh', task) : task();
  }
}

function silent(): HttpContext {
  return new HttpContext().set(SILENT_ERRORS, true);
}
