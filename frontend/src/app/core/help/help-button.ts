import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HelpService } from './help.service';

/**
 * Botón de ayuda flotante (esquina inferior derecha): anillos tipo HUD que giran mientras está cerrado y se
 * detienen al abrir el panel con el manual de la pantalla actual (descripción, pasos, campos y video en bucle).
 * Se cierra con la X, Esc, otro clic en el botón o al cambiar de pantalla. Estilos en styles/_help.scss.
 */
@Component({
  selector: 'app-help-button',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    @if (open()) {
      <section
        #panel
        id="sgo-help-panel"
        class="sgo-help-panel"
        role="dialog"
        aria-labelledby="sgo-help-title"
        tabindex="-1"
      >
        <header class="sgo-help-header">
          <h2 id="sgo-help-title">{{ help.topic().title }}</h2>
          <button mat-icon-button type="button" aria-label="Cerrar ayuda" (click)="close()">
            <mat-icon>close</mat-icon>
          </button>
        </header>
        <!-- Enfocable: el contenido tiene scroll y debe poder recorrerse con teclado. -->
        <div class="sgo-help-body" tabindex="0" role="region" aria-label="Contenido de la ayuda">
          <p class="sgo-help-summary">{{ help.topic().summary }}</p>

          @if (help.topic().video; as video) {
            @if (!videoFailed()) {
              <video
                class="sgo-help-video"
                [src]="'help/' + video"
                [autoplay]="!reducedMotion"
                loop
                muted
                playsinline
                controls
                [attr.aria-label]="'Demostración de ' + help.topic().title"
                (error)="videoFailed.set(true)"
              ></video>
            }
          }

          @if (help.topic().steps; as steps) {
            <h3>Cómo se usa</h3>
            <ol class="sgo-help-steps">
              @for (step of steps; track $index) {
                <li>{{ step }}</li>
              }
            </ol>
          }

          @if (help.topic().fields; as fields) {
            <h3>Campos</h3>
            <dl class="sgo-help-fields">
              @for (field of fields; track field.name) {
                <div>
                  <dt>{{ field.name }}</dt>
                  <dd>{{ field.help }}</dd>
                </div>
              }
            </dl>
          }

          @if (help.topic().tips; as tips) {
            <h3>Consejos</h3>
            <ul class="sgo-help-tips">
              @for (tip of tips; track $index) {
                <li>{{ tip }}</li>
              }
            </ul>
          }
        </div>
      </section>
    }

    <button
      #trigger
      type="button"
      class="sgo-help-fab"
      [class.sgo-help-fab-open]="open()"
      [attr.aria-expanded]="open()"
      aria-controls="sgo-help-panel"
      aria-label="Ayuda de esta pantalla"
      (click)="toggle()"
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <g class="ring ring-outer">
          <circle cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="22 6 9 4 30 8 13 8" />
        </g>
        <g class="ring ring-ticks">
          <circle cx="50" cy="50" r="37" pathLength="200" stroke-dasharray="1 2" />
        </g>
        <g class="ring ring-mid">
          <circle cx="50" cy="50" r="29" pathLength="100" stroke-dasharray="35 10 20 10 15 10" />
        </g>
        <g class="ring ring-inner">
          <circle cx="50" cy="50" r="19" pathLength="100" stroke-dasharray="8 4" />
        </g>
        <circle class="core" cx="50" cy="50" r="9" />
        <circle class="dot" cx="50" cy="50" r="3.5" />
      </svg>
    </button>
  `,
})
export class HelpButton {
  protected readonly help = inject(HelpService);
  protected readonly open = signal(false);
  protected readonly videoFailed = signal(false);
  /** Con "reducir movimiento" el video no arranca solo (tiene controles para reproducirlo). */
  protected readonly reducedMotion =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // Otra pantalla, otro manual: se cierra para no mostrar la ayuda equivocada.
    effect(() => {
      this.help.pattern();
      untracked(() => this.close());
    });
    // Al abrir, el foco pasa al panel para que el lector de pantalla lo anuncie.
    effect(() => this.panel()?.nativeElement.focus());
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.videoFailed.set(false);
      this.open.set(true);
    }
  }

  protected close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }
}
