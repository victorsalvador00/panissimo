import { BreakpointObserver } from '@angular/cdk/layout';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { downloadText } from '../../../shared/data-access/csv';
import { enumLabel } from '../../../shared/pipes/labels';
import {
  DIRECTION_SEGMENTS,
  TraceDirection,
  TraceGraph,
  TraceabilityApi,
  defaultDirection,
  directionOf,
  sourceTypeOf,
} from '../data-access/traceability-api';
import { traceCsv, traceCsvName } from '../ui/trace/trace-events';
import { TraceGraphView } from '../ui/trace/trace-graph';
import { TraceLog } from '../ui/trace/trace-log';
import { TraceSummary } from '../ui/trace/trace-summary';

/** What each warning of the response means (trazabilidad §5.3). */
export function warningText(code: string, graph: TraceGraph): string {
  switch (code) {
    case 'no_lots':
      return graph.source.type === 'PurchaseOrder'
        ? 'Esta OC todavía no tiene recepciones.'
        : graph.source.type === 'ProductionOrder'
          ? 'Esta OP todavía no tiene cierres.'
          : 'La entrada no tiene lotes que rastrear.';
    case 'truncated':
      return `Resultado recortado por el límite de niveles o de nodos: ${graph.unexpandedNodeIds.length} lotes sin expandir.`;
    case 'unlotted_components':
      return 'Hay componentes sin control de lote: aparecen en el cierre sin origen de compra.';
    case 'missing_receipt_link':
      return 'Hay lotes sin liga a su recepción.';
    default:
      return code;
  }
}

/**
 * /inventario/trazabilidad/:sourceType/:sourceId?direccion= (trazabilidad §6.3 and trazabilidad-ui): the chain of the
 * entry point in three tabs (Mapa, Resumen, Bitácora), its warnings and "Exportar CSV". Changing the direction only
 * changes the highlight when the response has both; otherwise it asks again for both.
 */
@Component({
  selector: 'app-traceability-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
    TraceGraphView,
    TraceSummary,
    TraceLog,
  ],
  templateUrl: './traceability-page.html',
  styleUrl: './traceability-page.scss',
})
export class TraceabilityPage {
  readonly sourceType = input.required<string>();
  readonly sourceId = input.required<string>();
  readonly direccion = input<string>();

  private readonly api = inject(TraceabilityApi);
  private readonly router = inject(Router);
  private readonly mobile = inject(BreakpointObserver).isMatched('(max-width: 767.98px)');

  protected readonly type = computed(() => sourceTypeOf(this.sourceType()));
  private readonly entry = computed(() => ({ type: this.type(), id: this.sourceId() }));
  /** Direction asked to the API: the one of the URL when the entry opens, or RN-100's (null). */
  private readonly asked = linkedSignal<
    { type: ReturnType<typeof sourceTypeOf>; id: string },
    TraceDirection | null
  >({
    source: this.entry,
    computation: () => untracked(() => this.urlDirection()),
  });
  /** The highlight; changing it rewrites `?direccion=` without asking again. */
  protected readonly direction = linkedSignal<
    { type: ReturnType<typeof sourceTypeOf>; id: string },
    TraceDirection
  >({
    source: this.entry,
    computation: ({ type }) =>
      untracked(() => this.urlDirection()) ?? (type ? defaultDirection(type) : 'Both'),
  });
  protected readonly tab = signal(this.mobile ? 1 : 0);

  protected readonly result = rxResource({
    params: () => {
      const type = this.type();
      return type ? { type, id: this.sourceId(), direction: this.asked() } : null;
    },
    stream: ({ params }) =>
      params ? this.api.graph(params.type, params.id, params.direction) : of(null),
  });
  protected readonly graph = computed(() => (this.result.hasValue() ? this.result.value() : null));
  protected readonly notFound = computed(() => {
    const error = this.result.error();
    return error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400);
  });
  protected readonly empty = computed(() => this.graph()?.warnings.includes('no_lots') ?? false);
  protected readonly warnings = computed(() => {
    const graph = this.graph();
    return graph
      ? graph.warnings.filter((w) => w !== 'no_lots').map((w) => warningText(w, graph))
      : [];
  });
  protected readonly asOf = computed(() => {
    const graph = this.graph();
    return graph
      ? new Intl.DateTimeFormat('es-MX', {
          timeZone: 'America/Mexico_City',
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(graph.asOf))
      : '';
  });
  protected readonly typeLabel = computed(() => enumLabel('TraceSourceType', this.type()));

  private readonly map = viewChild(TraceGraphView);

  private urlDirection(): TraceDirection | null {
    return directionOf(this.direccion());
  }

  protected changeDirection(direction: TraceDirection): void {
    this.direction.set(direction);
    const graph = this.graph();
    if (graph && graph.direction !== 'Both' && direction !== graph.direction)
      this.asked.set('Both');
    void this.router.navigate([], {
      queryParams: { direccion: DIRECTION_SEGMENTS[direction] },
      replaceUrl: true,
    });
  }

  protected exportCsv(): void {
    const graph = this.graph();
    if (graph) downloadText(traceCsvName(graph), traceCsv(graph));
  }

  /** Bitácora → Mapa: the card of the event, selected and with its ficha. */
  protected openOnMap(cardId: string): void {
    this.tab.set(0);
    setTimeout(() => this.map()?.focusCard(cardId), 0);
  }
}
