import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EnumName, enumLabel, statusTone } from '../../pipes/labels';

/** Status label with the color of the status (frontend §4.2); the greens carry a check drawn with CSS. */
@Component({
  selector: 'app-status-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tag" [class]="'tag tone-' + tone()">
      @if (tone() === 'green') {
        <span class="check" aria-hidden="true"></span>
      }
      {{ label() }}
    </span>
  `,
  styles: `
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font: var(--mat-sys-label-medium);
      font-weight: 600;
      white-space: nowrap;
    }

    .check {
      width: 4px;
      height: 8px;
      margin: -2px 1px 0 2px;
      border: solid currentColor;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    @each $tone in 'grey', 'blue', 'yellow', 'green', 'orange', 'red' {
      .tone-#{$tone} {
        background: var(--pan-status-#{$tone}-bg);
        color: var(--pan-status-#{$tone}-fg);
      }
    }
  `,
})
export class StatusTag {
  /** The status value as the API sends it (`Dispatched`). */
  readonly value = input.required<string | null | undefined>();
  /** The API enum of the value, for its label (`TransferStatus`). */
  readonly kind = input.required<EnumName>();

  protected readonly label = computed(() => enumLabel(this.kind(), this.value() as never));
  protected readonly tone = computed(() => statusTone(this.value()));
}
