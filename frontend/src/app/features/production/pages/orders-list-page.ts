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
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ProgressMeter } from '../../../shared/components/progress-meter/progress-meter';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { COUNT_QUERY, tabCounts } from '../../../shared/data-access/tab-counts';
import { toIsoDate } from '../../../shared/forms/dates';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { plantFactories } from '../data-access/plant-factories';
import { ProductionOrderTab, ProductionOrdersApi } from '../data-access/production-api';

type Tab = NonNullable<ProductionOrderTab>;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'ToProduce', label: 'Por producir' },
  { value: 'InProgress', label: 'En proceso' },
  { value: 'Drafts', label: 'Borradores' },
  { value: 'All', label: 'Todas' },
];

function options<K extends 'Shift' | 'ProductionOrderSource'>(kind: K) {
  return Object.entries(ENUM_LABELS[kind]).map(([value, label]) => ({
    value: value as ApiEnum<K>,
    label: label as string,
  }));
}

/**
 * /produccion/ordenes (frontend §7.4): orders by tab (kept in `?tab=`), filters of scheduled date, factory (RN-49), shift, source
 * and import (`?importId=` arrives from the import history), with progress and number of closes.
 */
@Component({
  selector: 'app-orders-list-page',
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
    QtyPipe,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Órdenes de producción">
      @if (canManage) {
        <a matButton="filled" routerLink="nueva">
          <mat-icon>add</mat-icon>
          Nueva orden
        </a>
      }
    </app-page-header>

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Estado de las órdenes">
      @for (option of tabs; track option.value) {
        <a
          mat-tab-link
          routerLink="."
          [queryParams]="{ tab: option.value }"
          queryParamsHandling="merge"
          [active]="current() === option.value"
        >
          {{ option.label }}
          @let count = counts.value()[option.value];
          @if (count !== undefined) {
            <span class="tab-count">{{ count }}</span>
          }
        </a>
      }
    </nav>

    <mat-tab-nav-panel #panel>
      <form class="filters" [formGroup]="filters" novalidate>
        <mat-form-field class="search">
          <mat-label>Buscar por folio, SKU o producto</mat-label>
          <input matInput type="search" formControlName="q" />
          <mat-icon matSuffix aria-hidden="true">search</mat-icon>
        </mat-form-field>
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
        @if (factories().length > 0) {
          <mat-form-field>
            <mat-label>Fábrica</mat-label>
            <mat-select formControlName="factoryId">
              <mat-option [value]="null">Todas</mat-option>
              @for (factory of factories(); track factory.id) {
                <mat-option [value]="factory.id">{{ factory.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Turno</mat-label>
          <mat-select formControlName="shift">
            <mat-option [value]="null">Todos</mat-option>
            @for (option of shifts; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Origen</mat-label>
          <mat-select formControlName="source">
            <mat-option [value]="null">Todos</mat-option>
            @for (option of sources; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (importId()) {
          <button matButton="tonal" type="button" (click)="clearImport()">
            <mat-icon>close</mat-icon>
            Solo de una importación
          </button>
        }
      </form>

      <app-data-table
        label="Órdenes de producción"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="orders.isLoading()"
        emptyMessage="No hay órdenes con estos filtros."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-order>
          <a class="row-link" [routerLink]="order.id">{{ order.folio }}</a>
        </ng-template>
        <ng-template appCell="product" header="Producto" [appCellOf]="rows()" let-order>
          <strong>{{ order.sku }}</strong> {{ order.itemName }}
        </ng-template>
        <ng-template appCell="scheduledDate" header="Fecha" sortable [appCellOf]="rows()" let-order>
          {{ order.scheduledDate | date: 'dd/MM/yyyy' }}
        </ng-template>
        <ng-template appCell="factory" header="Fábrica y turno" [appCellOf]="rows()" let-order>
          {{ order.factoryName ?? '—' }}
          @if (order.shift) {
            · {{ order.shift | statusLabel: 'Shift' }}
          }
        </ng-template>
        <ng-template appCell="planned" header="Planeado" end [appCellOf]="rows()" let-order>
          {{ order.plannedQty | qty: order.baseUomCode }}
        </ng-template>
        <ng-template appCell="progress" header="Avance" [appCellOf]="rows()" let-order>
          <app-progress-meter
            compact
            [done]="order.producedQty"
            [total]="order.plannedQty"
            [unit]="order.baseUomCode"
            [label]="'Avance de ' + order.folio"
          />
        </ng-template>
        <ng-template appCell="closes" header="Cierres" end [appCellOf]="rows()" let-order>
          {{ order.closeCount }}
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-order>
          <app-status-tag [value]="order.status" kind="ProductionOrderStatus" />
        </ng-template>
        <ng-template appCell="source" header="Origen" [appCellOf]="rows()" let-order>
          {{ order.source | statusLabel: 'ProductionOrderSource' }}
        </ng-template>
      </app-data-table>
    </mat-tab-nav-panel>
  `,
  styles: `
    :host {
      display: block;
    }

    .tabs {
      margin-bottom: 12px;
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-bottom: 8px;

      mat-form-field {
        flex: 1 1 160px;
      }

      .search {
        flex: 2 1 260px;
      }
    }
  `,
})
export class OrdersListPage {
  /** `?tab=`; by default the ones to produce. */
  readonly tab = input<string | undefined>();
  /** `?importId=`: only the orders of one import. */
  readonly importId = input<string | undefined>();

  private readonly api = inject(ProductionOrdersApi);
  private readonly router = inject(Router);
  protected readonly canManage = inject(AuthService).can('production.orders.manage');
  protected readonly tabs = TABS;
  protected readonly shifts = options('Shift');
  protected readonly sources = options('ProductionOrderSource');

  protected readonly current = computed<Tab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'ToProduce',
  );
  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    factoryId: new FormControl<string | null>(null),
    shift: new FormControl<ApiEnum<'Shift'> | null>(null),
    source: new FormControl<ApiEnum<'ProductionOrderSource'> | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  /** Back to the first page when the tab changes. */
  protected readonly query = linkedSignal<Tab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'scheduledDate:desc' }),
  });

  protected readonly orders = rxResource({
    params: () => ({
      query: this.query(),
      tab: this.current(),
      filters: this.applied(),
      importId: this.importId(),
    }),
    stream: ({ params }) =>
      this.api.list(
        { ...params.query, q: params.filters.q.trim() || undefined },
        this.filterParams(params.tab, params.filters, params.importId),
      ),
  });
  /** How many orders each tab holds with the same filters (only its `total`, one row per call). */
  protected readonly counts = tabCounts(
    ['ToProduce', 'InProgress', 'Drafts'] as const,
    () => ({ filters: this.applied(), importId: this.importId() }),
    (tab, { filters, importId }) =>
      this.api.list(
        { ...COUNT_QUERY, q: filters.q.trim() || undefined },
        this.filterParams(tab, filters, importId),
      ),
  );
  protected readonly rows = computed(() =>
    this.orders.hasValue() ? this.orders.value().items : [],
  );
  protected readonly total = computed(() =>
    this.orders.hasValue() ? this.orders.value().total : 0,
  );

  protected readonly factories = plantFactories();

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((x) => ({ ...x, page: 1 }));
    });
  }

  private filterParams(
    tab: Tab,
    f: ReturnType<typeof this.filters.getRawValue>,
    importId?: string,
  ) {
    return {
      tab,
      from: toIsoDate(f.from),
      to: toIsoDate(f.to),
      factoryId: f.factoryId,
      shift: f.shift,
      source: f.source,
      importId,
    };
  }

  protected clearImport(): void {
    void this.router.navigate([], {
      queryParams: { importId: null },
      queryParamsHandling: 'merge',
    });
  }
}
