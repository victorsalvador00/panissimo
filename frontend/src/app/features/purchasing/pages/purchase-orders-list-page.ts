import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import {
  PurchaseOrderFilters,
  PurchaseOrderListItem,
  PurchaseOrdersApi,
  PurchaseOrderStatus,
} from '../data-access/purchase-orders.api';
import { PURCHASE_ORDER_STATUSES } from '../ui/purchase-order-lines';
import { isPurchaseLocation } from '../ui/requisition-lines';

type OrderTab = 'all' | 'toApprove' | 'toReceive';

/**
 * Órdenes de compra (`/compras/ordenes`, `purchasing.view`). Pestañas: Todas (con filtro de estado),
 * Por aprobar (con `purchasing.po.approve`) y Por recibir (aprobadas o parcialmente recibidas).
 * `?pestana=por-aprobar` o `por-recibir` abre esa pestaña.
 */
@Component({
  selector: 'app-purchase-orders-list-page',
  imports: [
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Órdenes de compra" subtitle="Compras a proveedores, con IVA.">
        @if (canManage) {
          <a mat-flat-button routerLink="nueva">
            <mat-icon>add</mat-icon>
            Nueva orden
          </a>
        }
      </app-page-header>

      <nav
        mat-tab-nav-bar
        [tabPanel]="panel"
        mat-stretch-tabs="false"
        aria-label="Órdenes de compra"
      >
        @for (item of tabs; track item.id) {
          <a mat-tab-link [active]="tab() === item.id" (click)="selectTab(item.id)" href="#">
            {{ item.label }}
          </a>
        }
      </nav>
      <mat-tab-nav-panel #panel>
        <form [formGroup]="form" class="filters" novalidate>
          @if (tab() === 'all') {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Estado</mat-label>
              <mat-select formControlName="status">
                <mat-option [value]="null">Todos</mat-option>
                @for (status of statuses; track status) {
                  <mat-option [value]="status">{{ statusLabel(status) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          @if (locations().length > 1) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Entrega en</mat-label>
              <mat-select formControlName="locationId">
                <mat-option [value]="null">Todas</mat-option>
                @for (location of locations(); track location.id) {
                  <mat-option [value]="location.id"
                    >{{ location.code }} · {{ location.name }}</mat-option
                  >
                }
              </mat-select>
            </mat-form-field>
          }
        </form>

        <app-data-table
          [columns]="columns"
          [rows]="orders.value()?.items ?? []"
          [total]="orders.value()?.total ?? 0"
          [loading]="orders.isLoading()"
          [query]="query()"
          [searchable]="true"
          searchPlaceholder="Buscar por folio o proveedor"
          [emptyMessage]="emptyMessage()"
          [emptyActionLabel]="canManage && tab() === 'all' ? 'Nueva orden de compra' : undefined"
          (emptyAction)="goToNew()"
          [rowClickable]="true"
          (rowClick)="open($event)"
          (queryChange)="query.set($event)"
        >
          <ng-template appCell="expectedDate" let-row>{{
            row.expectedDate ? (row.expectedDate | date: 'dd/MM/yyyy') : '—'
          }}</ng-template>
          <ng-template appCell="total" let-row>{{ row.total | mxn }}</ng-template>
          <ng-template appCell="status" let-row>
            <app-status-tag [status]="row.status" kind="PurchaseOrderStatus" />
          </ng-template>
          <ng-template appCardDef let-row>
            <div class="card-row">
              <strong>{{ row.folio }}</strong>
              <app-status-tag [status]="row.status" kind="PurchaseOrderStatus" />
            </div>
            <div>{{ row.supplier.name }}</div>
            <div class="muted">
              {{ row.deliveryLocation.code }} · {{ row.total | mxn }}
              @if (row.expectedDate) {
                · entrega {{ row.expectedDate | date: 'dd/MM/yyyy' }}
              }
            </div>
          </ng-template>
        </app-data-table>
      </mat-tab-nav-panel>
    </section>
  `,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-width: 600px;
      gap: var(--sgo-space-3);
      margin-block: var(--sgo-space-4);
    }
    .filters:empty {
      margin-block: var(--sgo-space-2);
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PurchaseOrdersListPage {
  private readonly api = inject(PurchaseOrdersApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);

  /** Pestaña inicial desde la URL (ej. el tablero). */
  readonly pestana = input<string>();

  protected readonly canManage = this.auth.can('purchasing.po.manage');

  protected goToNew(): void {
    void this.router.navigateByUrl('/compras/ordenes/nueva');
  }
  private readonly canApprove = this.auth.can('purchasing.po.approve');
  protected readonly statuses = PURCHASE_ORDER_STATUSES;
  protected readonly tabs: { id: OrderTab; label: string }[] = [
    { id: 'all', label: 'Todas' },
    ...(this.canApprove ? [{ id: 'toApprove' as const, label: 'Por aprobar' }] : []),
    { id: 'toReceive', label: 'Por recibir' },
  ];
  protected readonly tab = signal<OrderTab>('all');
  protected readonly locations = computed(() =>
    this.locationContext.locations().filter((location) => isPurchaseLocation(location.type)),
  );

  protected readonly columns: TableColumn<PurchaseOrderListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'supplier', header: 'Proveedor', value: (row) => row.supplier.name },
    { key: 'location', header: 'Entrega en', value: (row) => row.deliveryLocation.code },
    { key: 'expectedDate', header: 'Fecha esperada', sortable: true },
    { key: 'total', header: 'Total', sortable: true, align: 'end' },
    { key: 'status', header: 'Estado', sortable: true },
  ];

  protected readonly form = new FormGroup({
    status: new FormControl<PurchaseOrderStatus | null>(null),
    locationId: new FormControl<string | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<{
    status: PurchaseOrderStatus | null;
    locationId: string | null;
  }>({ status: null, locationId: null });

  protected readonly orders = rxResource({
    params: () => ({ query: this.query(), filters: this.tabFilters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly emptyMessage = computed(() => {
    switch (this.tab()) {
      case 'toApprove':
        return 'No hay órdenes de compra por aprobar.';
      case 'toReceive':
        return 'No hay órdenes de compra por recibir.';
      default:
        return 'No hay órdenes de compra con esos filtros.';
    }
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.form.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
    effect(() => {
      const slug = this.pestana();
      const tab =
        slug === 'por-aprobar' ? 'toApprove' : slug === 'por-recibir' ? 'toReceive' : null;
      untracked(() => {
        if (tab && this.tabs.some((t) => t.id === tab)) {
          this.selectTab(tab);
        }
      });
    });
  }

  private tabFilters(): PurchaseOrderFilters {
    const { status, locationId } = this.filters();
    switch (this.tab()) {
      case 'toApprove':
        return { status: 'PendingApproval', locationId };
      case 'toReceive':
        return { pendingReceipt: true, locationId };
      default:
        return { status, locationId };
    }
  }

  protected selectTab(tab: OrderTab): false {
    this.tab.set(tab);
    this.query.update((query) => ({ ...query, page: 1 }));
    return false;
  }

  protected statusLabel(status: PurchaseOrderStatus): string {
    return enumLabel('PurchaseOrderStatus', status);
  }

  protected open(order: PurchaseOrderListItem): void {
    void this.router.navigate(['/compras/ordenes', order.id]);
  }
}
