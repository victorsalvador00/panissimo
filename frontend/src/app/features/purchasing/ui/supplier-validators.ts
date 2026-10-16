import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Máximo de días de crédito y de entrega (SupplierFieldRules del backend). */
export const MAX_DAYS = 365;

const TAX_ID_PATTERN = /^[A-ZÑ&]{3,4}(\d{2})(\d{2})(\d{2})[A-Z0-9]{3}$/;

export function normalizeTaxId(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * RFC (TaxIdRules del backend): 3 letras (persona moral, 12 caracteres) o 4 (persona física, 13),
 * una fecha AAMMDD válida y 3 caracteres de homoclave. Los genéricos del SAT también pasan.
 */
export function isValidTaxId(value: string): boolean {
  const match = TAX_ID_PATTERN.exec(normalizeTaxId(value));
  if (!match) {
    return false;
  }
  const [yy, mm, dd] = match.slice(1, 4).map(Number);
  // El backend lee AA de 00 a 49 como 20xx: el único año 00 posible es 2000, que es bisiesto.
  const daysInMonth = [31, yy % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= daysInMonth[mm - 1];
}

export const taxIdValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value as string | null) ?? '';
  return !value.trim() || isValidTaxId(value) ? null : { taxId: true };
};

function decimals(value: number): number {
  return (String(value).split('.')[1] ?? '').length;
}

/** Precio por unidad de compra: obligatorio, ≥ 0 y hasta 4 decimales. */
export const priceValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as number | null;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { required: true };
  }
  if (value < 0) {
    return { min: true };
  }
  return decimals(value) > 4 ? { decimals: true } : null;
};

/** Días enteros de 0 a 365 (crédito o entrega). */
export const daysValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as number | null;
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { required: true };
  }
  return Number.isInteger(value) && value >= 0 && value <= MAX_DAYS ? null : { days: true };
};

/** Precio por unidad base, para comparar proveedores que venden en presentaciones distintas. */
export function pricePerBaseUnit(price: number, purchaseToBaseFactor: number): number {
  return purchaseToBaseFactor > 0 ? price / purchaseToBaseFactor : price;
}
