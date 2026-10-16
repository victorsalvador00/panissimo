import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
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
import { toDateOnly } from '../../../shared/forms/date-range';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { enumLabel } from '../../../shared/pipes/status-label.pipe';
import {
  ProductionOrderFilters,
  ProductionOrderListItem,
  ProductionOrdersApi,
  ProductionOrderStatus,
} from '../data-access/production-orders.api';
import { ORDER_STATUSES } from '../ui/production-order-lines';

/**
 * Órdenes de producción de la ubicación activa, por estado y fecha programada (spec §7.4).
 * Filtros iniciales desde la URL: `?estado=Released&fecha=hoy`.
 */
@Component({
  selector: 'app-production-orders-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Órdenes de producción"
        [subtitle]="'Producción en ' + (location()?.code ?? 'tu ubicación') + '.'"
      >
        @if (canManage) {
          <a mat-flat-button routerLink="nueva">
            <mat-icon>add</mat-icon>
            Nueva orden
          </a>
        }
      </app-page-header>

      <form [formGroup]="form" class="filters" novalidate>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">Todos</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ statusLabel(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha programada</mat-label>
          <mat-date-range-input [rangePicker]="range">
            <input matStartDate formControlName="from" placeholder="Desde" />
            <input matEndDate formControlName="to" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="range" />
          <mat-date-range-picker #range />
        </mat-form-field>
      </form>

      <app-data-table
        [columns]="columns"
        [rows]="orders.value()?.items ?? []"
        [total]="orders.value()?.total ?? 0"
        [loading]="orders.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio"
        emptyMessage="No hay órdenes de producción con esos filtros."
        [emptyActionLabel]="canManage ? 'Nueva orden de producción' : undefined"
        (emptyAction)="goToNew()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="scheduledDate" let-row>{{
          row.scheduledDate | date: 'dd/MM/yyyy'
        }}</ng-template>
        <ng-template appCell="plannedQty" let-row>{{ row.plannedQty | qty }}</ng-template>
        <ng-template appCell="producedQty" let-row>{{
          row.producedQty === null ? '—' : (row.producedQty | qty)
        }}</ng-template>
        <ng-template appCell="unitCost" let-row>{{
          row.unitCost === null ? '—' : (row.unitCost | mxn)
        }}</ng-template>
        <ng-template appCell="status" let-row>
          <app-status-tag [status]="row.status" kind="ProductionOrderStatus" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <app-status-tag [status]="row.status" kind="ProductionOrderStatus" />
          </div>
          <div>{{ row.outputSku }} · {{ row.outputName }}</div>
          <div class="muted">
            {{ row.scheduledDate | date: 'dd/MM/yyyy' }} · planeado {{ row.plannedQty | qty }}
            @if (row.producedQty !== null) {
              · producido {{ row.producedQty | qty }}
            }
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
      align-items: center;
      gap: var(--sgo-space-2);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ProductionOrdersListPage {
  private readonly api = inject(ProductionOrdersApi);
  private readonly router = inject(Router);

  protected readonly location = inject(LocationContextService).activeLocation;
  protected readonly canManage = inject(AuthService).can('production.orders.manage');

  protected goToNew(): void {
    void this.router.navigateByUrl('/produccion/ordenes/nueva');
  }
  protected readonly statuses = ORDER_STATUSES;

  /** Estado inicial desde la URL (ej. el tablero). */
  readonly estado = input<string>();
  /** `hoy` = programadas para hoy. */
  readonly fecha = input<string>();

  protected readonly columns: TableColumn<ProductionOrderListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'scheduledDate', header: 'Programada', sortable: true },
    { key: 'product', header: 'Producto', value: (row) => `${row.outputSku} · ${row.outputName}` },
    { key: 'plannedQty', header: 'Planeado', align: 'end' },
    { key: 'producedQty', header: 'Producido', align: 'end' },
    { key: 'unitCost', header: 'Costo unitario', align: 'end' },
    { key: 'status', header: 'Estado', sortable: true },
  ];

  protected readonly form = new FormGroup({
    status: new FormControl<ProductionOrderStatus | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  /** Las más recientes primero; se puede ordenar por fecha programada. */
  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<Omit<ProductionOrderFilters, 'locationId'>>({});

  protected readonly orders = rxResource({
    params: () => ({
      query: this.query(),
      filters: { ...this.filters(), locationId: this.location()?.id ?? null },
    }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  constructor() {
    this.form.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      const value = this.form.getRawValue();
      this.filters.set({
        status: value.status,
        from: toDateOnly(value.from),
        to: toDateOnly(value.to),
      });
      this.query.update((query) => ({ ...query, page: 1 }));
    });
    effect(() => {
      const status = ORDER_STATUSES.find((s) => s === this.estado()) ?? null;
      const today = this.fecha() === 'hoy' ? startOfToday() : null;
      untracked(() => {
        if (status || today) {
          this.form.patchValue({
            status: status ?? this.form.controls.status.value,
            from: today ?? this.form.controls.from.value,
            to: today ?? this.form.controls.to.value,
          });
        }
      });
    });
  }

  protected statusLabel(status: ProductionOrderStatus): string {
    return enumLabel('ProductionOrderStatus', status);
  }

  protected open(order: ProductionOrderListItem): void {
    void this.router.navigate(['/produccion/ordenes', order.id]);
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
