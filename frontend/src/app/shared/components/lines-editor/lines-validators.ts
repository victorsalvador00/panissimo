import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';

/** El documento necesita al menos `min` líneas. */
export function minLinesValidator(min = 1): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    (control as FormArray).length >= min ? null : { minLines: { min } };
}

/**
 * No se repite el mismo valor en `key` (ej. el mismo artículo dos veces). El campo puede ser un id o
 * un objeto con `id` (lo que guarda `app-item-picker`). Opcionalmente combina con otra llave (lote).
 */
export function uniqueLinesValidator(key: string, ...extraKeys: string[]): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const seen = new Set<string>();
    const duplicates: number[] = [];
    (control as FormArray).controls.forEach((line, index) => {
      const parts = [key, ...extraKeys].map((k) => idOf(line.get(k)?.value));
      if (parts[0] === null) {
        return;
      }
      const signature = parts.join('|');
      if (seen.has(signature)) {
        duplicates.push(index);
      }
      seen.add(signature);
    });
    return duplicates.length ? { duplicateLines: { indexes: duplicates } } : null;
  };
}

function idOf(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id);
  }
  return String(value);
}

export function linesErrorMessage(errors: ValidationErrors | null): string {
  if (!errors) {
    return '';
  }
  if (errors['minLines']) {
    const { min } = errors['minLines'] as { min: number };
    return min === 1 ? 'Agrega al menos una línea.' : `Agrega al menos ${min} líneas.`;
  }
  if (errors['duplicateLines']) {
    const { indexes } = errors['duplicateLines'] as { indexes: number[] };
    return `Hay líneas repetidas (línea ${indexes.map((i) => i + 1).join(', ')}).`;
  }
  return typeof errors['server'] === 'string' ? errors['server'] : 'Revisa las líneas.';
}
