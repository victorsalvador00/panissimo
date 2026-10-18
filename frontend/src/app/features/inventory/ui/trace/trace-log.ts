import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { documentLink } from '../../../../shared/data-access/document-links';
import type { TraceGraph } from '../../data-access/traceability-api';
import { EventRow, STAGE_LABELS, eventDays, signedQty } from './trace-events';
import { layoutTrace } from './trace-layout';

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Bitácora (trazabilidad-ui §7): the events grouped by day with a dot per stage. Each row can take the focus; a click or
 * Enter goes to the map with the card of the event selected.
 */
@Component({
  selector: 'app-trace-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (days().length === 0) {
      <p class="muted">Sin eventos.</p>
    } @else {
      <div class="table-wrap pan-card">
        <table aria-label="Bitácora de la cadena">
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Documento</th>
              <th scope="col">Evento</th>
              <th scope="col">Artículo y lote</th>
              <th scope="col" class="end">Cantidad</th>
              <th scope="col">Ubicación</th>
            </tr>
          </thead>
          @for (day of days(); track day.label) {
            <tbody>
              <tr class="day">
                <th scope="colgroup" colspan="6">{{ day.label }}</th>
              </tr>
              @for (row of day.rows; track $index) {
                <tr
                  [attr.tabindex]="row.cardId ? 0 : null"
                  [class.focusable]="!!row.cardId"
                  (click)="go(row)"
                  (keydown.enter)="go(row)"
                >
                  <td class="num">{{ row.time }}</td>
                  <td>
                    @if (link(row); as l) {
                      <a class="row-link" [routerLink]="l" (click)="$event.stopPropagation()">{{
                        row.event.folio
                      }}</a>
                    } @else {
                      {{ row.event.folio }}
                    }
                  </td>
                  <td>
                    <span
                      [class]="'dot ' + row.stage"
                      [attr.title]="stages[row.stage]"
                      aria-hidden="true"
                    ></span>
                    {{ row.event.description }}
                    <span class="pan-sr-only">({{ stages[row.stage] }})</span>
                  </td>
                  <td>{{ join(row.event.sku, row.event.lotNumber) }}</td>
                  <td class="end num" [class.out]="(row.qty ?? 0) < 0">{{ qty(row) }}</td>
                  <td>{{ row.event.locationCode ?? '' }}</td>
                </tr>
              }
            </tbody>
          }
        </table>
      </div>
    }
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
      padding: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th,
    td {
      padding: 8px 10px;
      border-bottom: 1px solid var(--pan-row-divider);
      text-align: left;
      white-space: nowrap;
    }

    thead th {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }

    .day th {
      background: var(--pan-trace-lane-alt);
      font-weight: 600;
    }

    tr.focusable {
      cursor: pointer;
    }

    tr.focusable:hover {
      background: var(--pan-row-hover-bg);
    }

    tr.focusable:focus-visible {
      outline: 3px solid var(--pan-trace-selected);
      outline-offset: -3px;
    }

    .num {
      font-variant-numeric: tabular-nums;
    }

    .end {
      text-align: right;
    }

    .dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--pan-trace-edge);
    }

    .dot.production {
      background: var(--pan-trace-lot);
    }

    .dot.shipping {
      background: var(--mat-sys-on-surface-variant);
    }

    .dot.difference {
      background: var(--pan-trace-warn);
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TraceLog {
  readonly graph = input.required<TraceGraph>();
  readonly opened = output<string>();
  protected readonly stages = STAGE_LABELS;
  protected readonly days = computed(() => eventDays(this.graph(), layoutTrace(this.graph())));

  protected link(row: EventRow): string[] | null {
    return row.event.docId && row.event.docId !== EMPTY_ID
      ? documentLink(row.event.docType, row.event.docId)
      : null;
  }

  protected join(...values: (string | null)[]): string {
    return values.filter(Boolean).join(' · ');
  }

  protected qty(row: EventRow): string {
    return signedQty(row);
  }

  protected go(row: EventRow): void {
    if (row.cardId) this.opened.emit(row.cardId);
  }
}
