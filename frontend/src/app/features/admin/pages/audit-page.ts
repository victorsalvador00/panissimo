import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, debounceTime, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable, RowDetail } from '../../../shared/components/data-table/data-table';
import { LookupPicker } from '../../../shared/components/lookup-picker/lookup-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AuditApi,
  AuditEntry,
  formatChanges,
} from '../../../shared/data-access/audit';
import { ListQuery } from '../../../shared/data-access/list-query';
import { UserListItem, UsersApi } from '../data-access/admin-api';

/** /admin/bitacora (frontend §7.8): filters by entity, user and dates; the detail shows the formatted changes. */
@Component({
  selector: 'app-audit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    RowDetail,
    LookupPicker,
  ],
  templateUrl: './audit-page.html',
  styleUrls: ['./admin-list.scss', './audit-page.scss'],
})
export class AuditPage {
  private readonly api = inject(AuditApi);
  private readonly usersApi = inject(UsersApi);

  protected readonly actions = AUDIT_ACTIONS;
  protected readonly entities = AUDIT_ENTITIES;
  protected readonly entityOptions = Object.entries(AUDIT_ENTITIES)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  /** Filtering by user needs the user list (security.users.manage). */
  protected readonly canPickUser = inject(AuthService).can('security.users.manage');

  protected readonly filters = new FormGroup({
    entityType: new FormControl<string | null>(null),
    user: new FormControl<UserListItem | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25 });

  protected readonly log = rxResource({
    params: () => ({ query: this.query(), filters: this.applied() }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        entityType: params.filters.entityType,
        userId: params.filters.user?.id,
        from: startOfDay(params.filters.from),
        to: endOfDay(params.filters.to),
      }),
  });
  protected readonly rows = computed(() => (this.log.hasValue() ? this.log.value().items : []));
  protected readonly total = computed(() => (this.log.hasValue() ? this.log.value().total : 0));

  protected readonly searchUsers = (q: string): Observable<UserListItem[]> =>
    this.usersApi
      .list({ page: 1, pageSize: 20, q: q || undefined, sort: 'fullName' })
      .pipe(map((page) => page.items));
  protected readonly userName = (user: UserListItem) => user.fullName;
  protected readonly userEmail = (user: UserListItem) => user.email;

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe(() => {
      if (this.filters.invalid) return;
      this.applied.set(this.filters.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected changes(entry: AuditEntry) {
    return formatChanges(entry.action, entry.changes);
  }

  protected clear(): void {
    this.filters.reset();
  }
}

function startOfDay(date: Date | null): string | null {
  if (!date) return null;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function endOfDay(date: Date | null): string | null {
  if (!date) return null;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}
