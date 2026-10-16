import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { FormControl, FormGroupDirective, NgControl, NgForm } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

/** `MatInput` y `MatSelect` exponen esto; lo llamamos a mano porque su control interno no es de formulario. */
interface ErrorStateHolder {
  updateErrorState(): void;
}

/**
 * Para componentes de formulario propios (ControlValueAccessor) que envuelven un `mat-form-field`:
 * el estado de error sale del control del formulario padre. `MatInput`/`MatSelect` solo recalculan
 * su error si tienen su propio `NgControl`, así que `connect` lo recalcula cada vez que el control
 * del padre cambia (valor, tocado, `markAllAsTouched()` al enviar) y refresca la vista OnPush.
 */
export function outerControlErrorState(ngControl: NgControl | null): {
  matcher: ErrorStateMatcher;
  connect: (field: () => ErrorStateHolder | undefined) => void;
} {
  const cdr = inject(ChangeDetectorRef);
  const destroyRef = inject(DestroyRef);
  return {
    matcher: {
      isErrorState: (_: FormControl | null, form: FormGroupDirective | NgForm | null) => {
        const control = ngControl?.control;
        return !!control?.invalid && (control.touched || !!form?.submitted);
      },
    },
    connect: (field) => {
      const control = ngControl?.control;
      if (!control) {
        return;
      }
      const refresh = () => {
        field()?.updateErrorState();
        cdr.markForCheck();
      };
      const subscription = control.events.subscribe(refresh);
      destroyRef.onDestroy(() => subscription.unsubscribe());
      queueMicrotask(refresh);
    },
  };
}
