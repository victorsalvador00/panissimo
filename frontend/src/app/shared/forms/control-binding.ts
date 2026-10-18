import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, ControlValueAccessor, NgControl } from '@angular/forms';
import { ErrorStateMatcher } from '@angular/material/core';

/**
 * Field components (qty-input, pickers) are the value accessor of the control that the parent puts on them
 * (`formControlName`), and show that control's error. Call from the constructor.
 */
export function bindParentControl(accessor: ControlValueAccessor): NgControl | null {
  const ngControl = inject(NgControl, { self: true, optional: true });
  if (ngControl) ngControl.valueAccessor = accessor;
  return ngControl;
}

/**
 * Repaints the field when the parent control changes from outside an event of the field (server errors of a 400,
 * `markAllAsTouched` on save). Call from ngOnInit, when the control already exists.
 */
export function repaintOnControlEvents(
  control: AbstractControl | null | undefined,
  changeDetector: ChangeDetectorRef,
  destroyRef: DestroyRef,
): void {
  control?.events
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe(() => changeDetector.markForCheck());
}

/** The inner Material input shows the error state of the parent control (invalid and touched). */
export function parentErrorMatcher(ngControl: NgControl | null): ErrorStateMatcher {
  return {
    isErrorState: () =>
      !!ngControl?.control && ngControl.control.invalid && ngControl.control.touched,
  };
}
