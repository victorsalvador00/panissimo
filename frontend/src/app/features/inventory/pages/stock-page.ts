import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime, map } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable, RowDetail } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { StockLevel } from '../../../shared/components/stock-level/stock-level';
import { ListQuery, ParamValues } from '../../../shared/data-access/list-query';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { CategoriesApi } from '../../catalog/data-access/catalog-api';
import { ITEM_TYPE_OPTIONS } from '../../catalog/ui/item-options';
import { StockApi, StockLevelRow } from '../data-access/inventory-api';
import { daysToExpireText } from '../ui/expiry';
import { StockLots } from '../ui/stock-lots';

/**
 * /inventario/existencias (frontend §7.3): stock of the active location (and its sub-warehouses, RN-46) with average
 * cost, value and level against min/max; lots on expand; "Solo bajo mínimo"; lots about to expire; link to the kardex.
 */
@Component({
  selector: 'app-stock-page',
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
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    RowDetail,
    StatusTag,
    StockLevel,
    StockLots,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './stock-page.html',
  styleUrl: './inventory.scss',
})
export class StockPage {
  /** `?bajoMinimo=1` (dashboard card): starts with "Solo bajo mínimo" on. */
  readonly bajoMinimo = input<string>();
  /** `?porCaducar=1` (dashboard card): scrolls to the lots about to expire. */
  readonly porCaducar = input<string>();
  private readonly expiringSection = viewChild<ElementRef<HTMLElement>>('expiringSection');
  private scrolled = false;

  private readonly api = inject(StockApi);
  private readonly categoriesApi = inject(CategoriesApi);
  protected readonly location = inject(LocationContextService).active;

  protected readonly typeOptions = ITEM_TYPE_OPTIONS;
  protected readonly expiry = daysToExpireText;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly filters = signal<ParamValues>({});
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'sku' });
  protected readonly rowKey = (row: StockLevelRow) => `${row.locationId}|${row.itemId}`;

  protected readonly stock = rxResource({
    params: () => {
      const location = this.location();
      return location
        ? { query: this.query(), filters: { ...this.filters(), locationId: location.id } }
        : undefined;
    },
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });
  protected readonly rows = computed(() => (this.stock.hasValue() ? this.stock.value().items : []));
  protected readonly total = computed(() => (this.stock.hasValue() ? this.stock.value().total : 0));

  protected readonly alerts = rxResource({
    params: () => this.location()?.id,
    stream: ({ params }) => this.api.alerts(params),
  });
  protected readonly expiring = computed(() =>
    this.alerts.hasValue() ? this.alerts.value().expiringLots : [],
  );

  protected readonly categories = rxResource({
    stream: () => this.categoriesApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });

  constructor() {
    effect(() => {
      if (this.bajoMinimo() === '1') untracked(() => this.setFilter('belowMin', true));
    });
    afterRenderEffect(() => {
      const section = this.expiringSection();
      if (this.porCaducar() === '1' && section && !this.scrolled) {
        this.scrolled = true;
        section.nativeElement.scrollIntoView({ block: 'start' });
        section.nativeElement.focus({ preventScroll: true });
      }
    });
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }

  protected setFilter(key: string, value: string | boolean | null): void {
    this.filters.update((filters) => ({ ...filters, [key]: value || null }));
    this.query.update((x) => ({ ...x, page: 1 }));
  }
}
