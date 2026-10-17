import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

/** /sin-acceso: where permissionGuard sends routes the user may not open. */
@Component({
  selector: 'app-no-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    <section class="pan-card message">
      <mat-icon aria-hidden="true">lock</mat-icon>
      <h1 class="pan-page-title">Sin acceso</h1>
      <p>No tienes permiso para ver esta página. Si lo necesitas, pídelo al administrador.</p>
      <a mat-flat-button routerLink="/">Ir al inicio</a>
    </section>
  `,
  styles: `
    .message {
      max-width: 520px;
      margin: 48px auto;
      text-align: center;
    }

    .message mat-icon {
      width: 48px;
      height: 48px;
      font-size: 48px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class NoAccessPage {}
