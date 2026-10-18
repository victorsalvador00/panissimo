import { AbstractControl } from '@angular/forms';
import { formatQty } from '../pipes/pipes';

/** The message of the first error of a touched control, in Spanish; null when there is nothing to show. */
export function controlError(control: AbstractControl | null): string | null {
  if (!control?.errors || !(control.touched || control.dirty)) return null;
  const errors = control.errors;
  if (typeof errors['server'] === 'string') return errors['server'];
  if (typeof errors['message'] === 'string') return errors['message'];
  if (errors['required']) return 'Este campo es obligatorio.';
  if (errors['email']) return 'Escribe un correo válido.';
  if (errors['maxlength'])
    return `Máximo ${(errors['maxlength'] as { requiredLength: number }).requiredLength} caracteres.`;
  if (errors['minlength'])
    return `Mínimo ${(errors['minlength'] as { requiredLength: number }).requiredLength} caracteres.`;
  if (errors['mismatch']) return 'Las contraseñas no coinciden.';
  if (errors['number']) return 'Escribe un número válido.';
  if (errors['positive']) return 'Debe ser mayor que 0.';
  if (errors['nonNegative']) return 'No puede ser negativo.';
  if (errors['maxQty'])
    return `No puede ser mayor que ${formatQty((errors['maxQty'] as { max: number }).max)}.`;
  if (errors['decimals']) {
    const digits = (errors['decimals'] as { digits: number }).digits;
    return digits === 0 ? 'Solo se aceptan cantidades enteras.' : `Máximo ${digits} decimales.`;
  }
  if (errors['notFromList']) return 'Elige una opción de la lista.';
  if (errors['passwordPolicy']) return 'Mínimo 10 caracteres, con mayúscula, minúscula y número.';
  if (errors['min'])
    return `No puede ser menor que ${formatQty((errors['min'] as { min: number }).min)}.`;
  if (errors['max'])
    return `No puede ser mayor que ${formatQty((errors['max'] as { max: number }).max)}.`;
  return 'Valor no válido.';
}
