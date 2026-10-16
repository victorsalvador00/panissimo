import { AbstractControl } from '@angular/forms';
import { ApiProblem } from './problem-details';

/**
 * Asigna los errores de un 400 (`errors: { "lines[2].quantity": ["..."] }`) a los controles del
 * formulario como `{ server: mensaje }`. Devuelve los mensajes que no se pudieron asignar a ningún
 * control, para mostrarlos aparte (toast o resumen).
 */
export function applyServerErrors(form: AbstractControl, problem: ApiProblem | null): string[] {
  const unmapped: string[] = [];
  if (!problem?.errors) {
    if (problem?.detail) {
      unmapped.push(problem.detail);
    }
    return unmapped;
  }

  for (const [key, messages] of Object.entries(problem.errors)) {
    const message = messages.join(' ');
    const control = findControl(form, key);
    if (control) {
      control.setErrors({ ...control.errors, server: message });
      control.markAsTouched();
    } else {
      unmapped.push(message);
    }
  }
  return unmapped;
}

/** `lines[2].quantity` → ['lines', 2, 'quantity']; tolera mayúscula inicial (`Lines[2].Quantity`). */
export function toControlPath(key: string): (string | number)[] {
  return key
    .replace(/^\$\.?/, '')
    .split(/\.|\[(\d+)\]/)
    .filter((part): part is string => !!part)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part[0].toLowerCase() + part.slice(1)));
}

function findControl(form: AbstractControl, key: string): AbstractControl | null {
  const path = toControlPath(key);
  return path.length ? form.get(path) : null;
}
