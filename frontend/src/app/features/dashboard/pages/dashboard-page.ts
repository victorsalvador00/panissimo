import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Placeholder until the dashboard (F-21): every section not built yet says so. */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <h1 class="pan-page-title">Inicio</h1>
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
export class DashboardPage {}
