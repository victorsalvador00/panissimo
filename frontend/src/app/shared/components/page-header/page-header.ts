import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BreadcrumbsService, Crumb } from '../../../core/layout/breadcrumbs';

/**
 * Encabezado de página: migas de pan, título y botones de acción (contenido proyectado).
 * `<app-page-header title="Ajustes"><button mat-flat-button>Nuevo ajuste</button></app-page-header>`
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (resolvedCrumbs().length > 1) {
      <nav class="crumbs" aria-label="Ruta de navegación">
        <ol>
          @for (crumb of resolvedCrumbs(); track $index; let last = $last) {
            <li>
              @if (crumb.url) {
                <a [routerLink]="crumb.url">{{ crumb.label }}</a>
              } @else {
                <span [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
              }
              @if (!last) {
                <mat-icon aria-hidden="true">chevron_right</mat-icon>
              }
            </li>
          }
        </ol>
      </nav>
    }
    <div class="row">
      <div class="titles">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--sgo-space-4);
    }
    .crumbs ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      margin: 0 0 var(--sgo-space-1);
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .crumbs li {
      display: inline-flex;
      align-items: center;
    }
    .crumbs a {
      // Área táctil de al menos 24 px de alto (WCAG 2.5.8) sin cambiar el tamaño del texto.
      display: inline-block;
      padding-block: 4px;
      color: var(--mat-sys-primary);
    }
    .crumbs mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--sgo-space-3);
    }
    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
      font-weight: 600;
    }
    p {
      margin: var(--sgo-space-1) 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sgo-space-2);
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class PageHeader {
  private readonly breadcrumbs = inject(BreadcrumbsService);

  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Migas explícitas; por defecto se calculan de la ruta. */
  readonly crumbs = input<Crumb[]>();

  protected readonly resolvedCrumbs = computed(() => this.crumbs() ?? this.breadcrumbs.crumbs());
}
