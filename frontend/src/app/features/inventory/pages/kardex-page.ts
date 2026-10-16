import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { documentLabel, documentRoute } from '../../../shared/data-access/document-links';
import { ItemLookupService, ItemOption } from '../../../shared/data-access/item-lookup.service';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { ENUM_LABELS, enumLabel } from '../../../shared/pipes/status-label.pipe';
import { dayRange } from '../../../shared/forms/date-range';
import {
  KardexEntry,
  KardexFilters,
  MovementsApi,
  MovementType,
} from '../data-access/movements.api';

/** Kardex (spec frontend §7.3): movimientos con filtros; el folio enlaza al documento origen. */
@Component({
  selector: 'app-kardex-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    ItemPicker,
    LocationPicker,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kardex-page.html',
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-3);
      margin-bottom: var(--sgo-space-2);
    }
    .hint {
      margin: 0 0 var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .in {
      color: var(--sgo-status-green-fg);
    }
    .out {
      color: var(--sgo-status-red-fg);
    }
    .nowrap {
      white-space: nowrap;
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
export class KardexPage {
  private readonly api = inject(MovementsApi);
  private readonly lookup = inject(ItemLookupService);
  private readonly activeLocationId = inject(LocationContextService).activeLocationId;

  /** Query params (enlace desde Existencias): `?itemId=&locationId=`. */
  readonly itemId = input<string>();
  readonly locationId = input<string>();

  protected readonly types = Object.keys(ENUM_LABELS.MovementType) as MovementType[];
  protected readonly typeLabels = ENUM_LABELS.MovementType;

  protected readonly columns: TableColumn<KardexEntry>[] = [
    { key: 'occurredAt', header: 'Fecha' },
    { key: 'type', header: 'Movimiento', value: (row) => enumLabel('MovementType', row.type) },
    { key: 'item', header: 'Artículo', value: (row) => `${row.sku} · ${row.itemName}` },
    { key: 'document', header: 'Documento' },
    { key: 'userName', header: 'Usuario', value: (row) => row.userName ?? '—' },
    { key: 'lotNumber', header: 'Lote', value: (row) => row.lotNumber ?? '—' },
    { key: 'quantity', header: 'Cantidad', align: 'end' },
    { key: 'unitCost', header: 'Costo unitario', align: 'end' },
    { key: 'totalCost', header: 'Costo total', align: 'end' },
    { key: 'balanceAfter', header: 'Saldo', align: 'end' },
  ];

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(null),
    item: new FormControl<ItemOption | null>(null),
    type: new FormControl<MovementType | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery());
  protected readonly filters = signal<KardexFilters | null>(null);

  protected readonly movements = rxResource({
    params: () => {
      const filters = this.filters();
      return filters ? { query: this.query(), filters } : undefined;
    },
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  constructor() {
    // Valores iniciales: los de la URL o la ubicación activa.
    effect(() => {
      const locationId = this.locationId() ?? this.activeLocationId();
      if (locationId && !this.form.controls.locationId.value) {
        this.form.controls.locationId.setValue(locationId);
      }
    });
    effect(() => {
      const itemId = this.itemId();
      if (itemId) {
        this.lookup.byId(itemId).subscribe((item) => this.form.controls.item.setValue(item));
      }
    });

    this.form.valueChanges
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe(() => this.apply());
  }

  protected documentRoute(row: KardexEntry): string | null {
    return documentRoute(row.sourceDocType, row.sourceDocId);
  }

  protected documentLabel(row: KardexEntry): string {
    return documentLabel(row.sourceDocType);
  }

  protected clear(): void {
    this.form.reset({ locationId: this.activeLocationId() });
  }

  private apply(): void {
    const value = this.form.getRawValue();
    this.filters.set({
      locationId: value.locationId,
      itemId: value.item?.id ?? null,
      type: value.type,
      ...dayRange(value.from, value.to),
    });
    this.query.update((query) => ({ ...query, page: 1 }));
  }
}
