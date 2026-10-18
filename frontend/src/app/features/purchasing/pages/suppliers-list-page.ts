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
import { SuppliersApi } from '../data-access/purchasing-api';

/** /compras/proveedores (frontend §7.6): search by business name or RFC, with the inactive ones on demand. */
@Component({
  selector: 'app-suppliers-list-page',
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
    <app-page-header title="Proveedores">
      @if (canManage) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo proveedor
        </a>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="search">
        <mat-label>Buscar por razón social o RFC</mat-label>
        <input matInput type="search" [formControl]="search" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      </mat-form-field>
      <mat-slide-toggle [checked]="includeInactive()" (change)="setInactive($event.checked)">
        Mostrar inactivos
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Proveedores"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="suppliers.isLoading()"
      emptyMessage="No hay proveedores con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="name" header="Razón social" sortable [appCellOf]="rows()" let-supplier>
        <a class="row-link" [routerLink]="supplier.id">{{ supplier.name }}</a>
      </ng-template>
      <ng-template appCell="taxId" header="RFC" sortable [appCellOf]="rows()" let-supplier>
        {{ supplier.taxId }}
      </ng-template>
      <ng-template appCell="contact" header="Contacto" [appCellOf]="rows()" let-supplier>
        {{ supplier.contactName ?? '—' }}
        @if (supplier.phone) {
          · {{ supplier.phone }}
        }
      </ng-template>
      <ng-template appCell="terms" header="Crédito" end [appCellOf]="rows()" let-supplier>
        {{ supplier.paymentTermsDays === 0 ? 'Contado' : supplier.paymentTermsDays + ' días' }}
      </ng-template>
      <ng-template appCell="items" header="Artículos" end [appCellOf]="rows()" let-supplier>
        {{ supplier.itemCount }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-supplier>
        <app-status-tag
          [text]="supplier.isActive ? 'Activo' : 'Inactivo'"
          [color]="supplier.isActive ? 'green' : 'grey'"
        />
      </ng-template>
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class SuppliersListPage {
  private readonly api = inject(SuppliersApi);
  protected readonly canManage = inject(AuthService).can('purchasing.suppliers.manage');
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'name' });

  protected readonly suppliers = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive || null }),
  });
  protected readonly rows = computed(() =>
    this.suppliers.hasValue() ? this.suppliers.value().items : [],
  );
  protected readonly total = computed(() =>
    this.suppliers.hasValue() ? this.suppliers.value().total : 0,
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
