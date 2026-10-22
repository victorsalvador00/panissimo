import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { COUNT_QUERY, tabCounts } from '../../../shared/data-access/tab-counts';
import {
  InternalTransfersApi,
  TransferListItem,
  TransferTab,
} from '../../logistics/data-access/logistics-api';
import { stockWarehouses } from '../ui/stock-warehouses';

const TABS: readonly { value: TransferTab; label: string }[] = [
  { value: 'ToDispatch', label: 'Por enviar' },
  { value: 'InTransit', label: 'En tránsito' },
  { value: 'Received', label: 'Recibidos' },
  { value: 'All', label: 'Todos' },
];

/**
 * ★ /inventario/vales-internos (frontend §7.3, RN-47): vouchers between the sub-warehouses of the active location by
 * tab (kept in `?tab=`); those in transit to one of its sub-warehouses bring **Recibir**.
 */
@Component({
  selector: 'app-vouchers-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Vales internos">
      @if (canSend() && warehouses().length > 1) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo vale
        </a>
      }
    </app-page-header>

    @if (location() && warehouses().length < 2) {
      <p class="pan-card muted">
        {{ location()!.name }} no tiene dos subalmacenes donde puedas mover existencia: los vales
        internos van entre subalmacenes de la misma ubicación.
      </p>
    }

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Estado de los vales">
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
      <app-data-table
        label="Vales internos"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="vouchers.isLoading()"
        emptyMessage="No hay vales en esta pestaña."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-voucher>
          <a class="row-link" [routerLink]="voucher.id">{{ voucher.folio }}</a>
        </ng-template>
        <ng-template appCell="route" header="Origen → destino" [appCellOf]="rows()" let-voucher>
          {{ voucher.from.name }} → {{ voucher.to.name }}
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-voucher>
          <app-status-tag [value]="voucher.status" kind="TransferStatus" />
        </ng-template>
        <ng-template appCell="lines" header="Artículos" end [appCellOf]="rows()" let-voucher>
          {{ voucher.lineCount }}
        </ng-template>
        <ng-template appCell="createdAt" header="Creado" sortable [appCellOf]="rows()" let-voucher>
          {{ voucher.createdAt | date: 'dd/MM/yyyy HH:mm' }}
        </ng-template>
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-voucher>
          @if (canReceive(voucher)) {
            <a matButton="tonal" [routerLink]="[voucher.id, 'recibir']">Recibir</a>
          }
        </ng-template>
      </app-data-table>
    </mat-tab-nav-panel>
  `,
  styles: `
    .tabs {
      margin-bottom: 12px;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class VouchersListPage {
  /** `?tab=`; by default the ones to send. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(InternalTransfersApi);
  private readonly auth = inject(AuthService);
  protected readonly location = inject(LocationContextService).active;
  protected readonly warehouses = stockWarehouses(this.location);

  protected readonly tabs = TABS;
  protected readonly current = computed<TransferTab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'ToDispatch',
  );
  protected readonly canSend = computed(() => this.auth.can('inventory.internal_transfers'));
  protected readonly query = linkedSignal<TransferTab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'createdAt:desc' }),
  });

  protected readonly vouchers = rxResource({
    params: () => ({ query: this.query(), tab: this.current(), locationId: this.location()?.id }),
    stream: ({ params }) =>
      this.api.list(params.query, { tab: params.tab, locationId: params.locationId }),
  });
  protected readonly counts = tabCounts(
    ['ToDispatch', 'InTransit', 'Received'] as const,
    () => ({ locationId: this.location()?.id }),
    (tab, { locationId }) => this.api.list(COUNT_QUERY, { tab, locationId }),
  );
  protected readonly rows = computed(() =>
    this.vouchers.hasValue() ? this.vouchers.value().items : [],
  );
  protected readonly total = computed(() =>
    this.vouchers.hasValue() ? this.vouchers.value().total : 0,
  );

  /** In transit to a sub-warehouse of the active location where the user moves stock. */
  protected canReceive(voucher: TransferListItem): boolean {
    return (
      voucher.status === 'Dispatched' &&
      this.canSend() &&
      this.warehouses().some((w) => w.id === voucher.to.id)
    );
  }
}
