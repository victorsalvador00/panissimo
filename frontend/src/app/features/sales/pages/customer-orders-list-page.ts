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
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ProgressMeter } from '../../../shared/components/progress-meter/progress-meter';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { toIsoDate } from '../../../shared/forms/dates';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { CustomerOption, CustomerOrdersApi } from '../data-access/sales-api';
import { CustomerPicker } from '../ui/customer-picker';

type Tab = NonNullable<ApiEnum<'CustomerOrderTab'>>;
type Status = ApiEnum<'CustomerOrderStatus'>;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'ToFulfill', label: 'Por surtir' },
  { value: 'Drafts', label: 'Borradores' },
  { value: 'All', label: 'Todos' },
];

/**
 * /ventas/pedidos (frontend §7.7): customer orders by tab (kept in `?tab=`), filters of customer, required date and
 * state, with the shipped progress.
 */
@Component({
  selector: 'app-customer-orders-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    ProgressMeter,
    CustomerPicker,
  ],
  template: `
    <app-page-header title="Pedidos de cliente">
      @if (canManage) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo pedido
        </a>
      }
    </app-page-header>

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Pedidos por estado">
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
        <mat-form-field>
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Todos</mat-option>
            @for (option of statusOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>

      <app-data-table
        label="Pedidos de cliente"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="orders.isLoading()"
        emptyMessage="No hay pedidos con estos filtros."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-order>
          <a class="row-link" [routerLink]="order.id">{{ order.folio }}</a>
        </ng-template>
        <ng-template appCell="customer" header="Cliente" [appCellOf]="rows()" let-order>
          <strong>{{ order.customerCode }}</strong> {{ order.customerName }}
          @if (order.deliveryPointName) {
            <span class="muted">· {{ order.deliveryPointName }}</span>
          }
        </ng-template>
        <ng-template
          appCell="requiredDate"
          header="Se necesita"
          sortable
          [appCellOf]="rows()"
          let-order
        >
          {{ order.requiredDate | date: 'dd/MM/yyyy' }}
        </ng-template>
        <ng-template appCell="reference" header="Referencia" [appCellOf]="rows()" let-order>
          {{ order.customerReference ?? '—' }}
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-order>
          <app-status-tag [value]="order.status" kind="CustomerOrderStatus" />
        </ng-template>
        <ng-template appCell="progress" header="Remisionado" [appCellOf]="rows()" let-order>
          <app-progress-meter
            compact
            [done]="order.shippedPct"
            [total]="100"
            [label]="'Remisionado de ' + order.folio"
          />
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
export class CustomerOrdersListPage {
  /** `?tab=`; by default the ones to fulfill. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(CustomerOrdersApi);
  protected readonly canManage = inject(AuthService).can('sales.orders.manage');
  protected readonly tabs = TABS;
  protected readonly statusOptions = Object.entries(ENUM_LABELS.CustomerOrderStatus).map(
    ([value, label]) => ({ value: value as Status, label }),
  );
  protected readonly current = computed<Tab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'ToFulfill',
  );
  protected readonly filters = new FormGroup({
    customer: new FormControl<CustomerOption | string | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    status: new FormControl<Status | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = linkedSignal<Tab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'requiredDate' }),
  });

  protected readonly orders = rxResource({
    params: () => ({ query: this.query(), tab: this.current(), filters: this.applied() }),
    stream: ({ params }) => {
      const f = params.filters;
      const customer = f.customer && typeof f.customer === 'object' ? f.customer.id : null;
      return this.api.list(params.query, {
        tab: params.tab,
        customerId: customer,
        from: toIsoDate(f.from),
        to: toIsoDate(f.to),
        status: f.status,
      });
    },
  });
  protected readonly rows = computed(() =>
    this.orders.hasValue() ? this.orders.value().items : [],
  );
  protected readonly total = computed(() =>
    this.orders.hasValue() ? this.orders.value().total : 0,
  );

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((x) => ({ ...x, page: 1 }));
    });
  }
}
