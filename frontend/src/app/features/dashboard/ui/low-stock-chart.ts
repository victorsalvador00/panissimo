import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { Chart } from 'chart.js';
import { ThemeService } from '../../../core/theme/theme.service';
import type { LocationCount } from '../data-access/dashboard.api';

const BAR_HEIGHT = 28;

/**
 * Gráfica de barras horizontales de artículos bajo mínimo por ubicación (gerencia, `locations.all`).
 * Una sola serie en el color primario: sin leyenda (el título la nombra), tooltip por barra y una
 * tabla oculta para lectores de pantalla. Tocar una barra emite la ubicación. Chart.js se carga solo
 * cuando la gráfica aparece.
 */
@Component({
  selector: 'app-low-stock-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [style.height.px]="height()">
      <canvas #canvas role="img" [attr.aria-label]="summary()"></canvas>
    </div>
    <table class="sgo-visually-hidden">
      <caption>
        Artículos bajo mínimo por ubicación
      </caption>
      <thead>
        <tr>
          <th scope="col">Ubicación</th>
          <th scope="col">Artículos bajo mínimo</th>
        </tr>
      </thead>
      <tbody>
        @for (row of data(); track row.locationId) {
          <tr>
            <th scope="row">{{ row.locationCode }} · {{ row.locationName }}</th>
            <td>{{ row.count }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      position: relative;
      width: 100%;
    }
  `,
})
export class LowStockChart {
  readonly data = input.required<LocationCount[]>();
  readonly selected = output<LocationCount>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart: Chart<'bar'> | null = null;

  protected readonly height = () => this.data().length * BAR_HEIGHT + 40;
  protected readonly summary = () => {
    const total = this.data().filter((row) => row.count > 0).length;
    return total
      ? `Artículos bajo mínimo en ${total} de ${this.data().length} ubicaciones.`
      : 'Ninguna ubicación tiene artículos bajo mínimo.';
  };

  constructor() {
    afterRenderEffect(() => {
      // Se vuelve a dibujar al cambiar de tema: los colores del canvas no siguen al CSS.
      this.theme.dark();
      void this.draw(this.data());
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private async draw(rows: LocationCount[]): Promise<void> {
    const canvas = this.canvas().nativeElement;
    // Sin canvas (pruebas, navegadores sin soporte) queda la tabla accesible.
    if (!canvas.getContext?.('2d')) {
      return;
    }
    const { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } =
      await import('chart.js');
    Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

    // Los tokens de Material son light-dark(…): el navegador los resuelve en `color` de un elemento de prueba.
    const probe = document.createElement('span');
    canvas.parentElement!.append(probe);
    const token = (name: string, fallback: string) => {
      probe.style.color = `var(${name}, ${fallback})`;
      return getComputedStyle(probe).color || fallback;
    };
    const bar = token('--mat-sys-primary', '#005cbb');
    const ink = token('--mat-sys-on-surface-variant', '#44474e');
    const grid = token('--mat-sys-outline-variant', '#c4c6d0');
    probe.remove();

    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((row) => row.locationCode),
        datasets: [
          {
            data: rows.map((row) => row.count),
            backgroundColor: bar,
            hoverBackgroundColor: bar,
            borderRadius: { topRight: 4, bottomRight: 4 },
            borderSkipped: 'start',
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        onClick: (_event, elements) => {
          const row = elements[0] ? rows[elements[0].index] : undefined;
          if (row) {
            this.selected.emit(row);
          }
        },
        onHover: (event, elements) => {
          const target = event.native?.target as HTMLElement | undefined;
          if (target) {
            target.style.cursor = elements.length ? 'pointer' : 'default';
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: (items) => {
                const row = rows[items[0].dataIndex];
                return `${row.locationCode} · ${row.locationName}`;
              },
              label: (item) =>
                `${item.parsed.x} ${item.parsed.x === 1 ? 'artículo' : 'artículos'} bajo mínimo`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0, color: ink },
            grid: { color: grid },
            border: { display: false },
          },
          y: {
            ticks: { color: ink },
            grid: { display: false },
            border: { color: grid },
          },
        },
      },
    });
  }
}
