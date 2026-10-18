import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { CustomersApi } from '../data-access/sales-api';

/** /ventas/clientes (frontend §7.7): search by code, name or RFC, with the inactive ones on demand. */
@Component({
  selector: 'app-customers-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Clientes">
      @if (canManage) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo cliente
        </a>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="search">
        <mat-label>Buscar por código, nombre o RFC</mat-label>
        <input matInput type="search" [formControl]="search" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
      <mat-slide-toggle [checked]="includeInactive()" (change)="setInactive($event.checked)">
        Mostrar inactivos
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Clientes"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="customers.isLoading()"
      emptyMessage="No hay clientes con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="code" header="Código" sortable [appCellOf]="rows()" let-customer>
        <a class="row-link" [routerLink]="customer.id">{{ customer.code }}</a>
      </ng-template>
      <ng-template appCell="name" header="Nombre" sortable [appCellOf]="rows()" let-customer>
        {{ customer.name }}
      </ng-template>
      <ng-template appCell="taxId" header="RFC" [appCellOf]="rows()" let-customer>
        {{ customer.taxId ?? '—' }}
      </ng-template>
      <ng-template appCell="contact" header="Contacto" [appCellOf]="rows()" let-customer>
        {{ customer.contactName ?? '—' }}
        @if (customer.phone) {
          · {{ customer.phone }}
        }
      </ng-template>
      <ng-template
        appCell="points"
        header="Puntos de entrega"
        end
        [appCellOf]="rows()"
        let-customer
      >
        {{ customer.deliveryPointCount }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-customer>
        <app-status-tag
          [text]="customer.isActive ? 'Activo' : 'Inactivo'"
          [color]="customer.isActive ? 'green' : 'grey'"
        />
      </ng-template>
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class CustomersListPage {
  private readonly api = inject(CustomersApi);
  protected readonly canManage = inject(AuthService).can('sales.customers.manage');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'name' });

  protected readonly customers = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive || null }),
  });
  protected readonly rows = computed(() =>
    this.customers.hasValue() ? this.customers.value().items : [],
  );
  protected readonly total = computed(() =>
    this.customers.hasValue() ? this.customers.value().total : 0,
  );

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }

  protected setInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.query.update((x) => ({ ...x, page: 1 }));
  }
}
