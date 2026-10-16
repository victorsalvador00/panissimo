import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { debounceTime } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { dayRange } from '../../../shared/forms/date-range';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import {
  GoodsReceiptFilters,
  GoodsReceiptListItem,
  GoodsReceiptsApi,
} from '../data-access/goods-receipts.api';
import { isPurchaseLocation } from '../ui/requisition-lines';

/** Historial de recepciones de compra (`/compras/recepciones`, `purchasing.view`). */
@Component({
  selector: 'app-goods-receipts-list-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Recepciones"
        subtitle="Entradas al inventario por compras. Para recibir, abre la orden de compra."
      />

      <form [formGroup]="form" class="filters" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha de recepción</mat-label>
          <mat-date-range-input [rangePicker]="range">
            <input matStartDate formControlName="from" placeholder="Desde" />
            <input matEndDate formControlName="to" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="range" />
          <mat-date-range-picker #range />
        </mat-form-field>
        @if (locations().length > 1) {
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
        [rows]="receipts.value()?.items ?? []"
        [total]="receipts.value()?.total ?? 0"
        [loading]="receipts.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio o factura"
        emptyMessage="No hay recepciones con esos filtros."
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="receivedAt" let-row>{{
          row.receivedAt | date: 'dd/MM/yyyy HH:mm'
        }}</ng-template>
        <ng-template appCell="totalCost" let-row>{{ row.totalCost | mxn }}</ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <span>{{ row.totalCost | mxn }}</span>
          </div>
          <div>{{ row.supplier.name }}</div>
          <div class="muted">
            {{ row.purchaseOrder.folio }} · {{ row.location.code }} ·
            {{ row.receivedAt | date: 'dd/MM/yyyy HH:mm' }}
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-width: 600px;
      gap: var(--sgo-space-3);
      margin-bottom: var(--sgo-space-4);
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
export class GoodsReceiptsListPage {
  private readonly api = inject(GoodsReceiptsApi);
  private readonly router = inject(Router);
  private readonly locationContext = inject(LocationContextService);

  protected readonly locations = computed(() =>
    this.locationContext.locations().filter((location) => isPurchaseLocation(location.type)),
  );

  protected readonly columns: TableColumn<GoodsReceiptListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'receivedAt', header: 'Recibida', sortable: true },
    { key: 'purchaseOrder', header: 'Orden de compra', value: (row) => row.purchaseOrder.folio },
    { key: 'supplier', header: 'Proveedor', value: (row) => row.supplier.name },
    { key: 'location', header: 'Ubicación', value: (row) => row.location.code },
    { key: 'supplierInvoiceNumber', header: 'Factura' },
    { key: 'totalCost', header: 'Costo sin IVA', align: 'end' },
  ];

  protected readonly form = new FormGroup({
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    locationId: new FormControl<string | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('receivedAt:desc'));
  private readonly filters = signal<GoodsReceiptFilters>({});

  protected readonly receipts = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  constructor() {
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      const value = this.form.getRawValue();
      this.filters.set({ ...dayRange(value.from, value.to), locationId: value.locationId });
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected open(receipt: GoodsReceiptListItem): void {
    void this.router.navigate(['/compras/recepciones', receipt.id]);
  }
}
