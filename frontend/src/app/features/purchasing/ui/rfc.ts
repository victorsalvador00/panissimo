import { AbstractControl, ValidationErrors } from '@angular/forms';

/** RN-35: generic RFCs (public in general and foreigners) may repeat. */
export const GENERIC_RFCS = ['XAXX010101000', 'XEXX010101000'];

const PATTERN = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{3})$/;

/**
 * RN-35: SAT format — 12 characters for a company (3 letters), 13 for a person (4), then a valid YYMMDD date and a
 * 3-character homoclave. Expects the RFC in capitals. Like the backend, YY reads as 20YY (any 19YY Feb 29 is valid
 * then too).
 */
export function isValidRfc(rfc: string): boolean {
  const match = PATTERN.exec(rfc);
  if (!match) return false;
  const [, , yy, mm, dd] = match;
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(2000 + Number(yy), month, 0).getDate();
  return day <= daysInMonth;
}

/** Validator of a text field with the RFC (it is compared in capitals, without spaces). */
export function rfcValidator(control: AbstractControl<string | null>): ValidationErrors | null {
  const value = (control.value ?? '').trim().toUpperCase();
  if (!value) return null;
  return isValidRfc(value)
    ? null
    : {
        message:
          'El RFC no es válido: 12 caracteres para persona moral o 13 para persona física, con fecha AAMMDD válida.',
      };
}
