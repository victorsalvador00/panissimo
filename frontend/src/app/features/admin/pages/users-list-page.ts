import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime, map } from 'rxjs';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { RolesApi, UsersApi } from '../data-access/admin-api';

type StatusFilter = 'active' | 'inactive' | 'all';

/** /admin/usuarios (frontend §7.8): search by name or email, status and role. */
@Component({
  selector: 'app-users-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  templateUrl: './users-list-page.html',
  styleUrl: './admin-list.scss',
})
export class UsersListPage {
  private readonly api = inject(UsersApi);
  private readonly rolesApi = inject(RolesApi);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly status = signal<StatusFilter>('active');
  protected readonly roleId = signal<string | null>(null);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'fullName' });

  protected readonly users = rxResource({
    params: () => ({ query: this.query(), status: this.status(), roleId: this.roleId() }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        isActive: params.status === 'all' ? null : params.status === 'active',
        roleId: params.roleId,
      }),
  });
  protected readonly rows = computed(() => (this.users.hasValue() ? this.users.value().items : []));
  protected readonly total = computed(() => (this.users.hasValue() ? this.users.value().total : 0));

  protected readonly roles = rxResource({
    stream: () => this.rolesApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) =>
        this.query.update((query) => ({ ...query, page: 1, q: q.trim() || undefined })),
      );
  }

  protected setStatus(status: StatusFilter): void {
    this.status.set(status);
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected setRole(roleId: string | null): void {
    this.roleId.set(roleId);
    this.query.update((query) => ({ ...query, page: 1 }));
  }
}
