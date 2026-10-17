import { Injectable, inject } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Notifier } from '../../core/http/notifier';
import { toProblem } from '../../core/http/problem-details';

/**
 * Handles the 400 of a save (frontend §6): each `errors` entry goes to its control (lines included, `lines[2].quantity`)
 * as the `server` error; what matches no control goes to a notice. Other statuses were already notified by the
 * error interceptor.
 */
@Injectable({ providedIn: 'root' })
export class FormErrors {
  private readonly notifier = inject(Notifier);

  /** Returns whether the error was a 400 (and is now shown). */
  apply(form: AbstractControl, error: unknown): boolean {
    const problem = toProblem(error);
    if (problem.status !== 400) return false;

    const unmatched = applyServerErrors(form, problem.errors ?? {});
    if (unmatched.length > 0) this.notifier.error(unmatched.join(' '));
    else if (!problem.errors) this.notifier.error(problem.detail ?? 'Revisa los datos capturados.');
    return true;
  }
}

/** Sets the messages on the matching controls; returns the ones that match no control. */
export function applyServerErrors(
  form: AbstractControl,
  errors: Record<string, string[]>,
): string[] {
  const unmatched: string[] = [];
  for (const [key, messages] of Object.entries(errors)) {
    const control = key ? form.get(toControlPath(key)) : null;
    if (!control) {
      unmatched.push(...messages);
      continue;
    }
    control.setErrors({ ...control.errors, server: messages.join(' ') });
    control.markAsTouched();
  }
  return unmatched;
}

/** `lines[2].quantity` → `['lines', 2, 'quantity']` (camelCase, as the backend sends it). */
export function toControlPath(key: string): (string | number)[] {
  return key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((part) => part.length > 0)
    .map((part) =>
      /^\d+$/.test(part) ? Number(part) : part.charAt(0).toLowerCase() + part.slice(1),
    );
}
