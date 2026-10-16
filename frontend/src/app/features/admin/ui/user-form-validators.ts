import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** La ubicación default debe estar entre las ubicaciones permitidas del usuario. */
export const defaultLocationAllowed: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const defaultId = group.get('defaultLocationId')?.value as string | null;
  const allowed = (group.get('locationIds')?.value as string[] | null) ?? [];
  return !defaultId || allowed.includes(defaultId) ? null : { defaultNotAllowed: true };
};

/**
 * Ubicación default que conviene al cambiar las permitidas: se conserva si sigue permitida, se
 * propone la única si solo hay una y se limpia si ya no es válida.
 */
export function nextDefaultLocation(current: string | null, allowed: string[]): string | null {
  if (current && allowed.includes(current)) {
    return current;
  }
  return allowed.length === 1 ? allowed[0] : null;
}
