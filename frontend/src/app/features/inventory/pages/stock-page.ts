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
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  RowDetailDef,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { CategoriesApi } from '../../catalog/data-access/categories.api';
import { StockApi, StockFilters, StockLevel } from '../data-access/stock.api';
import { LotList } from '../ui/lot-list';

export function minMaxText(level: StockLevel): string {
  return level.minQty === null || level.maxQty === null
    ? '—'
    : `${level.minQty} / ${level.maxQty} ${level.baseUomCode}`;
}

/**
 * Existencias de la ubicación activa (spec frontend §7.3). Desde el tablero: `?bajoMinimo=1` activa el
 * filtro y `?porCaducar=1` muestra los lotes por caducar.
 */
@Component({
  selector: 'app-stock-page',
  imports: [
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    RowDetailDef,
    StatusTag,
    QtyPipe,
    MxnPipe,
    LotList,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stock-page.html',
  styles: `
    .filters {
      flex-wrap: wrap;
      margin-bottom: var(--sgo-space-4);
    }
    .expiring {
      margin-bottom: var(--sgo-space-4);
    }
    .expiring h2 {
      margin: 0 0 var(--sgo-space-2);
      font: var(--mat-sys-title-medium);
    }
    .expiring ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .expiring li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sgo-space-3);
      padding: var(--sgo-space-2) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .info {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .meta {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .meta.out {
      color: var(--sgo-status-red-fg);
    }
    .qty {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .filters mat-form-field {
      width: 220px;
    }
    .summary {
      margin: 0 0 var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StockPage {
  private readonly api = inject(StockApi);
  private readonly categoriesApi = inject(CategoriesApi);
  protected readonly location = inject(LocationContextService).activeLocation;

  /** `1` = solo bajo mínimo (desde la URL). */
  readonly bajoMinimo = input<string>();
  /** `1` = muestra los lotes por caducar (desde la URL). */
  readonly porCaducar = input<string>();
  protected readonly showExpiring = signal(false);

  protected readonly columns: TableColumn<StockLevel>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'itemName', header: 'Artículo', sortable: true },
    { key: 'onHand', header: 'Existencia', sortable: true, align: 'end' },
    { key: 'averageCost', header: 'Costo promedio', align: 'end' },
    { key: 'stockValue', header: 'Valor', align: 'end' },
    { key: 'minMax', header: 'Mín / Máx', value: minMaxText },
    { key: 'status', header: 'Estado' },
    { key: 'actions', header: '' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('sku:asc'));
  protected readonly filters = signal<StockFilters>({});

  protected readonly stock = rxResource({
    params: () => {
      const locationId = this.location()?.id;
      return locationId
        ? { query: this.query(), filters: { ...this.filters(), locationId } }
        : undefined;
    },
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  /** Lotes por caducar según los días de alerta configurados (RN-07). */
  private readonly alerts = rxResource({
    params: () => this.location()?.id,
    stream: ({ params }) => this.api.alerts(params),
  });
  protected readonly expiringLotIds = computed(
    () => new Set((this.alerts.value()?.expiringLots ?? []).map((lot) => lot.lotId)),
  );
  protected readonly alertDays = computed(() => this.alerts.value()?.expirationAlertDays ?? null);
  protected readonly expiringLots = computed(() => this.alerts.value()?.expiringLots ?? []);

  constructor() {
    effect(() => {
      const belowMin = this.bajoMinimo() === '1';
      const expiring = this.porCaducar() === '1';
      untracked(() => {
        if (belowMin) {
          this.setFilter('belowMin', true);
        }
        this.showExpiring.set(expiring);
      });
    });
  }

  protected readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });

  protected setFilter<K extends keyof StockFilters>(key: K, value: StockFilters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  /** Existencia por (ubicación, artículo): el id de artículo identifica la fila en una ubicación. */
  protected readonly trackItem = (row: StockLevel) => `${row.locationId}|${row.itemId}`;
}
