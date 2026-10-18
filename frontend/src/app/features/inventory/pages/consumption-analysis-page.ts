import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BarChart, BarSeries } from '../../../shared/components/bar-chart/bar-chart';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { ItemsApi } from '../../catalog/data-access/catalog-api';
import { ConsumptionAnalysisApi, ConsumptionAnalysisRow } from '../data-access/inventory-api';

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** The suggestion differs from what the location has (nothing to apply otherwise). */
export function suggestionDiffers(row: ConsumptionAnalysisRow): boolean {
  return row.currentMin !== row.suggestedMin || row.currentMax !== row.suggestedMax;
}

/**
 * /inventario/analisis-consumo (frontend §7.3, RN-52): exits of the active location (and its sub-warehouses) over whole
 * weeks up to yesterday: daily average, weekday bars, trend (last 4 weeks against the 4 before), current and suggested
 * min/max. **Aplicar sugerido** (catalog.manage) saves the suggestion as the normal min/max of the location.
 */
@Component({
  selector: 'app-consumption-analysis-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    BarChart,
    QtyPipe,
  ],
  templateUrl: './consumption-analysis-page.html',
  styleUrl: './consumption-analysis-page.scss',
})
export class ConsumptionAnalysisPage {
  private readonly api = inject(ConsumptionAnalysisApi);
  private readonly itemsApi = inject(ItemsApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  protected readonly location = inject(LocationContextService).active;
  protected readonly canApply = inject(AuthService).can('catalog.manage');
  protected readonly weekOptions = [4, 8, 12, 26];
  protected readonly weekdays = WEEKDAYS;

  protected readonly weeks = new FormControl(8, { nonNullable: true });
  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly params = signal<{ weeks: number; q: string | null }>({ weeks: 8, q: null });
  protected readonly expanded = signal<string | null>(null);
  protected readonly busy = signal<string | null>(null);

  protected readonly analysis = rxResource({
    params: () => {
      const location = this.location();
      return location ? { location: location.id, ...this.params() } : null;
    },
    stream: ({ params }) =>
      params ? this.api.get(params.location, params.weeks, params.q) : of(null),
  });
  protected readonly data = computed(() =>
    this.analysis.hasValue() ? this.analysis.value() : null,
  );
  /** Weekday bars of the expanded row (stable arrays: the chart redraws only when they change). */
  protected readonly weekdayChart = computed(() => {
    const row = this.data()?.rows.find((r) => r.itemId === this.expanded());
    // Without units: averages of pieces keep their decimals (the unit goes in the chart's label).
    return row
      ? {
          series: [
            { label: 'Promedio', values: row.byWeekday, color: '--pan-chart-produced' },
          ] as BarSeries[],
        }
      : null;
  });

  constructor() {
    this.weeks.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((weeks) => this.params.update((p) => ({ ...p, weeks })));
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.params.update((p) => ({ ...p, q: q.trim() || null })));
  }

  protected toggle(row: ConsumptionAnalysisRow): void {
    this.expanded.set(this.expanded() === row.itemId ? null : row.itemId);
  }

  protected readonly differs = suggestionDiffers;

  protected async apply(row: ConsumptionAnalysisRow): Promise<void> {
    const location = this.location();
    if (!location) return;
    const unit = row.baseUomCode;
    const current =
      row.currentMin === null
        ? 'sin mín/máx'
        : `${formatQty(row.currentMin, unit)} / ${formatQty(row.currentMax, unit)}`;
    const confirmed = await this.confirmService.confirm({
      title: `Aplicar el sugerido a ${row.sku}`,
      message: `Se guarda como el mínimo y máximo de ${row.sku} en ${location.name}; lo usan el sugerido de pedidos y las alertas de bajo mínimo.`,
      summary: [
        { label: 'Actual', value: current },
        {
          label: 'Sugerido',
          value: `${formatQty(row.suggestedMin, unit)} / ${formatQty(row.suggestedMax, unit)}`,
        },
      ],
      confirmLabel: 'Aplicar',
    });
    if (!confirmed) return;
    this.busy.set(row.itemId);
    try {
      await firstValueFrom(
        this.itemsApi.updateLocationSettings(row.itemId, [
          { locationId: location.id, minQty: row.suggestedMin, maxQty: row.suggestedMax },
        ]),
      );
      this.notifier.info(`Mín/máx de ${row.sku} actualizado.`);
      this.analysis.reload();
    } catch {
      // The error interceptor shows why.
    } finally {
      this.busy.set(null);
    }
  }
}
