import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** Pantalla provisional de las secciones que aún no se implementan. */
@Component({
  selector: 'app-coming-soon-page',
  imports: [MatIconModule, MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-empty-state">
      <mat-icon aria-hidden="true">construction</mat-icon>
      <h1>{{ title }}</h1>
      <p>Esta sección estará disponible pronto.</p>
      <a mat-stroked-button routerLink="/">Ir al tablero</a>
    </section>
  `,
})
export class ComingSoonPage {
  protected readonly title = inject(ActivatedRoute).snapshot.title ?? 'Sección';
}
