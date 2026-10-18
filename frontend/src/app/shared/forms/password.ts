import { AbstractControl, ValidationErrors } from '@angular/forms';

const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const lower = 'abcdefghijkmnopqrstuvwxyz';
const digits = '23456789';

/**
 * Temporary password that meets the backend policy (10+ characters, uppercase, lowercase and a digit), without the
 * characters that are easy to confuse when dictated (0/O, 1/l/I). Uses the browser's cryptographic random source.
 */
export function generatePassword(length = 14): string {
  const all = upper + lower + digits;
  const chars = [upper, lower, digits].map(pick);
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** The backend password policy, to show the error before saving. */
export function passwordPolicy(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value ?? '';
  if (!value) return null;
  return value.length >= 10 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
    ? null
    : { passwordPolicy: true };
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/** Uniform integer in [0, max) without modulo bias. */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % max;
}
