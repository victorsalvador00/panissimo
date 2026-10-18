import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { TraceCard as Card } from './trace-layout';
import type { CardText } from './trace-text';

/**
 * A card of the traceability map (trazabilidad-ui §4.6): a 184 × 88 button with four rows that never wrap: header with
 * the type icon and an optional tag, title, main figure and a secondary line. Its accessible name is its visible text.
 */
@Component({
  selector: 'app-trace-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  host: {
    '[style.left.px]': 'card().x',
    '[style.top.px]': 'card().y',
    '[style.opacity]': 'opacity()',
    // Out of the highlighted chain (incidental content, WCAG 1.4.3): the E2E leaves it out of the contrast check.
    '[class.dimmed]': 'opacity() < 1',
  },
  template: `
    <button
      type="button"
      class="card"
      [class.lot]="card().kind === 'lot' || card().kind === 'rawLot' || !!card().lot"
      [class.warn]="
        text().tone === 'orange' && (card().kind === 'branch' || card().kind === 'transfer')
      "
      [class.selected]="selected()"
      [attr.aria-pressed]="selected()"
      [attr.data-card]="card().id"
    >
      <span class="head">
        <span class="icon" aria-hidden="true"
          ><mat-icon>{{ text().icon }}</mat-icon></span
        >
        <span class="type">{{ text().header }}</span>
        @if (text().tag) {
          <span class="tag" [class]="'tag tone-' + text().tone">{{ text().tag }}</span>
        }
      </span>
      <span class="title">{{ text().title }}</span>
      <span class="figure">{{ text().figure }}</span>
      <span class="secondary">{{ text().secondary }}</span>
    </button>
  `,
  styles: `
    :host {
      position: absolute;
      width: 184px;
      height: 88px;
      transition: opacity 180ms;
    }

    .card {
      display: grid;
      grid-template-rows: 20px 18px 20px 16px;
      gap: 2px;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      padding: 6px 10px;
      border: 1px solid var(--pan-row-divider);
      border-radius: 10px;
      background: var(--pan-card-bg);
      color: var(--mat-sys-on-surface);
      font: inherit;
      text-align: left;
      cursor: pointer;
      box-shadow: var(--pan-card-shadow);
      transition:
        border-color 180ms,
        box-shadow 180ms;
    }

    .card > span {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .card.lot {
      border-left: 4px solid var(--pan-trace-lot);
      padding-left: 7px;
    }

    .card.warn {
      border-color: var(--pan-trace-warn);
    }

    .card.selected {
      outline: 2px solid var(--pan-trace-selected);
      outline-offset: 1px;
    }

    .card:focus-visible {
      outline: 3px solid var(--pan-trace-selected);
      outline-offset: 2px;
      box-shadow: var(--pan-focus-glow);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      color: var(--mat-sys-on-surface-variant);
    }

    .icon {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 5px;
      background: var(--pan-soft-bg);
    }

    .icon mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }

    .type {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tag {
      flex: none;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 600;
    }

    .tone-green {
      background: var(--pan-status-green-bg);
      color: var(--pan-status-green-fg);
    }

    .tone-orange {
      background: var(--pan-status-orange-bg);
      color: var(--pan-status-orange-fg);
    }

    .tone-lot {
      background: var(--pan-trace-lot-tint);
      color: var(--mat-sys-on-surface);
    }

    .tone-grey {
      background: var(--pan-status-grey-bg);
      color: var(--pan-status-grey-fg);
    }

    .title {
      font-size: 13.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .figure {
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .secondary {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .card {
        transition: none;
      }
    }
  `,
})
export class TraceCardView {
  readonly card = input.required<Card>();
  readonly text = input.required<CardText>();
  readonly selected = input(false);
  readonly opacity = input(1);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The button, to focus it and anchor the ficha. */
  button(): HTMLButtonElement {
    return this.host.nativeElement.querySelector('button')!;
  }
}
