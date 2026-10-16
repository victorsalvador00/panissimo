import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { SupplierDto, SupplierFilters, SuppliersApi } from '../data-access/suppliers.api';

export function creditLabel(days: number): string {
  return days === 0 ? 'Contado' : `${days} días`;
}

/** Proveedores (`/compras/proveedores`), permiso `purchasing.view`. */
@Component({
  selector: 'app-suppliers-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
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
        title="Proveedores"
        subtitle="Datos fiscales, crédito y artículos que surte cada proveedor."
      >
        @if (canManage) {
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Nuevo proveedor
          </a>
        }
      </app-page-header>

      <div class="sgo-row filters">
        <mat-slide-toggle
          [checked]="!!filters().includeInactive"
          (change)="setIncludeInactive($event.checked)"
        >
          Mostrar inactivos
        </mat-slide-toggle>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="suppliers.value()?.items ?? []"
        [total]="suppliers.value()?.total ?? 0"
        [loading]="suppliers.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por razón social o RFC"
        emptyMessage="No hay proveedores con esos filtros."
        [emptyActionLabel]="canManage ? 'Nuevo proveedor' : undefined"
        (emptyAction)="create()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="isActive" let-row>
          <app-status-tag
            [label]="row.isActive ? 'Activo' : 'Inactivo'"
            [color]="row.isActive ? 'green' : 'gray'"
          />
        </ng-template>
        <ng-template appCardDef let-row>
          <strong>{{ row.name }}</strong>
          <div class="muted">
            {{ row.taxId }} · Crédito: {{ credit(row.paymentTermsDays) }}
            @if (!row.isActive) {
              · Inactivo
            }
          </div>
          @if (row.contactName || row.phone) {
            <div class="muted">{{ contact(row) }}</div>
          }
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      margin-bottom: var(--sgo-space-4);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SuppliersListPage {
  private readonly api = inject(SuppliersApi);
  private readonly router = inject(Router);

  protected readonly canManage = inject(AuthService).can('purchasing.suppliers.manage');

  protected readonly columns: TableColumn<SupplierDto>[] = [
    { key: 'name', header: 'Razón social', sortable: true },
    { key: 'taxId', header: 'RFC', sortable: true },
    { key: 'contactName', header: 'Contacto' },
    { key: 'phone', header: 'Teléfono' },
    {
      key: 'paymentTermsDays',
      header: 'Crédito',
      sortable: true,
      align: 'end',
      value: (row) => creditLabel(row.paymentTermsDays),
    },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('name:asc'));
  protected readonly filters = signal<SupplierFilters>({});

  protected readonly suppliers = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected credit(days: number): string {
    return creditLabel(days);
  }

  protected contact(row: SupplierDto): string {
    return [row.contactName, row.phone].filter(Boolean).join(' · ');
  }

  protected setIncludeInactive(checked: boolean): void {
    this.filters.set({ includeInactive: checked || null });
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected create(): void {
    void this.router.navigate(['/compras/proveedores/nuevo']);
  }

  protected open(supplier: SupplierDto): void {
    void this.router.navigate(['/compras/proveedores', supplier.id]);
  }
}
