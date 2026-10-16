import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
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
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { toDateOnly } from '../../../shared/forms/date-range';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import {
  ConsumptionFilters,
  ConsumptionListItem,
  ConsumptionsApi,
} from '../data-access/consumptions.api';

/** Consumos registrados en sucursales (solo lectura). */
@Component({
  selector: 'app-consumptions-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    LocationPicker,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Consumos" subtitle="Salidas diarias de las sucursales.">
        @if (canRegister) {
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Registrar consumo
          </a>
        }
      </app-page-header>

      <form [formGroup]="filtersForm" class="filters" novalidate>
        <app-location-picker
          formControlName="locationId"
          label="Sucursal"
          [types]="['Branch']"
          subscriptSizing="dynamic"
        />
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Periodo</mat-label>
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
        [rows]="entries.value()?.items ?? []"
        [total]="entries.value()?.total ?? 0"
        [loading]="entries.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio"
        emptyMessage="No hay consumos con esos filtros."
        [emptyActionLabel]="canRegister ? 'Registrar consumo' : undefined"
        (emptyAction)="goToNew()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="businessDate" let-row>{{
          row.businessDate | date: 'dd/MM/yyyy'
        }}</ng-template>
        <ng-template appCell="totalCost" let-row>{{ row.totalCost | mxn }}</ng-template>
        <ng-template appCell="status" let-row>
          <app-status-tag [status]="row.status" kind="ConsumptionStatus" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <span>{{ row.businessDate | date: 'dd/MM/yyyy' }}</span>
          </div>
          <div class="muted">
            {{ row.locationCode }} · {{ row.lineCount }} líneas · {{ row.totalCost | mxn }}
            @if (row.createdByName) {
              · {{ row.createdByName }}
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
      gap: var(--sgo-space-2) var(--sgo-space-3);
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
export class ConsumptionsListPage {
  private readonly api = inject(ConsumptionsApi);
  private readonly router = inject(Router);

  protected readonly canRegister = inject(AuthService).can('inventory.consumption');

  protected goToNew(): void {
    void this.router.navigateByUrl('/inventario/consumos/nuevo');
  }

  protected readonly columns: TableColumn<ConsumptionListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'businessDate', header: 'Día', sortable: true },
    { key: 'locationCode', header: 'Sucursal' },
    { key: 'createdByName', header: 'Registró', value: (row) => row.createdByName ?? '—' },
    { key: 'lineCount', header: 'Líneas', align: 'end' },
    { key: 'totalCost', header: 'Costo', align: 'end' },
    { key: 'status', header: 'Estado' },
  ];

  protected readonly filtersForm = new FormGroup({
    locationId: new FormControl<string | null>(activeBranchId()),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('businessDate:desc'));
  private readonly filters = signal<ConsumptionFilters>(this.currentFilters());

  protected readonly entries = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  constructor() {
    this.filtersForm.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.currentFilters());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected open(entry: ConsumptionListItem): void {
    void this.router.navigate(['/inventario/consumos', entry.id]);
  }

  private currentFilters(): ConsumptionFilters {
    const value = this.filtersForm.getRawValue();
    return { locationId: value.locationId, from: toDateOnly(value.from), to: toDateOnly(value.to) };
  }
}

/** Sucursal activa como filtro inicial; en fábrica o comisariato no hay consumos: todas. */
function activeBranchId(): string | null {
  const active = inject(LocationContextService).activeLocation();
  return active?.type === 'Branch' ? active.id : null;
}
