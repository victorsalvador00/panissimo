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
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { map, of } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { COUNT_QUERY, tabCounts } from '../../../shared/data-access/tab-counts';
import { BranchOrdersApi, DestinationsApi } from '../data-access/logistics-api';

type Tab = NonNullable<ApiEnum<'BranchOrderTab'>>;

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'All', label: 'Todos' },
  { value: 'ToApprove', label: 'Por aprobar' },
];

/**
 * ★ /logistica/pedidos (frontend §7.5): the active branch's orders; whoever approves sees every order in scope, with
 * a branch filter and the **Por aprobar** tab (kept in `?tab=`).
 */
@Component({
  selector: 'app-branch-orders-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Pedidos de sucursal">
      @if (canCreate && activeBranch()) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo pedido
        </a>
      }
    </app-page-header>

    @if (canApprove) {
      <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Pedidos por estado">
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
      <div class="filters">
        <mat-form-field>
          <mat-label>Sucursal</mat-label>
          <mat-select [value]="branchFilter()" (valueChange)="setBranch($event)">
            <mat-option [value]="null">Todas</mat-option>
            @for (branch of branches.value(); track branch.id) {
              <mat-option [value]="branch.id">{{ branch.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    } @else if (!activeBranch()) {
      <p class="pan-card muted">Elige una sucursal como ubicación activa para ver sus pedidos.</p>
    }

    <mat-tab-nav-panel #panel>
      <app-data-table
        label="Pedidos de sucursal"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="orders.isLoading()"
        emptyMessage="No hay pedidos."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-order>
          <a class="row-link" [routerLink]="order.id">{{ order.folio }}</a>
        </ng-template>
        <ng-template appCell="branch" header="Sucursal" [appCellOf]="rows()" let-order>
          {{ order.requestingLocation.name }}
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
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-order>
          <app-status-tag [value]="order.status" kind="BranchOrderStatus" />
        </ng-template>
        <ng-template appCell="lines" header="Artículos" end [appCellOf]="rows()" let-order>
          {{ order.lineCount }}
        </ng-template>
        <ng-template appCell="user" header="Pidió" [appCellOf]="rows()" let-order>
          {{ order.createdByName ?? '—' }}
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
export class BranchOrdersListPage {
  /** `?tab=`; by default all of them. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(BranchOrdersApi);
  private readonly destinations = inject(DestinationsApi);
  private readonly auth = inject(AuthService);
  private readonly active = inject(LocationContextService).active;
  protected readonly canCreate = this.auth.can('logistics.orders.create');
  /** RN-20: the plant approves; it sees every order in its scope. */
  protected readonly canApprove = this.auth.can('logistics.orders.approve');
  protected readonly tabs = TABS;
  protected readonly current = computed<Tab>(() =>
    this.canApprove ? (TABS.find((t) => t.value === this.tab())?.value ?? 'All') : 'All',
  );
  protected readonly activeBranch = computed(() => {
    const active = this.active();
    return active?.type === 'Branch' ? active : null;
  });
  protected readonly branchFilter = signal<string | null>(null);
  protected readonly query = linkedSignal<Tab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'requiredDate:desc' }),
  });

  protected readonly branches = rxResource({
    stream: () =>
      this.canApprove
        ? this.destinations.list().pipe(map((all) => all.filter((l) => l.type === 'Branch')))
        : of([]),
    defaultValue: [],
  });
  protected readonly orders = rxResource({
    params: () => ({
      query: this.query(),
      tab: this.current(),
      // Without approval, only the active branch's orders.
      locationId: this.canApprove ? this.branchFilter() : (this.activeBranch()?.id ?? null),
    }),
    stream: ({ params }) =>
      !this.canApprove && !params.locationId
        ? of({ items: [], page: 1, pageSize: params.query.pageSize, total: 0 })
        : this.api.list(params.query, { tab: params.tab, locationId: params.locationId }),
  });
  /** Only whoever approves sees the tabs. */
  protected readonly counts = tabCounts(
    ['ToApprove'] as const,
    () => (this.canApprove ? { locationId: this.branchFilter() } : undefined),
    (tab, { locationId }) => this.api.list(COUNT_QUERY, { tab, locationId }),
  );
  protected readonly rows = computed(() =>
    this.orders.hasValue() ? this.orders.value().items : [],
  );
  protected readonly total = computed(() =>
    this.orders.hasValue() ? this.orders.value().total : 0,
  );

  protected setBranch(id: string | null): void {
    this.branchFilter.set(id);
    this.query.update((x) => ({ ...x, page: 1 }));
  }
}
