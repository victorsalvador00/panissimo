import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { RolesApi } from '../data-access/admin-api';

/** /admin/roles (frontend §7.8). */
@Component({
  selector: 'app-roles-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeader, DataTable, CellDef, StatusTag],
  template: `
    <app-page-header title="Roles">
      <a matButton="filled" routerLink="nuevo">
        <mat-icon>add</mat-icon>
        Nuevo rol
      </a>
    </app-page-header>

    <app-data-table
      label="Roles"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="roles.isLoading()"
      emptyMessage="No hay roles."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="name" header="Nombre" [appCellOf]="rows()" let-role>
        <a class="row-link" [routerLink]="role.id">{{ role.name }}</a>
        @if (role.isAdministrator) {
          <app-status-tag text="Todos los permisos" color="blue" />
        } @else if (role.isSystem) {
          <app-status-tag text="Del sistema" color="grey" />
        }
      </ng-template>
      <ng-template appCell="description" header="Descripción" [appCellOf]="rows()" let-role>
        {{ role.description }}
      </ng-template>
      <ng-template appCell="permissions" header="Permisos" end [appCellOf]="rows()" let-role>
        {{ role.permissionCount }}
      </ng-template>
      <ng-template appCell="users" header="Usuarios" end [appCellOf]="rows()" let-role>
        {{ role.userCount }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: './admin-list.scss',
})
export class RolesListPage {
  private readonly api = inject(RolesApi);

  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25 });
  protected readonly roles = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly rows = computed(() => (this.roles.hasValue() ? this.roles.value().items : []));
  protected readonly total = computed(() => (this.roles.hasValue() ? this.roles.value().total : 0));
}
