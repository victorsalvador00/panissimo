import { inject, Injectable } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Notifier } from '../../core/http/notifier.service';
import { toProblem } from '../../core/http/problem-details';
import { applyServerErrors } from '../../core/http/server-errors';
import { ConflictHandler, ConflictOptions } from '../components/dialogs.service';

/**
 * Manejo estándar del error al guardar un formulario (spec frontend §6): 409 → diálogo de
 * concurrencia o faltantes; 400 → errores en los controles y el resto en un aviso. 403/422/5xx ya
 * los avisa el interceptor.
 */
@Injectable({ providedIn: 'root' })
export class FormErrors {
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);

  handle(error: unknown, form: AbstractControl, options: ConflictOptions = {}): void {
    if (this.conflicts.handle(error, options)) {
      return;
    }
    const problem = toProblem(error);
    if (problem?.status === 400) {
      const unmapped = applyServerErrors(form, problem);
      if (unmapped.length) {
        this.notifier.error(unmapped.join(' '));
      }
    }
  }
}
