import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-no-access-page',
  imports: [MatIconModule, MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-empty-state">
      <mat-icon aria-hidden="true">lock</mat-icon>
      <h1>Sin acceso</h1>
      <p>
        No tienes permiso para ver esta sección. Si crees que es un error, pide acceso al
        administrador.
      </p>
      <a mat-flat-button routerLink="/">Ir al tablero</a>
    </section>
  `,
})
export class NoAccessPage {}
