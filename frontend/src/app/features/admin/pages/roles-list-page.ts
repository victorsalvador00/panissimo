import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { RoleListItem, RolesApi } from '../data-access/roles.api';

@Component({
  selector: 'app-roles-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Roles"
        subtitle="Conjuntos de permisos que se asignan a los usuarios."
      >
        <a mat-flat-button routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo rol
        </a>
      </app-page-header>

      <app-data-table
        [columns]="columns"
        [rows]="roles.value()?.items ?? []"
        [total]="roles.value()?.total ?? 0"
        [loading]="roles.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar rol"
        emptyMessage="No hay roles con ese nombre."
        [emptyActionLabel]="'Nuevo rol'"
        (emptyAction)="goToNew()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="name" let-row>
          {{ row.name }}
          @if (row.isSystem) {
            <app-status-tag label="Predefinido" color="blue" />
          }
        </ng-template>
        <ng-template appCardDef let-row>
          <strong>{{ row.name }}</strong>
          <div class="muted">{{ row.description }}</div>
          <div class="muted">{{ row.permissionCount }} permisos · {{ row.userCount }} usuarios</div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    app-status-tag {
      margin-inline-start: var(--sgo-space-2);
    }
  `,
})
export class RolesListPage {
  private readonly api = inject(RolesApi);
  private readonly router = inject(Router);

  protected goToNew(): void {
    void this.router.navigateByUrl('/admin/roles/nuevo');
  }

  protected readonly columns: TableColumn<RoleListItem>[] = [
    { key: 'name', header: 'Rol', sortable: true },
    { key: 'description', header: 'Descripción' },
    { key: 'permissionCount', header: 'Permisos', align: 'end' },
    { key: 'userCount', header: 'Usuarios', align: 'end', sortable: true },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('name:asc'));

  protected readonly roles = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });

  protected open(role: RoleListItem): void {
    void this.router.navigate(['/admin/roles', role.id]);
  }
}
