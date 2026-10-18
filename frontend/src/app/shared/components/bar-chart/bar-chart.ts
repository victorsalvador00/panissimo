import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Chart as ChartType } from 'chart.js';
import { ThemeService } from '../../../core/theme/theme.service';
import { formatQty } from '../../pipes/pipes';

/** A series of the chart; `color` is a CSS custom property read from the page (it follows the theme). */
export interface BarSeries {
  label: string;
  values: readonly number[];
  color: string;
}

type ChartModule = typeof import('chart.js');
let chartModule: Promise<ChartModule> | null = null;

/** Chart.js loads on first use only (frontend §2: deferred `import()`), with just the pieces a bar chart needs. */
function loadChart(): Promise<ChartModule> {
  chartModule ??= import('chart.js').then((m) => {
    m.Chart.register(
      m.BarController,
      m.BarElement,
      m.CategoryScale,
      m.LinearScale,
      m.Tooltip,
      m.Legend,
    );
    return m;
  });
  return chartModule;
}

/**
 * Horizontal (default) or vertical bars with Chart.js. The canvas is decorative for screen readers: the same data goes in
 * a visually hidden table (`caption` = `label`). `barClick` gives the index of the touched bar.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas" [style.height.px]="height()">
      <canvas #canvas aria-hidden="true"></canvas>
    </div>
    <table class="pan-sr-only">
      <caption>
        {{
          label()
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ categoryLabel() }}</th>
          @for (s of series(); track s.label) {
            <th scope="col">{{ s.label }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (category of categories(); track $index; let i = $index) {
          <tr>
            <th scope="row">{{ category }}</th>
            @for (s of series(); track s.label) {
              <td>{{ text(s.values[i], i) }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
    }
    .canvas {
      position: relative;
      width: 100%;
    }
  `,
})
export class BarChart {
  /** Accessible name of the chart (caption of its table). */
  readonly label = input.required<string>();
  readonly categoryLabel = input('Concepto');
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly BarSeries[]>();
  /** Unit per category, for the tooltip and the hidden table. */
  readonly units = input<readonly (string | null)[]>([]);
  readonly horizontal = input(true);
  readonly showLegend = input(true);
  readonly barClick = output<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart: ChartType<'bar'> | null = null;

  /** Room for every bar: 28 px per category and series (horizontal), at least 160 px. */
  protected readonly height = computed(() =>
    this.horizontal()
      ? Math.max(160, 48 + this.categories().length * Math.max(1, this.series().length) * 22)
      : 240,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
    afterRenderEffect(() => {
      const data = {
        categories: this.categories(),
        series: this.series(),
        horizontal: this.horizontal(),
        legend: this.showLegend(),
        dark: this.theme.isDark(),
      };
      void loadChart().then((m) => this.draw(m, data));
    });
  }

  protected text(value: number | undefined, index: number): string {
    return formatQty(value ?? 0, this.units()[index] ?? null);
  }

  private draw(
    m: ChartModule,
    d: {
      categories: readonly string[];
      series: readonly BarSeries[];
      horizontal: boolean;
      legend: boolean;
    },
  ): void {
    const element = this.canvas().nativeElement;
    // Tokens use light-dark(): a custom property reads back unresolved, so each one is resolved through an element's color.
    const probe = document.createElement('span');
    probe.style.display = 'none';
    element.parentElement!.appendChild(probe);
    const color = (value: string) => {
      probe.style.color = value.startsWith('--') ? `var(${value})` : value;
      return getComputedStyle(probe).color;
    };
    const text = color('--mat-sys-on-surface-variant');
    const grid = color('--mat-sys-outline-variant');
    const colors = d.series.map((s) => color(s.color));
    // Whole counts (items, orders, pieces) never get 0.5 ticks.
    const whole = d.series.every((s) => s.values.every((v) => Number.isInteger(v)));
    const valueTicks = { color: text, precision: whole ? 0 : undefined };
    probe.remove();
    this.chart?.destroy();
    this.chart = new m.Chart(element, {
      type: 'bar',
      data: {
        labels: [...d.categories],
        datasets: d.series.map((s, i) => ({
          label: s.label,
          data: [...s.values],
          backgroundColor: colors[i],
          borderRadius: 4,
          maxBarThickness: 22,
        })),
      },
      options: {
        indexAxis: d.horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        onClick: (_event, elements) => {
          if (elements.length > 0) this.barClick.emit(elements[0].index);
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        },
        plugins: {
          legend: { display: d.legend, labels: { color: text } },
          tooltip: {
            callbacks: {
              label: (item) =>
                `${item.dataset.label}: ${this.text(item.parsed[d.horizontal ? 'x' : 'y'] ?? 0, item.dataIndex)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: d.horizontal ? valueTicks : { color: text },
            grid: { color: grid },
            beginAtZero: true,
          },
          y: {
            ticks: d.horizontal ? { color: text } : valueTicks,
            grid: { color: grid },
            beginAtZero: true,
          },
        },
      },
    });
  }
}
