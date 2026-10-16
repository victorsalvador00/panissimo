import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Muestra el contenido solo si el usuario tiene el permiso:
 * `<button *hasPermission="'purchasing.po.approve'">Aprobar</button>`.
 * Solo oculta: el backend es quien protege.
 */
// El nombre `*hasPermission` lo fija la spec (frontend §5), sin el prefijo `app`.
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: '[hasPermission]' })
export class HasPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private rendered = false;

  readonly hasPermission = input.required<string>();

  constructor() {
    effect(() => {
      const allowed = this.auth.can(this.hasPermission());
      if (allowed && !this.rendered) {
        this.container.createEmbeddedView(this.template);
        this.rendered = true;
      } else if (!allowed && this.rendered) {
        this.container.clear();
        this.rendered = false;
      }
    });
  }
}
