import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { endOfDayIso, startOfDayIso } from '../../../shared/forms/dates';
import { MxnPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { AdjustmentsApi } from '../data-access/inventory-api';
import { ADJUSTMENT_REASONS, AdjustmentReason } from '../ui/adjustment-rules';

/** /inventario/ajustes (frontend §7.3): adjustments of the active location by reason and dates. */
@Component({
  selector: 'app-adjustments-list-page',
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
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Ajustes de inventario">
      <a matButton="filled" routerLink="nuevo">
        <mat-icon>add</mat-icon>
        Nuevo ajuste
      </a>
    </app-page-header>

    <form class="filters" [formGroup]="filters" novalidate>
      <mat-form-field>
        <mat-label>Motivo</mat-label>
        <mat-select formControlName="reason">
          <mat-option [value]="null">Todos</mat-option>
          @for (option of reasons; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Desde</mat-label>
        <input matInput [matDatepicker]="fromPicker" formControlName="from" />
        <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
        <mat-datepicker #fromPicker />
      </mat-form-field>
      <mat-form-field>
        <mat-label>Hasta</mat-label>
        <input matInput [matDatepicker]="toPicker" formControlName="to" />
        <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
        <mat-datepicker #toPicker />
      </mat-form-field>
    </form>

    <app-data-table
      label="Ajustes de inventario"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="adjustments.isLoading()"
      emptyMessage="No hay ajustes con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-adjustment>
        <a class="row-link" [routerLink]="adjustment.id">{{ adjustment.folio }}</a>
      </ng-template>
      <ng-template appCell="createdAt" header="Fecha" sortable [appCellOf]="rows()" let-adjustment>
        {{ adjustment.createdAt | date: 'dd/MM/yyyy HH:mm' }}
      </ng-template>
      <ng-template appCell="location" header="Ubicación" [appCellOf]="rows()" let-adjustment>
        {{ adjustment.locationCode }}
      </ng-template>
      <ng-template appCell="reason" header="Motivo" [appCellOf]="rows()" let-adjustment>
        {{ adjustment.reason | statusLabel: 'AdjustmentReason' }}
      </ng-template>
      <ng-template appCell="lines" header="Líneas" end [appCellOf]="rows()" let-adjustment>
        {{ adjustment.lineCount }}
      </ng-template>
      <ng-template appCell="totalCost" header="Importe" end [appCellOf]="rows()" let-adjustment>
        {{ adjustment.totalCost | mxn }}
      </ng-template>
      <ng-template appCell="user" header="Registró" [appCellOf]="rows()" let-adjustment>
        {{ adjustment.createdByName ?? '—' }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: './inventory.scss',
})
export class AdjustmentsListPage {
  private readonly api = inject(AdjustmentsApi);
  private readonly location = inject(LocationContextService).active;

  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly filters = new FormGroup({
    reason: new FormControl<AdjustmentReason | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'createdAt:desc' });

  protected readonly adjustments = rxResource({
    params: () => ({
      query: this.query(),
      filters: this.applied(),
      locationId: this.location()?.id,
    }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        locationId: params.locationId,
        reason: params.filters.reason,
        from: startOfDayIso(params.filters.from),
        to: endOfDayIso(params.filters.to),
      }),
  });
  protected readonly rows = computed(() =>
    this.adjustments.hasValue() ? this.adjustments.value().items : [],
  );
  protected readonly total = computed(() =>
    this.adjustments.hasValue() ? this.adjustments.value().total : 0,
  );

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }
}
