import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Menu entries whose screen is not built yet (F-04 onward) land here. */
@Component({
  selector: 'app-coming-soon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <section class="pan-card soon">
      <mat-icon aria-hidden="true">construction</mat-icon>
      <p>Esta sección estará disponible pronto.</p>
    </section>
  `,
  styles: `
    .soon {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ComingSoonPage {}
