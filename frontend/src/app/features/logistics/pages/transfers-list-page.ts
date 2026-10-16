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
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
import { TransferListItem, TransfersApi } from '../data-access/transfers.api';
import { TRANSFER_TABS, tabFilters, TransferTab } from '../ui/transfer-lines';

/** Traspasos de la ubicación activa por pestaña (spec frontend §7.4). `?pestana=en-transito` abre esa pestaña. */
@Component({
  selector: 'app-transfers-list-page',
  imports: [
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatIconModule,
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
      <app-page-header
        title="Traspasos"
        [subtitle]="'Envíos desde y hacia ' + (location()?.code ?? 'tu ubicación') + '.'"
      >
        @if (canDispatch) {
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Nuevo traspaso
          </a>
        }
      </app-page-header>

      <nav mat-tab-nav-bar [tabPanel]="panel" mat-stretch-tabs="false" aria-label="Traspasos">
        @for (item of tabs; track item.id) {
          <a mat-tab-link [active]="tab() === item.id" (click)="selectTab(item.id)" href="#">
            {{ item.label }}
          </a>
        }
      </nav>
      <mat-tab-nav-panel #panel>
        <app-data-table
          [columns]="columns"
          [rows]="transfers.value()?.items ?? []"
          [total]="transfers.value()?.total ?? 0"
          [loading]="transfers.isLoading()"
          [query]="query()"
          [searchable]="true"
          searchPlaceholder="Buscar por folio"
          [emptyMessage]="emptyMessage()"
          [emptyActionLabel]="
            canDispatch && (tab() === 'toDispatch' || tab() === 'all')
              ? 'Nuevo traspaso'
              : undefined
          "
          (emptyAction)="goToNew()"
          [rowClickable]="true"
          (rowClick)="open($event)"
          (queryChange)="query.set($event)"
        >
          <ng-template appCell="createdAt" let-row>{{
            row.createdAt | date: 'dd/MM/yyyy HH:mm'
          }}</ng-template>
          <ng-template appCell="status" let-row>
            <app-status-tag [status]="row.status" kind="TransferStatus" />
          </ng-template>
          <ng-template appCell="actions" let-row>
            @if (canReceiveRow(row)) {
              <a
                mat-flat-button
                [routerLink]="[row.id, 'recibir']"
                (click)="$event.stopPropagation()"
              >
                Recibir
              </a>
            }
          </ng-template>
          <ng-template appCardDef let-row>
            <div class="card-row">
              <strong>{{ row.folio }}</strong>
              <app-status-tag [status]="row.status" kind="TransferStatus" />
            </div>
            <div class="muted">
              {{ row.from.code }} → {{ row.to.code }} · {{ row.lineCount }} líneas
            </div>
            <div class="muted">{{ row.createdAt | date: 'dd/MM/yyyy HH:mm' }}</div>
            @if (canReceiveRow(row)) {
              <a
                mat-flat-button
                class="receive"
                [routerLink]="[row.id, 'recibir']"
                (click)="$event.stopPropagation()"
              >
                Recibir
              </a>
            }
          </ng-template>
        </app-data-table>
      </mat-tab-nav-panel>
    </section>
  `,
  styles: `
    nav {
      margin-bottom: var(--sgo-space-4);
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
    .receive {
      margin-top: var(--sgo-space-2);
      width: 100%;
    }
  `,
})
export class TransfersListPage {
  private readonly api = inject(TransfersApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Pestaña inicial desde la URL (ej. el tablero): `por-despachar`, `en-transito`, `recibidos`, `todos`. */
  readonly pestana = input<string>();

  protected readonly location = inject(LocationContextService).activeLocation;
  protected readonly canDispatch = this.auth.can('logistics.transfers.dispatch');
  private readonly canReceive = this.auth.can('logistics.transfers.receive');

  protected goToNew(): void {
    void this.router.navigateByUrl('/logistica/traspasos/nuevo');
  }
  /** Quien no despacha (sucursal) no tiene nada "por despachar". */
  protected readonly tabs = this.canDispatch
    ? TRANSFER_TABS
    : TRANSFER_TABS.filter((tab) => tab.id !== 'toDispatch');
  /** Quien solo recibe (sucursal) empieza en "En tránsito". */
  protected readonly tab = signal<TransferTab>(this.canDispatch ? 'toDispatch' : 'inTransit');

  protected readonly columns: TableColumn<TransferListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'createdAt', header: 'Creado', sortable: true },
    { key: 'from', header: 'Origen', value: (row) => row.from.code },
    { key: 'to', header: 'Destino', value: (row) => row.to.code },
    { key: 'lineCount', header: 'Líneas', align: 'end' },
    { key: 'status', header: 'Estado' },
    { key: 'actions', header: '' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));

  protected readonly transfers = rxResource({
    params: () => ({
      query: this.query(),
      filters: tabFilters(this.tab(), this.location()?.id ?? null),
    }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly emptyMessage = computed(() => {
    switch (this.tab()) {
      case 'toDispatch':
        return 'No hay traspasos por despachar.';
      case 'inTransit':
        return 'No hay traspasos en tránsito.';
      case 'received':
        return 'No hay traspasos recibidos.';
      default:
        return 'No hay traspasos.';
    }
  });

  constructor() {
    effect(() => {
      const tab = this.tabs.find((t) => t.slug === this.pestana());
      untracked(() => tab && this.selectTab(tab.id));
    });
  }

  protected selectTab(tab: TransferTab): false {
    this.tab.set(tab);
    this.query.update((query) => ({ ...query, page: 1 }));
    return false;
  }

  protected canReceiveRow(row: TransferListItem): boolean {
    return this.canReceive && row.status === 'Dispatched' && row.to.id === this.location()?.id;
  }

  protected open(transfer: TransferListItem): void {
    void this.router.navigate(['/logistica/traspasos', transfer.id]);
  }
}
