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
import { TransferListItem, TransferTab, TransfersApi } from '../data-access/logistics-api';

const TABS: readonly { value: TransferTab; label: string }[] = [
  { value: 'ToDispatch', label: 'Por despachar' },
  { value: 'InTransit', label: 'En tránsito' },
  { value: 'Received', label: 'Recibidos' },
  { value: 'All', label: 'Todos' },
];

/**
 * /logistica/traspasos (frontend §7.5): transfers that leave or reach the active location, by tab (kept in `?tab=`).
 * The ones in transit to the active location bring their **Recibir** button.
 */
@Component({
  selector: 'app-transfers-list-page',
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
    <app-page-header title="Traspasos">
      @if (canDispatch()) {
        <a matButton="filled" routerLink="nuevo">
          <mat-icon>add</mat-icon>
          Nuevo traspaso
        </a>
      }
    </app-page-header>

    <nav mat-tab-nav-bar class="tabs" [tabPanel]="panel" aria-label="Estado de los traspasos">
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
      <app-data-table
        label="Traspasos"
        [rows]="rows()"
        [total]="total()"
        [query]="query()"
        [loading]="transfers.isLoading()"
        emptyMessage="No hay traspasos en esta pestaña."
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-transfer>
          <a class="row-link" [routerLink]="transfer.id">{{ transfer.folio }}</a>
        </ng-template>
        <ng-template appCell="route" header="Origen → destino" [appCellOf]="rows()" let-transfer>
          {{ transfer.from.code }} → {{ transfer.to.code }}
        </ng-template>
        <ng-template appCell="status" header="Estado" sortable [appCellOf]="rows()" let-transfer>
          <app-status-tag [value]="transfer.status" kind="TransferStatus" />
        </ng-template>
        <ng-template appCell="lines" header="Artículos" end [appCellOf]="rows()" let-transfer>
          {{ transfer.lineCount }}
        </ng-template>
        <ng-template appCell="createdAt" header="Creado" sortable [appCellOf]="rows()" let-transfer>
          {{ transfer.createdAt | date: 'dd/MM/yyyy HH:mm' }}
        </ng-template>
        <ng-template
          appCell="dispatchedAt"
          header="Despachado"
          sortable
          [appCellOf]="rows()"
          let-transfer
        >
          {{ transfer.dispatchedAt ? (transfer.dispatchedAt | date: 'dd/MM/yyyy HH:mm') : '—' }}
        </ng-template>
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-transfer>
          @if (canReceive(transfer)) {
            <a matButton="tonal" [routerLink]="[transfer.id, 'recibir']">Recibir</a>
          }
        </ng-template>
      </app-data-table>
    </mat-tab-nav-panel>
  `,
  styles: `
    .tabs {
      margin-bottom: 12px;
    }
  `,
})
export class TransfersListPage {
  /** `?tab=` of the URL; by default the ones to dispatch. */
  readonly tab = input<string | undefined>();

  private readonly api = inject(TransfersApi);
  private readonly auth = inject(AuthService);
  private readonly location = inject(LocationContextService).active;

  protected readonly tabs = TABS;
  protected readonly current = computed<TransferTab>(
    () => TABS.find((t) => t.value === this.tab())?.value ?? 'ToDispatch',
  );
  protected readonly canDispatch = computed(() => this.auth.can('logistics.transfers.dispatch'));
  /** Back to the first page when the tab changes. */
  protected readonly query = linkedSignal<TransferTab, ListQuery>({
    source: this.current,
    computation: () => ({ page: 1, pageSize: 25, sort: 'createdAt:desc' }),
  });

  protected readonly transfers = rxResource({
    params: () => ({ query: this.query(), tab: this.current(), locationId: this.location()?.id }),
    stream: ({ params }) =>
      this.api.list(params.query, { tab: params.tab, locationId: params.locationId }),
  });
  protected readonly rows = computed(() =>
    this.transfers.hasValue() ? this.transfers.value().items : [],
  );
  protected readonly total = computed(() =>
    this.transfers.hasValue() ? this.transfers.value().total : 0,
  );

  /** In transit to the active location, for whoever may receive. */
  protected canReceive(transfer: TransferListItem): boolean {
    return (
      transfer.status === 'Dispatched' &&
      transfer.to.id === this.location()?.id &&
      this.auth.can('logistics.transfers.receive')
    );
  }
}
