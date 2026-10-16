import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RolesApi } from '../data-access/roles.api';
import { UserFilters, UserListItem, UsersApi } from '../data-access/users.api';
import { UserStatusTag } from '../ui/user-status-tag';

@Component({
  selector: 'app-users-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    UserStatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Usuarios" subtitle="Cuentas, roles y ubicaciones permitidas.">
        <a mat-flat-button routerLink="nuevo">
          <mat-icon>person_add</mat-icon>
          Nuevo usuario
        </a>
      </app-page-header>

      <div class="sgo-row filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select
            [value]="filters().isActive ?? null"
            (valueChange)="setFilter('isActive', $event)"
          >
            <mat-option [value]="null">Todos</mat-option>
            <mat-option [value]="true">Activos</mat-option>
            <mat-option [value]="false">Inactivos</mat-option>
          </mat-select>
        </mat-form-field>
        @if (canListRoles) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Rol</mat-label>
            <mat-select
              [value]="filters().roleId ?? null"
              (valueChange)="setFilter('roleId', $event)"
            >
              <mat-option [value]="null">Todos</mat-option>
              @for (role of roles.value() ?? []; track role.id) {
                <mat-option [value]="role.id">{{ role.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Ubicación</mat-label>
          <mat-select
            [value]="filters().locationId ?? null"
            (valueChange)="setFilter('locationId', $event)"
          >
            <mat-option [value]="null">Todas</mat-option>
            @for (location of locations(); track location.id) {
              <mat-option [value]="location.id"
                >{{ location.code }} · {{ location.name }}</mat-option
              >
            }
          </mat-select>
        </mat-form-field>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="users.value()?.items ?? []"
        [total]="users.value()?.total ?? 0"
        [loading]="users.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por nombre o correo"
        emptyMessage="No hay usuarios con esos filtros."
        [emptyActionLabel]="'Nuevo usuario'"
        (emptyAction)="goToNew()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="status" let-row>
          <app-user-status-tag [user]="row" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.fullName }}</strong>
            <app-user-status-tag [user]="row" />
          </div>
          <div class="muted">{{ row.email }}</div>
          <div class="muted">{{ row.roles.join(', ') }} · {{ row.locationCodes.join(', ') }}</div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      margin-bottom: var(--sgo-space-4);
    }
    .filters mat-form-field {
      width: 220px;
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class UsersListPage {
  private readonly api = inject(UsersApi);
  private readonly rolesApi = inject(RolesApi);
  private readonly router = inject(Router);

  protected readonly canListRoles = inject(AuthService).can('security.roles.manage');

  protected goToNew(): void {
    void this.router.navigateByUrl('/admin/usuarios/nuevo');
  }
  protected readonly locations = inject(LocationContextService).locations;

  protected readonly columns: TableColumn<UserListItem>[] = [
    { key: 'fullName', header: 'Nombre', sortable: true },
    { key: 'email', header: 'Correo', sortable: true },
    { key: 'roles', header: 'Roles', value: (u) => u.roles.join(', ') },
    { key: 'locationCodes', header: 'Ubicaciones', value: (u) => u.locationCodes.join(', ') },
    { key: 'status', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('fullName:asc'));
  protected readonly filters = signal<UserFilters>({});

  protected readonly users = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  /** `GET /roles` exige `security.roles.manage`: sin ese permiso no se filtra por rol. */
  protected readonly roles = rxResource({
    stream: () =>
      this.canListRoles
        ? this.rolesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items))
        : of([]),
  });

  protected setFilter<K extends keyof UserFilters>(key: K, value: UserFilters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected open(user: UserListItem): void {
    void this.router.navigate(['/admin/usuarios', user.id]);
  }
}
