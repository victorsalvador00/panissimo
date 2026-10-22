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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { COUNT_QUERY, tabCounts } from '../../../shared/data-access/tab-counts';
import { MxnPipe } from '../../../shared/pipes/pipes';
import { PurchaseOrdersApi } from '../data-access/purchasing-api';

type Tab = NonNullable<ApiEnum<'PurchaseOrderTab'>>;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'All', label: 'Todas' },
  { value: 'ToApprove', label: 'Por aprobar' },
  { value: 'ToReceive', label: 'Por recibir' },
];

/**
 * /compras/ordenes (frontend §7.6): purchase orders by tab (kept in `?tab=`) and search by folio or supplier; those to
 * receive bring **Recibir**.
 */
@Component({
  selector: 'app-purchase-orders-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    MxnPipe,
  ],
  template: `
    <app-page-header title="Órdenes de compra">
      @if (canManage) {
        <a matButton="filled" routerLink="nueva">
          <mat-icon>add</mat-icon>
          Nueva orden de compra
        </a>
      }
    </app-page-header>

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Órdenes de compra por estado">
      @for (option of tabs; track option.value) {
        <a
          mat-tab-link
          routerLink="."
          [queryParams]="{ tab: option.value }"
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
      <div class="filters">
        <mat-form-field class="search">
          <mat-label>Buscar por folio o proveedor</mat-label>
          <input matInput type="search" [formControl]="search" />
          <mat-icon matSuffix aria-hidden="true">search</mat-icon>
        </mat-form-field>
      </div>

      <app-data-table
        label="Órdenes de compra"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="orders.isLoading()"
        emptyMessage="No hay órdenes de compra en esta pestaña."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-order>
          <a class="row-link" [routerLink]="order.id">{{ order.folio }}</a>
        </ng-template>
        <ng-template appCell="supplier" header="Proveedor" [appCellOf]="rows()" let-order>
          {{ order.supplierName }}
        </ng-template>
        <ng-template
          appCell="expectedDate"
          header="Fecha esperada"
          sortable
          [appCellOf]="rows()"
          let-order
        >
          {{ order.expectedDate | date: 'dd/MM/yyyy' }}
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-order>
          <app-status-tag [value]="order.status" kind="PurchaseOrderStatus" />
        </ng-template>
        <ng-template appCell="lines" header="Líneas" end [appCellOf]="rows()" let-order>
          {{ order.lineCount }}
        </ng-template>
        <ng-template appCell="total" header="Total" end sortable [appCellOf]="rows()" let-order>
          {{ order.total | mxn }}
        </ng-template>
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-order>
          @if (
            canReceive && (order.status === 'Approved' || order.status === 'PartiallyReceived')
          ) {
            <a
              matButton="tonal"
              routerLink="/compras/recepciones/nueva"
              [queryParams]="{ oc: order.id }"
            >
              Recibir
            </a>
          }
        </ng-template>
      </app-data-table>
    </mat-tab-nav-panel>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
  styles: `
    .tabs {
      margin-bottom: 12px;
    }
  `,
})
export class PurchaseOrdersListPage {
  /** `?tab=`; by default all of them. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(PurchaseOrdersApi);
  private readonly auth = inject(AuthService);
  protected readonly canManage = this.auth.can('purchasing.po.manage');
  protected readonly canReceive = this.auth.can('purchasing.receive');
  protected readonly tabs = TABS;
  protected readonly current = computed<Tab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'All',
  );
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly q = signal<string | undefined>(undefined);
  protected readonly query = linkedSignal<Tab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'createdAt:desc' }),
  });

  protected readonly orders = rxResource({
    params: () => ({ query: this.query(), tab: this.current(), q: this.q() }),
    stream: ({ params }) => this.api.list({ ...params.query, q: params.q }, { tab: params.tab }),
  });
  protected readonly counts = tabCounts(
    ['ToApprove', 'ToReceive'] as const,
    () => ({ q: this.q() }),
    (tab, { q }) => this.api.list({ ...COUNT_QUERY, q }, { tab }),
  );
  protected readonly rows = computed(() =>
    this.orders.hasValue() ? this.orders.value().items : [],
  );
  protected readonly total = computed(() =>
    this.orders.hasValue() ? this.orders.value().total : 0,
  );

  constructor() {
    this.search.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((q) => {
      this.q.set(q.trim() || undefined);
      this.query.update((x) => ({ ...x, page: 1 }));
    });
  }
}
