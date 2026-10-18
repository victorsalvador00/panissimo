import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** A list with at least one element; the error carries its own message (`controlError` shows it). */
export function requiredList(message: string): ValidatorFn {
  return (control: AbstractControl<readonly unknown[] | null>): ValidationErrors | null =>
    control.value && control.value.length > 0 ? null : { message };
}
