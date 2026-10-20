import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import {
  catchError,
  debounceTime,
  filter,
  fromEvent,
  merge,
  of,
  Subject,
  switchMap,
  timer,
} from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LocationContextService } from '../context/location-context.service';
import { SILENT_ERRORS } from '../http/error.interceptor';
import { navBadges, PendingTasks, TASK_PERMISSIONS } from './pending-tasks';

/** How often the badges refresh while the app is open. */
export const PENDING_TASKS_INTERVAL_MS = 60_000;

/**
 * RN-118: the pending documents of the user for the menu badges (`GET /my-tasks` of the active location). Refreshes
 * every minute, on navigation, when the tab becomes visible, when the location changes and after each saved change.
 */
@Injectable({ providedIn: 'root' })
export class PendingTasksService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly context = inject(LocationContextService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly tasks = signal<PendingTasks | null>(null);
  private readonly changes = new Subject<void>();

  /** Badge per menu route. */
  readonly badges = computed(() => navBadges(this.tasks()));
  /** Everything waiting, for the menu button on the phone. */
  readonly total = computed(() => [...this.badges().values()].reduce((sum, b) => sum + b.count, 0));

  /** Starts refreshing while the caller lives (the shell). */
  watch(destroyRef: DestroyRef): void {
    merge(
      timer(0, PENDING_TASKS_INTERVAL_MS),
      this.changes.pipe(debounceTime(500)),
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)),
      fromEvent(this.document, 'visibilitychange').pipe(
        filter(() => this.document.visibilityState === 'visible'),
      ),
      toObservable(this.context.active),
    )
      .pipe(
        debounceTime(50),
        switchMap(() => this.load()),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((tasks) => this.tasks.set(tasks));
  }

  /** Something was saved: the counts may have changed. */
  refreshSoon(): void {
    this.changes.next();
  }

  private load() {
    if (!this.auth.can(TASK_PERMISSIONS)) return of(null);
    const locationId = this.context.active()?.id;
    return this.http
      .get<PendingTasks>('my-tasks', {
        params: locationId ? { locationId } : {},
        // A badge that fails to refresh keeps its last value; no error banner every minute.
        context: new HttpContext().set(SILENT_ERRORS, true),
      })
      .pipe(catchError(() => of(this.tasks())));
  }
}
