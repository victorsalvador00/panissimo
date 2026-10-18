import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { endOfDayIso, startOfDayIso } from '../../../shared/forms/dates';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { CustomerOption, CustomerShipmentsApi } from '../data-access/sales-api';
import { CustomerPicker } from '../ui/customer-picker';

type Tab = NonNullable<ApiEnum<'CustomerShipmentTab'>>;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'ToDispatch', label: 'Por despachar' },
  { value: 'All', label: 'Todas' },
];

/** /ventas/remisiones (frontend §7.7): shipments by tab (kept in `?tab=`), with customer and date filters. */
@Component({
  selector: 'app-shipments-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    QtyPipe,
    CustomerPicker,
  ],
  template: `
    <app-page-header title="Remisiones" />

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Remisiones por estado">
      @for (option of tabs; track option.value) {
        <a
          mat-tab-link
          routerLink="."
          [queryParams]="{ tab: option.value }"
          [active]="current() === option.value"
        >
          {{ option.label }}
        </a>
      }
    </nav>

    <mat-tab-nav-panel #panel>
      <form class="filters" [formGroup]="filters" novalidate>
        <app-customer-picker class="search" formControlName="customer" label="Cliente" />
        <mat-form-field>
          <mat-label>Desde</mat-label>
          <input matInput [matDatepicker]="fromPicker" formControlName="from" />
          <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
          <mat-datepicker #fromPicker />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Hasta</mat-label>
          <input matInput [matDatepicker]="toPicker" formControlName="to" />
          <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
          <mat-datepicker #toPicker />
        </mat-form-field>
      </form>

      <app-data-table
        label="Remisiones"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="shipments.isLoading()"
        emptyMessage="No hay remisiones con estos filtros."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-shipment>
          <a class="row-link" [routerLink]="shipment.id">{{ shipment.folio }}</a>
        </ng-template>
        <ng-template appCell="order" header="Pedido" [appCellOf]="rows()" let-shipment>
          <a class="row-link" [routerLink]="['/ventas/pedidos', shipment.customerOrderId]">
            {{ shipment.customerOrderFolio }}
          </a>
        </ng-template>
        <ng-template appCell="customer" header="Cliente" [appCellOf]="rows()" let-shipment>
          {{ shipment.customerName }}
          @if (shipment.deliveryPointName) {
            <span class="muted">· {{ shipment.deliveryPointName }}</span>
          }
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-shipment>
          <app-status-tag [value]="shipment.status" kind="CustomerShipmentStatus" />
        </ng-template>
        <ng-template appCell="quantity" header="Cantidad" end [appCellOf]="rows()" let-shipment>
          {{ shipment.totalQuantity | qty }} · {{ shipment.lineCount }}
          {{ shipment.lineCount === 1 ? 'producto' : 'productos' }}
        </ng-template>
        <ng-template appCell="createdAt" header="Creada" sortable [appCellOf]="rows()" let-shipment>
          {{ shipment.createdAt | date: 'dd/MM/yyyy HH:mm' }}
        </ng-template>
        <ng-template
          appCell="dispatchedAt"
          header="Despachada"
          sortable
          [appCellOf]="rows()"
          let-shipment
        >
          {{ shipment.dispatchedAt ? (shipment.dispatchedAt | date: 'dd/MM/yyyy HH:mm') : '—' }}
        </ng-template>
      </app-data-table>
    </mat-tab-nav-panel>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
  styles: `
    .tabs {
      margin-bottom: 12px;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ShipmentsListPage {
  /** `?tab=`; by default the ones to dispatch. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(CustomerShipmentsApi);
  protected readonly tabs = TABS;
  protected readonly current = computed<Tab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'ToDispatch',
  );
  protected readonly filters = new FormGroup({
    customer: new FormControl<CustomerOption | string | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = linkedSignal<Tab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'createdAt:desc' }),
  });

  protected readonly shipments = rxResource({
    params: () => ({ query: this.query(), tab: this.current(), filters: this.applied() }),
    stream: ({ params }) => {
      const f = params.filters;
      return this.api.list(params.query, {
        tab: params.tab,
        customerId: f.customer && typeof f.customer === 'object' ? f.customer.id : null,
        from: startOfDayIso(f.from),
        to: endOfDayIso(f.to),
      });
    },
  });
  protected readonly rows = computed(() =>
    this.shipments.hasValue() ? this.shipments.value().items : [],
  );
  protected readonly total = computed(() =>
    this.shipments.hasValue() ? this.shipments.value().total : 0,
  );

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((x) => ({ ...x, page: 1 }));
    });
  }
}
