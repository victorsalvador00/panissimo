import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, of } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { BarChart, BarSeries } from '../../../shared/components/bar-chart/bar-chart';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { toIsoDate } from '../../../shared/forms/dates';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { ProductionSummaryApi, SummaryGroupBy, SummaryRow } from '../data-access/production-api';

const GROUPS: readonly { value: SummaryGroupBy; label: string; column: string }[] = [
  { value: 'Factory', label: 'Por fábrica', column: 'Fábrica' },
  { value: 'Item', label: 'Por producto', column: 'Producto' },
  { value: 'Day', label: 'Por día', column: 'Día' },
];

/** The chart shows the first rows only; the table always has them all. */
export const SUMMARY_CHART_ROWS = 15;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

/** "dd/MM/yyyy" for a day row, the name (and SKU) otherwise; the unit always, since kg and pieces are never added. */
export function summaryLabel(row: SummaryRow): string {
  const name = row.date
    ? row.date.split('-').reverse().join('/')
    : row.sku
      ? `${row.sku} ${row.label}`
      : row.label;
  return `${name} (${row.baseUomCode})`;
}

/**
 * /produccion/resumen (frontend §7.4, RN-53): planned (orders of the range not cancelled), produced (closes of the range),
 * compliance, cost and waste in pesos, by factory (RN-49), product or day; table and bars. One row per unit.
 */
@Component({
  selector: 'app-summary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    BarChart,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './summary-page.html',
  styleUrl: './summary-page.scss',
})
export class SummaryPage {
  private readonly api = inject(ProductionSummaryApi);
  protected readonly plant = inject(LocationContextService).plant;
  protected readonly groups = GROUPS;
  protected readonly chartRows = SUMMARY_CHART_ROWS;

  protected readonly range = new FormGroup({
    from: new FormControl<Date | null>(daysAgo(6)),
    to: new FormControl<Date | null>(daysAgo(0)),
  });
  private readonly rangeValue = toSignal(this.range.valueChanges.pipe(debounceTime(200)), {
    initialValue: this.range.value,
  });
  protected readonly groupBy = signal<SummaryGroupBy>('Factory');
  protected readonly column = computed(
    () => GROUPS.find((g) => g.value === this.groupBy())!.column,
  );

  protected readonly summary = rxResource({
    params: () => {
      const { from, to } = this.rangeValue();
      const plant = this.plant();
      return plant && from && to && from <= to
        ? { plant: plant.id, from: toIsoDate(from)!, to: toIsoDate(to)!, groupBy: this.groupBy() }
        : null;
    },
    stream: ({ params }) =>
      params ? this.api.get(params.plant, params.from, params.to, params.groupBy) : of(null),
  });
  protected readonly data = computed(() => (this.summary.hasValue() ? this.summary.value() : null));

  protected readonly chart = computed(() => {
    const rows = (this.data()?.rows ?? []).slice(0, SUMMARY_CHART_ROWS);
    return {
      categories: rows.map(summaryLabel),
      units: rows.map((r) => r.baseUomCode),
      series: [
        { label: 'Planeado', values: rows.map((r) => r.planned), color: '--pan-chart-planned' },
        { label: 'Producido', values: rows.map((r) => r.produced), color: '--pan-chart-produced' },
      ] satisfies BarSeries[],
    };
  });

  protected readonly label = summaryLabel;
}
