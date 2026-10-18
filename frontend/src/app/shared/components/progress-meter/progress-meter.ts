import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { formatQty } from '../../pipes/pipes';

/**
 * Accessible progress bar (frontend §8, `progressbar`): done of total with the percentage. Orange when it goes over the
 * total (more produced than planned).
 */
@Component({
  selector: 'app-progress-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="meter"
      role="progressbar"
      aria-valuemin="0"
      [attr.aria-valuemax]="total()"
      [attr.aria-valuenow]="done()"
      [attr.aria-valuetext]="text()"
      [attr.aria-label]="label()"
      [class.over]="over()"
    >
      <div class="bar"><div class="fill" [style.width.%]="width()"></div></div>
      @if (!compact()) {
        <span class="text">{{ text() }}</span>
      } @else {
        <span class="text">{{ percent() }} %</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 96px;
    }

    .meter {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bar {
      flex: 1;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
    }

    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--mat-sys-primary);
    }

    .over .fill {
      background: var(--pan-status-orange-fg);
    }

    .text {
      font: var(--mat-sys-body-small);
      white-space: nowrap;
    }

    .over .text {
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }
  `,
})
export class ProgressMeter {
  readonly done = input.required<number>();
  readonly total = input.required<number>();
  readonly unit = input<string | null>(null);
  readonly label = input('Avance');
  /** Only the percentage (tables). */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly percent = computed(() => {
    const total = this.total();
    return total > 0 ? Math.round((this.done() / total) * 100) : 0;
  });
  protected readonly width = computed(() => Math.min(100, this.percent()));
  protected readonly over = computed(() => this.done() > this.total());
  protected readonly text = computed(
    () =>
      `${formatQty(this.done(), this.unit())} de ${formatQty(this.total(), this.unit())} (${this.percent()} %)`,
  );
}
