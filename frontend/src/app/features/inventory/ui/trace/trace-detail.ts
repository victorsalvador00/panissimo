import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { StatusTag } from '../../../../shared/components/status-tag/status-tag';
import {
  DIRECTION_SEGMENTS,
  SOURCE_SEGMENTS,
  TraceDirection,
} from '../../data-access/traceability-api';
import type { DetailModel, DetailSection, DetailStat } from './trace-detail-model';

/** Statistics of the ficha: a 2 × 2 grid (trazabilidad-ui §6.2). */
@Component({
  selector: 'app-trace-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="stats">
      @for (s of stats(); track s.label) {
        <div [class]="'stat ' + (s.tone ?? '')">
          <dt>{{ s.label }}</dt>
          <dd>{{ s.value }}</dd>
        </div>
      }
    </dl>
  `,
  styles: `
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 0;
    }

    .stat {
      display: flex;
      flex-direction: column-reverse;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--pan-soft-bg);
    }

    dt {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .warn dd {
      color: var(--pan-status-orange-fg);
    }

    .ok dd {
      color: var(--pan-status-green-fg);
    }
  `,
})
export class TraceStats {
  readonly stats = input.required<DetailStat[]>();
}

/** A bar with two captions (lot use, order progress). */
@Component({
  selector: 'app-trace-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="round(section().percent)"
      [attr.aria-label]="section().title"
    >
      <span [style.width.%]="section().percent"></span>
    </div>
    <p class="captions">
      <span>{{ section().label }}</span
      ><span>{{ section().rest }}</span>
    </p>
  `,
  styles: `
    .bar {
      height: 8px;
      overflow: hidden;
      border-radius: 4px;
      background: var(--pan-soft-bg);
    }

    .bar span {
      display: block;
      height: 100%;
      background: var(--pan-trace-lot);
    }

    .captions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px 12px;
      margin: 6px 0 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TraceMeter {
  readonly section = input.required<Extract<DetailSection, { kind: 'meter' }>>();
  protected round(value: number): number {
    return Math.round(value);
  }
}

/** Stacked bar with its list ("Dónde está hoy"). */
@Component({
  selector: 'app-trace-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" aria-hidden="true">
      @for (p of section().parts; track p.label) {
        <span [class.warn]="p.warn" [style.width.%]="p.share"></span>
      }
    </div>
    <ul>
      @for (p of section().parts; track p.label) {
        <li [class.warn]="p.warn">
          <span class="dot" aria-hidden="true"></span><span>{{ p.label }}</span
          ><span class="qty">{{ p.text }}</span>
        </li>
      } @empty {
        <li>Sin existencia en ninguna ubicación.</li>
      }
    </ul>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 2px;
      height: 10px;
      overflow: hidden;
      border-radius: 5px;
      background: var(--pan-soft-bg);
    }

    .bar span {
      background: var(--pan-trace-lot);
    }

    .bar span.warn,
    li.warn .dot {
      background: var(--pan-trace-warn);
    }

    ul {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font-size: 13px;
    }

    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--pan-trace-lot);
    }

    .qty {
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class TraceStack {
  readonly section = input.required<Extract<DetailSection, { kind: 'stack' }>>();
}

/**
 * The ficha of a map element (trazabilidad-ui §6): header, 2 × 2 statistics, the sections of its type and the footer
 * (highlight direction, open the document, trace from here). The container (overlay or bottom sheet) is the map's.
 */
@Component({
  selector: 'app-trace-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    A11yModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    StatusTag,
    TraceStats,
    TraceMeter,
    TraceStack,
  ],
  host: {
    role: 'dialog',
    '[attr.aria-labelledby]': 'titleId',
    '[attr.aria-modal]': 'modal() || null',
  },
  template: `
    <header>
      <span class="icon" aria-hidden="true"
        ><mat-icon>{{ model().icon }}</mat-icon></span
      >
      <div class="names">
        <span class="type">{{ model().type }}</span>
        <h2 #title [id]="titleId" tabindex="-1">{{ model().title }}</h2>
        @if (model().subtitle) {
          <span class="subtitle">{{ model().subtitle }}</span>
        }
      </div>
      @if (model().status; as status) {
        <app-status-tag [value]="status.value" [kind]="status.kind" />
      }
      <button matIconButton type="button" aria-label="Cerrar detalle" (click)="closed.emit()">
        <mat-icon>close</mat-icon>
      </button>
    </header>
    <div class="body" tabindex="0" role="region" [attr.aria-label]="'Detalle de ' + model().title">
      @if (model().stats.length > 0) {
        <app-trace-stats [stats]="model().stats" />
      }
      @for (section of model().sections; track $index) {
        <section>
          @if (section.title) {
            <h3>{{ section.title }}</h3>
          }
          @switch (section.kind) {
            @case ('meter') {
              <app-trace-meter [section]="$any(section)" />
            }
            @case ('stack') {
              <app-trace-stack [section]="$any(section)" />
            }
            @case ('facts') {
              <dl class="facts">
                @for (item of $any(section).items; track $index) {
                  <dt>{{ item.label }}</dt>
                  <dd>{{ item.value }}</dd>
                }
              </dl>
            }
            @case ('steps') {
              <ol class="steps">
                @for (step of $any(section).steps; track $index) {
                  <li>
                    <span>{{ step.label }}</span
                    ><span class="at">{{ step.at }}</span>
                  </li>
                }
              </ol>
            }
            @case ('note') {
              <p class="note" [class.warn]="$any(section).tone === 'warn'">
                {{ $any(section).text }}
              </p>
            }
            @case ('table') {
              @if ($any(section).rows.length === 0) {
                <p class="muted">Sin registros.</p>
              } @else {
                <div class="table-wrap">
                  <table [attr.aria-label]="section.title">
                    <thead>
                      <tr>
                        @for (c of $any(section).columns; track c.key) {
                          <th scope="col" [class.end]="c.end">{{ c.label }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of $any(section).rows; track $index) {
                        <tr>
                          @for (c of $any(section).columns; track c.key) {
                            <td [class.end]="c.end">{{ row[c.key] }}</td>
                          }
                        </tr>
                      }
                    </tbody>
                    @if ($any(section).total; as total) {
                      <tfoot>
                        <tr>
                          @for (c of $any(section).columns; track c.key) {
                            <td [class.end]="c.end">{{ total[c.key] }}</td>
                          }
                        </tr>
                      </tfoot>
                    }
                  </table>
                </div>
              }
            }
          }
        </section>
      }
    </div>
    <footer>
      <span class="label" id="trace-detail-highlight">Resaltar</span>
      <mat-button-toggle-group
        aria-labelledby="trace-detail-highlight"
        hideSingleSelectionIndicator
        [value]="direction()"
        (change)="directionChange.emit($event.value)"
      >
        <mat-button-toggle value="Backward">Origen</mat-button-toggle>
        <mat-button-toggle value="Both">Cadena</mat-button-toggle>
        <mat-button-toggle value="Forward">Destino</mat-button-toggle>
      </mat-button-toggle-group>
      <div class="links">
        @if (model().link; as link) {
          <a matButton [routerLink]="link">Abrir documento</a>
        }
        @if (model().traceFrom; as from) {
          <a
            matButton="tonal"
            [routerLink]="['/inventario/trazabilidad', segments[from.type], from.id]"
            [queryParams]="{ direccion: directions[direction()] }"
            >Rastrear desde aquí</a
          >
        }
      </div>
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 400px;
      max-width: 100%;
      max-height: min(640px, calc(100vh - 32px));
      border: 1px solid var(--pan-row-divider);
      border-radius: 12px;
      background: var(--pan-card-bg);
      color: var(--mat-sys-on-surface);
      box-shadow: var(--mat-sys-level3);
      animation: appear 160ms ease-out;
    }

    :host-context(.trace-sheet) {
      width: 100%;
      max-height: none;
      border: 0;
      box-shadow: none;
      animation: none;
    }

    @keyframes appear {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        animation: none;
      }
    }

    header {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 8px 10px 16px;
    }

    .icon {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: var(--pan-trace-lot-tint);
    }

    .names {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }

    .type,
    .subtitle {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    h2:focus {
      outline: none;
    }

    .body {
      flex: 1;
      overflow: auto;
      padding: 0 16px 12px;
    }

    .body:focus-visible {
      outline: 2px solid var(--pan-trace-selected);
      outline-offset: -2px;
    }

    section {
      margin-top: 14px;
    }

    h3 {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    .facts {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      margin: 0;
      font-size: 13px;
    }

    .facts dt {
      color: var(--mat-sys-on-surface-variant);
    }

    .facts dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .steps {
      margin: 0;
      padding-left: 18px;
      font-size: 13px;
    }

    .steps li {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .at,
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
    }

    .note {
      margin: 0;
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--pan-soft-bg);
      font-size: 13px;
    }

    .note.warn {
      background: var(--pan-status-orange-bg);
      color: var(--pan-status-orange-fg);
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    th,
    td {
      padding: 4px 6px;
      border-bottom: 1px solid var(--pan-row-divider);
      text-align: left;
      white-space: nowrap;
    }

    th {
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
    }

    tfoot td {
      font-weight: 600;
    }

    .end {
      text-align: right;
    }

    footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding: 10px 16px 14px;
      border-top: 1px solid var(--pan-row-divider);
    }

    .label {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      width: 100%;
    }
  `,
})
export class TraceDetail {
  private static next = 0;
  readonly model = input.required<DetailModel>();
  readonly direction = input.required<TraceDirection>();
  readonly modal = input(false);
  readonly closed = output<void>();
  readonly directionChange = output<TraceDirection>();
  protected readonly titleId = `trace-detail-title-${TraceDetail.next++}`;
  protected readonly segments = SOURCE_SEGMENTS;
  protected readonly directions = DIRECTION_SEGMENTS;
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  protected readonly host = inject(ElementRef);

  constructor() {
    // §5.4: the focus goes to the title when the ficha opens.
    afterNextRender(() => this.title().nativeElement.focus());
  }
}
