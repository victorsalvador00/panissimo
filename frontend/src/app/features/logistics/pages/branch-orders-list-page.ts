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
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import {
  BranchOrderFilters,
  BranchOrderListItem,
  BranchOrdersApi,
  BranchOrderStatus,
} from '../data-access/branch-orders.api';
import { BRANCH_ORDER_STATUSES } from '../ui/branch-order-lines';

type OrderTab = 'all' | 'toApprove';

/**
 * Pedidos de sucursal (`/logistica/pedidos`, `logistics.view`). Sin permiso de aprobar se ven los de
 * la ubicación activa; con él, todos los que están a tu alcance y la pestaña Por aprobar
 * (`?pestana=por-aprobar`).
 */
@Component({
  selector: 'app-branch-orders-list-page',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Pedidos" [subtitle]="subtitle()">
        @if (canCreate) {
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Nuevo pedido
          </a>
        }
      </app-page-header>

      @if (canApprove) {
        <nav mat-tab-nav-bar [tabPanel]="panel" mat-stretch-tabs="false" aria-label="Pedidos">
          @for (item of tabs; track item.id) {
            <a mat-tab-link [active]="tab() === item.id" (click)="selectTab(item.id)" href="#">
              {{ item.label }}
            </a>
          }
        </nav>
      }
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
          @if (canApprove && locations().length > 1) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Ubicación</mat-label>
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
          searchPlaceholder="Buscar por folio"
          [emptyMessage]="emptyMessage()"
          [emptyActionLabel]="canCreate && tab() !== 'toApprove' ? 'Nuevo pedido' : undefined"
          (emptyAction)="goToNew()"
          [rowClickable]="true"
          (rowClick)="open($event)"
          (queryChange)="query.set($event)"
        >
          <ng-template appCell="requiredDate" let-row>{{
            row.requiredDate | date: 'dd/MM/yyyy'
          }}</ng-template>
          <ng-template appCell="status" let-row>
            <app-status-tag [status]="row.status" kind="BranchOrderStatus" />
          </ng-template>
          <ng-template appCardDef let-row>
            <div class="card-row">
              <strong>{{ row.folio }}</strong>
              <app-status-tag [status]="row.status" kind="BranchOrderStatus" />
            </div>
            <div class="muted">
              {{ row.requestingLocation.code }} ← {{ row.supplyingLocation.code }} ·
              {{ row.lineCount }} {{ row.lineCount === 1 ? 'artículo' : 'artículos' }}
            </div>
            <div class="muted">Para el {{ row.requiredDate | date: 'dd/MM/yyyy' }}</div>
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
export class BranchOrdersListPage {
  private readonly api = inject(BranchOrdersApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);

  /** Pestaña inicial desde la URL (ej. el tablero). */
  readonly pestana = input<string>();

  protected readonly canCreate = this.auth.can('logistics.orders.create');

  protected goToNew(): void {
    void this.router.navigateByUrl('/logistica/pedidos/nuevo');
  }
  protected readonly canApprove = this.auth.can('logistics.orders.approve');
  protected readonly statuses = BRANCH_ORDER_STATUSES;
  protected readonly tabs: { id: OrderTab; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'toApprove', label: 'Por aprobar' },
  ];
  protected readonly tab = signal<OrderTab>('all');
  protected readonly locations = this.locationContext.locations;

  protected readonly subtitle = computed(() =>
    this.canApprove
      ? 'Pedidos de las sucursales a la fábrica y al comisariato.'
      : `Pedidos de ${this.locationContext.activeLocation()?.code ?? 'tu sucursal'}.`,
  );

  protected readonly columns: TableColumn<BranchOrderListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'requesting', header: 'Sucursal', value: (row) => row.requestingLocation.code },
    { key: 'supplying', header: 'Origen', value: (row) => row.supplyingLocation.code },
    { key: 'requiredDate', header: 'Se requiere', sortable: true },
    { key: 'lineCount', header: 'Artículos', align: 'end' },
    { key: 'status', header: 'Estado', sortable: true },
  ];

  protected readonly form = new FormGroup({
    status: new FormControl<BranchOrderStatus | null>(null),
    locationId: new FormControl<string | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<{
    status: BranchOrderStatus | null;
    locationId: string | null;
  }>({ status: null, locationId: null });

  protected readonly orders = rxResource({
    params: () => ({ query: this.query(), filters: this.tabFilters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly emptyMessage = computed(() =>
    this.tab() === 'toApprove' ? 'No hay pedidos por aprobar.' : 'No hay pedidos con esos filtros.',
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.form.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
    effect(() => {
      const toApprove = this.pestana() === 'por-aprobar' && this.canApprove;
      untracked(() => toApprove && this.selectTab('toApprove'));
    });
  }

  private tabFilters(): BranchOrderFilters {
    const { status } = this.filters();
    // Sin aprobación: solo la ubicación activa.
    const locationId = this.canApprove
      ? this.filters().locationId
      : this.locationContext.activeLocationId();
    return this.tab() === 'toApprove'
      ? { status: 'Submitted', supplyingLocationId: locationId }
      : { status, locationId };
  }

  protected selectTab(tab: OrderTab): false {
    this.tab.set(tab);
    this.query.update((query) => ({ ...query, page: 1 }));
    return false;
  }

  protected statusLabel(status: BranchOrderStatus): string {
    return enumLabel('BranchOrderStatus', status);
  }

  protected open(order: BranchOrderListItem): void {
    void this.router.navigate(['/logistica/pedidos', order.id]);
  }
}
