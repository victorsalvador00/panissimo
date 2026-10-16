import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cuándo y quién de un paso de un documento: `<app-stamp [at]="t.dispatchedAt" [by]="t.dispatchedByName" />`
 * → "06/10/2026 14:30 · Laura Méndez". Sin nombre (usuario borrado o paso automático) muestra solo la fecha.
 */
@Component({
  selector: 'app-stamp',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (at(); as date) {
      {{ date | date: 'dd/MM/yyyy HH:mm' }}
    } @else {
      —
    }
    @if (by(); as name) {
      <span class="by">· {{ name }}</span>
    }
  `,
  styles: `
    .by {
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
  `,
})
export class Stamp {
  readonly at = input<string | null | undefined>();
  readonly by = input<string | null | undefined>();
}
