import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/**
 * `*hasPermission="'catalog.manage'"` or a list (any one is enough): renders the element only with the permission.
 * It only hides; the backend is the one that protects (frontend §5).
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector -- name set by frontend §5
  selector: '[hasPermission]',
})
export class HasPermission {
  private readonly auth = inject(AuthService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);

  readonly hasPermission = input.required<string | readonly string[]>();

  constructor() {
    let shown = false;
    effect(() => {
      const allowed = this.auth.can(this.hasPermission());
      if (allowed && !shown) this.container.createEmbeddedView(this.template);
      else if (!allowed && shown) this.container.clear();
      shown = allowed;
    });
  }
}
