import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { toIsoDate } from '../../../shared/forms/dates';
import { MxnPipe } from '../../../shared/pipes/pipes';
import { ConsumptionsApi } from '../data-access/inventory-api';

/** /inventario/consumos (frontend §7.3): consumptions of the active branch by day. */
@Component({
  selector: 'app-consumptions-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    MxnPipe,
  ],
  template: `
    <app-page-header title="Consumos">
      <a matButton="filled" routerLink="nuevo">
        <mat-icon>add</mat-icon>
        Nuevo consumo
      </a>
    </app-page-header>

    <form class="filters" [formGroup]="filters" novalidate>
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
      label="Consumos"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="consumptions.isLoading()"
      emptyMessage="No hay consumos con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-consumption>
        <a class="row-link" [routerLink]="consumption.id">{{ consumption.folio }}</a>
      </ng-template>
      <ng-template
        appCell="businessDate"
        header="Día"
        sortable
        [appCellOf]="rows()"
        let-consumption
      >
        {{ consumption.businessDate | date: 'dd/MM/yyyy' }}
      </ng-template>
      <ng-template appCell="location" header="Ubicación" [appCellOf]="rows()" let-consumption>
        {{ consumption.locationCode }}
      </ng-template>
      <ng-template appCell="lines" header="Artículos" end [appCellOf]="rows()" let-consumption>
        {{ consumption.lineCount }}
      </ng-template>
      <ng-template appCell="totalCost" header="Importe" end [appCellOf]="rows()" let-consumption>
        {{ consumption.totalCost | mxn }}
      </ng-template>
      <ng-template appCell="user" header="Registró" [appCellOf]="rows()" let-consumption>
        {{ consumption.createdByName ?? '—' }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: './inventory.scss',
})
export class ConsumptionsListPage {
  private readonly api = inject(ConsumptionsApi);
  private readonly location = inject(LocationContextService).active;

  protected readonly filters = new FormGroup({
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = signal<ListQuery>({
    page: 1,
    pageSize: 25,
    sort: 'businessDate:desc',
  });

  protected readonly consumptions = rxResource({
    params: () => ({
      query: this.query(),
      filters: this.applied(),
      locationId: this.location()?.id,
    }),
    stream: ({ params }) =>
      this.api.list(params.query, {
        locationId: params.locationId,
        from: toIsoDate(params.filters.from),
        to: toIsoDate(params.filters.to),
      }),
  });
  protected readonly rows = computed(() =>
    this.consumptions.hasValue() ? this.consumptions.value().items : [],
  );
  protected readonly total = computed(() =>
    this.consumptions.hasValue() ? this.consumptions.value().total : 0,
  );

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(200), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((query) => ({ ...query, page: 1 }));
    });
  }
}
