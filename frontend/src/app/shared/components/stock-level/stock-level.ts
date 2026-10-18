import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatQty } from '../../pipes/pipes';

type Level = 'none' | 'empty' | 'low' | 'ok' | 'high';

/**
 * Stock against its min/max (frontend §8, RN-07): a bar with the range and a word, so the color is not the only cue.
 * Without min/max it says so.
 */
@Component({
  selector: 'app-stock-level',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (level() === 'none') {
      <span class="muted">Sin mín/máx</span>
    } @else {
      <span class="level" [class]="'level ' + level()" [attr.title]="range()">
        <span class="bar" aria-hidden="true"
          ><span class="fill" [style.width.%]="percent()"></span
        ></span>
        <span class="label">{{ label() }}</span>
        <span class="pan-sr-only">{{ range() }}</span>
      </span>
    }
  `,
  styles: `
    .level {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font: var(--mat-sys-label-medium);
      font-weight: 600;
    }

    .bar {
      position: relative;
      width: 56px;
      height: 6px;
      overflow: hidden;
      border-radius: 3px;
      background: var(--pan-soft-bg);
    }

    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: 3px;
      background: currentColor;
    }

    .empty,
    .low {
      color: var(--pan-status-red-fg);
    }

    .ok {
      color: var(--pan-status-green-fg);
    }

    .high {
      color: var(--pan-status-orange-fg);
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StockLevel {
  readonly onHand = input.required<number>();
  readonly min = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly unit = input<string | null>(null);

  protected readonly level = computed<Level>(() => {
    const [onHand, min, max] = [this.onHand(), this.min(), this.max()];
    if (min === null && max === null) return 'none';
    if (onHand <= 0) return 'empty';
    if (min !== null && onHand < min) return 'low';
    if (max !== null && onHand > max) return 'high';
    return 'ok';
  });
  protected readonly label = computed(
    () =>
      ({
        none: '',
        empty: 'Sin existencia',
        low: 'Bajo mínimo',
        ok: 'Normal',
        high: 'Sobre máximo',
      })[this.level()],
  );
  /** The bar fills up to the maximum (or twice the minimum when there is no maximum). */
  protected readonly percent = computed(() => {
    const top = this.max() ?? (this.min() ?? 0) * 2;
    return top > 0 ? Math.min(100, Math.max(0, (this.onHand() / top) * 100)) : 0;
  });
  protected readonly range = computed(
    () =>
      `Mínimo ${formatQty(this.min(), this.unit()) || '—'}, máximo ${formatQty(this.max(), this.unit()) || '—'}`,
  );
}
