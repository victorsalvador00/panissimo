import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ListQuery } from '../../../shared/data-access/list-query';
import { toIsoDate } from '../../../shared/forms/dates';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { plantFactories } from '../data-access/plant-factories';
import { ProductionClosesApi } from '../data-access/production-api';

type Kind = ApiEnum<'ProductionCloseKind'>;

/** /produccion/cierres (frontend §7.4): every close with date, order, product, factory, shift, kind, produced, cost and waste. */
@Component({
  selector: 'app-closes-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    DataTable,
    CellDef,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Cierres de producción" />

    <form class="filters" [formGroup]="filters" novalidate>
      <mat-form-field class="search">
        <mat-label>Buscar por folio, OP o producto</mat-label>
        <input matInput type="search" formControlName="q" />
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
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
      @if (factories().length > 0) {
        <mat-form-field>
          <mat-label>Fábrica</mat-label>
          <mat-select formControlName="factoryId">
            <mat-option [value]="null">Todas</mat-option>
            @for (factory of factories(); track factory.id) {
              <mat-option [value]="factory.id">{{ factory.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      <mat-form-field>
        <mat-label>Tipo</mat-label>
        <mat-select formControlName="kind">
          <mat-option [value]="null">Todos</mat-option>
          @for (option of kinds; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </form>

    <app-data-table
      label="Cierres de producción"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="closes.isLoading()"
      emptyMessage="No hay cierres con estos filtros."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-close>
        <a class="row-link" [routerLink]="close.id">{{ close.folio }}</a>
      </ng-template>
      <ng-template appCell="closedAt" header="Fecha" sortable [appCellOf]="rows()" let-close>
        {{ close.closedAt | date: 'dd/MM/yyyy HH:mm' }}
      </ng-template>
      <ng-template appCell="order" header="OP" [appCellOf]="rows()" let-close>
        <a class="row-link" [routerLink]="['/produccion/ordenes', close.productionOrderId]">
          {{ close.orderFolio }}
        </a>
      </ng-template>
      <ng-template appCell="product" header="Producto" [appCellOf]="rows()" let-close>
        <strong>{{ close.sku }}</strong> {{ close.itemName }}
      </ng-template>
      <ng-template appCell="factory" header="Fábrica y turno" [appCellOf]="rows()" let-close>
        {{ close.factoryName ?? '—' }}
        @if (close.shift) {
          · {{ close.shift | statusLabel: 'Shift' }}
        }
      </ng-template>
      <ng-template appCell="kind" header="Tipo" [appCellOf]="rows()" let-close>
        {{ close.kind | statusLabel: 'ProductionCloseKind' }}
      </ng-template>
      <ng-template appCell="produced" header="Producido" end [appCellOf]="rows()" let-close>
        {{ close.producedQty | qty: close.baseUomCode }}
      </ng-template>
      <ng-template appCell="cost" header="Costo" end [appCellOf]="rows()" let-close>
        {{ close.totalCost | mxn }}
      </ng-template>
      <ng-template appCell="waste" header="Merma" end [appCellOf]="rows()" let-close>
        {{ close.wasteCost | mxn }}
      </ng-template>
    </app-data-table>
  `,
  styleUrl: '../../catalog/pages/catalog-list.scss',
})
export class ClosesListPage {
  private readonly api = inject(ProductionClosesApi);
  protected readonly kinds = Object.entries(ENUM_LABELS.ProductionCloseKind).map(
    ([value, label]) => ({ value: value as Kind, label }),
  );

  protected readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    factoryId: new FormControl<string | null>(null),
    kind: new FormControl<Kind | null>(null),
  });
  private readonly applied = signal(this.filters.getRawValue());
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'closedAt:desc' });

  protected readonly closes = rxResource({
    params: () => ({ query: this.query(), filters: this.applied() }),
    stream: ({ params }) => {
      const f = params.filters;
      return this.api.list(
        { ...params.query, q: f.q.trim() || undefined },
        { from: toIsoDate(f.from), to: toIsoDate(f.to), factoryId: f.factoryId, kind: f.kind },
      );
    },
  });
  protected readonly rows = computed(() =>
    this.closes.hasValue() ? this.closes.value().items : [],
  );
  protected readonly total = computed(() =>
    this.closes.hasValue() ? this.closes.value().total : 0,
  );
  protected readonly factories = plantFactories();

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.applied.set(this.filters.getRawValue());
      this.query.update((x) => ({ ...x, page: 1 }));
    });
  }
}
