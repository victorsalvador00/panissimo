import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_POLICY_TEXT = 'Mínimo 10 caracteres, con mayúscula, minúscula y número.';

/** Política del backend (spec backend §7): 10+ caracteres, mayúscula, minúscula y número. */
export function meetsPasswordPolicy(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value)
  );
}

export const passwordPolicy: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '');
  return !value || meetsPasswordPolicy(value) ? null : { passwordPolicy: true };
};

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';

/** Contraseña aleatoria que cumple la política, para restablecer o crear usuarios. */
export function generatePassword(length = 12): string {
  const all = UPPER + LOWER + DIGITS;
  const pick = (chars: string) => chars[randomIndex(chars.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < Math.max(length, PASSWORD_MIN_LENGTH)) {
    chars.push(pick(all));
  }
  // Mezcla (Fisher–Yates) para que los tres obligatorios no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function randomIndex(max: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}
