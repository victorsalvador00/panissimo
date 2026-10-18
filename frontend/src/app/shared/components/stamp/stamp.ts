import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** "17/10/2026 14:30 · Ana López" in document details (frontend §8). */
@Component({
  selector: 'app-stamp',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (at()) {
      <time [attr.datetime]="at()">{{ at() | date: 'dd/MM/yyyy HH:mm' }}</time>
    }
    @if (at() && by()) {
      ·
    }
    @if (by()) {
      <span>{{ by() }}</span>
    }
  `,
  styles: `
    :host {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class Stamp {
  readonly at = input<string | Date | null | undefined>();
  readonly by = input<string | null | undefined>();
}
