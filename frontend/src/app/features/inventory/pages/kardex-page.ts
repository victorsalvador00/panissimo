import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { documentLink } from '../../../shared/data-access/document-links';
import { ItemLookupApi } from '../../../shared/data-access/item-lookup';
import { ListQuery } from '../../../shared/data-access/list-query';
import { endOfDayIso, startOfDayIso } from '../../../shared/forms/dates';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { MovementsApi, StockApi } from '../data-access/inventory-api';

type MovementType = ApiEnum<'MovementType'>;

/**
 * /inventario/kardex (frontend §7.3): movements by location, item, type and dates, newest first; with a location and
 * an item, the running balance. The folio links to its document. `?locationId=&itemId=` come from Existencias.
 */
@Component({
  selector: 'app-kardex-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    ItemPicker,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  templateUrl: './kardex-page.html',
  styleUrl: './inventory.scss',
})
export class KardexPage {
  /** Query params from Existencias. */
  readonly locationId = input<string>();
  readonly itemId = input<string>();

  private readonly api = inject(MovementsApi);
  private readonly stockApi = inject(StockApi);
  private readonly itemLookup = inject(ItemLookupApi);
  private readonly context = inject(LocationContextService);

  protected readonly typeOptions = Object.entries(ENUM_LABELS.MovementType).map(
    ([value, label]) => ({
      value: value as MovementType,
      label,
    }),
  );
  protected readonly filters = new FormGroup({
    locationId: new FormControl<string | null>(null),
    item: new FormControl<ItemOption | null>(null),
    type: new FormControl<MovementType | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 50 });

  /** The user's plants and branches plus the sub-warehouses of the active one. */
  private readonly warehouses = rxResource({
    params: () => this.context.active()?.id,
    stream: ({ params }) => this.stockApi.warehouses(params),
    defaultValue: [],
  });
  protected readonly locationOptions = computed(() => [
    ...this.context.locations().map((l) => ({ id: l.id, label: l.name })),
    ...this.warehouses.value().map((w) => ({ id: w.id, label: `${w.name} (subalmacén)` })),
  ]);

  protected readonly movements = rxResource({
    params: () => ({ query: this.query(), filters: this.applied() }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        locationId: params.filters.locationId,
        itemId: params.filters.item?.id,
        type: params.filters.type,
        from: startOfDayIso(params.filters.from),
        to: endOfDayIso(params.filters.to),
      }),
  });
  protected readonly rows = computed(() =>
    this.movements.hasValue() ? this.movements.value().items : [],
  );
  protected readonly total = computed(() =>
    this.movements.hasValue() ? this.movements.value().total : 0,
  );
  /** The running balance only exists with a location and an item. */
  protected readonly withBalance = computed(
    () => !!this.applied().locationId && !!this.applied().item,
  );

  protected readonly link = documentLink;

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe(() => {
      if (this.filters.invalid) return;
      this.applied.set(this.filters.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
    // Location: the one in the link, or the active one.
    effect(() => {
      const locationId = this.locationId() ?? this.context.active()?.id ?? null;
      if (locationId && !this.filters.controls.locationId.value)
        this.filters.controls.locationId.setValue(locationId);
    });
    // Item from the link: the picker needs the whole option.
    effect(() => {
      const itemId = this.itemId();
      if (!itemId) return;
      this.itemLookup.byId(itemId).subscribe((item) => this.filters.controls.item.setValue(item));
    });
  }

  protected clear(): void {
    this.filters.reset({ locationId: this.context.active()?.id ?? null });
  }
}
