import { AbstractControl } from '@angular/forms';

/** The message of the first error of a touched control, in Spanish; null when there is nothing to show. */
export function controlError(control: AbstractControl | null): string | null {
  if (!control?.errors || !(control.touched || control.dirty)) return null;
  const errors = control.errors;
  if (typeof errors['server'] === 'string') return errors['server'];
  if (errors['required']) return 'Este campo es obligatorio.';
  if (errors['email']) return 'Escribe un correo válido.';
  if (errors['maxlength'])
    return `Máximo ${(errors['maxlength'] as { requiredLength: number }).requiredLength} caracteres.`;
  if (errors['minlength'])
    return `Mínimo ${(errors['minlength'] as { requiredLength: number }).requiredLength} caracteres.`;
  if (errors['mismatch']) return 'Las contraseñas no coinciden.';
  return 'Valor no válido.';
}
