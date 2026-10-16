import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

function decimals(value: number): number {
  return (String(value).split('.')[1] ?? '').length;
}

/**
 * Factor de compra (ItemRules del backend): con unidad de compra es obligatorio, > 0 y hasta 4
 * decimales. Va en el control `purchaseToBaseFactor` y lee `purchaseUomId` del mismo grupo; la
 * página revalida el factor cuando cambia la unidad de compra.
 */
export const purchaseFactorValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const hasPurchaseUom = !!control.parent?.get('purchaseUomId')?.value;
  const factor = control.value as number | null;
  if (factor === null || factor === undefined) {
    return hasPurchaseUom ? { factorRequired: true } : null;
  }
  if (!(factor > 0)) {
    return { factorPositive: true };
  }
  return decimals(factor) > 4 ? { factorDecimals: true } : null;
};

/**
 * Mín/máx de una ubicación (validador del backend): ambos o ninguno, ≥ 0, máximo ≥ mínimo y
 * hasta 4 decimales. Error en el grupo de la fila.
 */
export const minMaxValidator: ValidatorFn = (row: AbstractControl): ValidationErrors | null => {
  const min = row.get('minQty')?.value as number | null;
  const max = row.get('maxQty')?.value as number | null;
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;

  if (hasMin !== hasMax) {
    return { minMaxPair: true };
  }
  if (!hasMin || !hasMax) {
    return null;
  }
  if (min < 0 || max < 0) {
    return { minMaxNegative: true };
  }
  if (decimals(min) > 4 || decimals(max) > 4) {
    return { minMaxDecimals: true };
  }
  return max < min ? { minMaxOrder: true } : null;
};

export function minMaxMessage(errors: ValidationErrors | null): string {
  if (!errors) {
    return '';
  }
  if (errors['minMaxPair']) {
    return 'Captura mínimo y máximo, o deja ambos vacíos.';
  }
  if (errors['minMaxNegative']) {
    return 'No pueden ser negativos.';
  }
  if (errors['minMaxDecimals']) {
    return 'Máximo 4 decimales.';
  }
  if (errors['minMaxOrder']) {
    return 'El máximo debe ser mayor o igual que el mínimo.';
  }
  return typeof errors['server'] === 'string' ? errors['server'] : '';
}
