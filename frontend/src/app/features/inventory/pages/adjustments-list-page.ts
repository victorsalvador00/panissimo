import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
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
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { dayRange } from '../../../shared/forms/date-range';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { ENUM_LABELS, enumLabel, StatusLabelPipe } from '../../../shared/pipes/status-label.pipe';
import {
  AdjustmentFilters,
  AdjustmentListItem,
  AdjustmentReason,
  AdjustmentsApi,
} from '../data-access/adjustments.api';

@Component({
  selector: 'app-adjustments-list-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
    LocationPicker,
    MxnPipe,
    StatusLabelPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Ajustes"
        subtitle="Mermas, caducados, dañados, uso interno y correcciones."
      >
        @if (canAdjust) {
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Nuevo ajuste
          </a>
        }
      </app-page-header>

      <form [formGroup]="filtersForm" class="filters" novalidate>
        <app-location-picker
          formControlName="locationId"
          label="Ubicación"
          subscriptSizing="dynamic"
        />
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="reason">
            <mat-option [value]="null">Todos</mat-option>
            @for (reason of reasons; track reason) {
              <mat-option [value]="reason">{{ reasonLabels[reason] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
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
        [rows]="adjustments.value()?.items ?? []"
        [total]="adjustments.value()?.total ?? 0"
        [loading]="adjustments.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por folio"
        emptyMessage="No hay ajustes con esos filtros."
        [emptyActionLabel]="canAdjust ? 'Nuevo ajuste' : undefined"
        (emptyAction)="goToNew()"
        [rowClickable]="true"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="createdAt" let-row>{{
          row.createdAt | date: 'dd/MM/yyyy HH:mm'
        }}</ng-template>
        <ng-template appCell="totalCost" let-row>{{ row.totalCost | mxn }}</ng-template>
        <ng-template appCell="status" let-row>
          <app-status-tag [status]="row.status" kind="AdjustmentStatus" />
        </ng-template>
        <ng-template appCardDef let-row>
          <div class="card-row">
            <strong>{{ row.folio }}</strong>
            <span>{{ row.reason | statusLabel: 'AdjustmentReason' }}</span>
          </div>
          <div class="muted">
            {{ row.createdAt | date: 'dd/MM/yyyy HH:mm' }} · {{ row.locationCode }} ·
            {{ row.totalCost | mxn }}
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
export class AdjustmentsListPage {
  private readonly api = inject(AdjustmentsApi);
  private readonly router = inject(Router);

  protected readonly canAdjust = inject(AuthService).can('inventory.adjust');

  protected goToNew(): void {
    void this.router.navigateByUrl('/inventario/ajustes/nuevo');
  }
  protected readonly reasons = Object.keys(ENUM_LABELS.AdjustmentReason) as AdjustmentReason[];
  protected readonly reasonLabels = ENUM_LABELS.AdjustmentReason;

  protected readonly columns: TableColumn<AdjustmentListItem>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'createdAt', header: 'Fecha', sortable: true },
    { key: 'locationCode', header: 'Ubicación' },
    { key: 'reason', header: 'Motivo', value: (row) => enumLabel('AdjustmentReason', row.reason) },
    { key: 'createdByName', header: 'Registró', value: (row) => row.createdByName ?? '—' },
    { key: 'lineCount', header: 'Líneas', align: 'end' },
    { key: 'totalCost', header: 'Costo', align: 'end' },
    { key: 'status', header: 'Estado' },
  ];

  protected readonly filtersForm = new FormGroup({
    locationId: new FormControl<string | null>(inject(LocationContextService).activeLocationId()),
    reason: new FormControl<AdjustmentReason | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  protected readonly query = signal<ListQuery>(defaultListQuery('createdAt:desc'));
  private readonly filters = signal<AdjustmentFilters>(this.currentFilters());

  protected readonly adjustments = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  constructor() {
    this.filtersForm.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe(() => {
      this.filters.set(this.currentFilters());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }

  protected open(adjustment: AdjustmentListItem): void {
    void this.router.navigate(['/inventario/ajustes', adjustment.id]);
  }

  private currentFilters(): AdjustmentFilters {
    const value = this.filtersForm.getRawValue();
    return {
      locationId: value.locationId,
      reason: value.reason,
      ...dayRange(value.from, value.to),
    };
  }
}
