import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable, firstValueFrom } from 'rxjs';
import { controlError } from '../../forms/control-error';
import { FormErrors } from '../../forms/form-errors';

export interface RecordField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'toggle' | 'textarea';
  required?: boolean;
  maxLength?: number;
  /** Whole number at least this (sort order, days). */
  min?: number;
  options?: readonly { value: unknown; label: string }[];
  hint?: string;
  /** Codes are stored in upper case. */
  uppercase?: boolean;
  /** Shown but not editable (a code once created). */
  readonly?: boolean;
  /** The field applies only for some values of the others (the parent of a sub-warehouse). */
  visibleWhen?: (value: Record<string, unknown>) => boolean;
}

export interface RecordDialogData<T> {
  title: string;
  fields: readonly RecordField[];
  value: Record<string, unknown>;
  /** Saves; a 400 puts its errors on the fields (same keys as the request) and the dialog stays open. */
  save: (value: Record<string, unknown>) => Observable<T>;
  saveLabel?: string;
}

/**
 * Dialog of a small catalog record (location, category, unit, area), built from its fields (frontend §7.2). Resolves
 * with the saved record, or undefined when cancelled.
 */
@Component({
  selector: 'app-record-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        @for (field of data.fields; track field.key) {
          @if (isVisible(field)) {
            @switch (field.type) {
              @case ('toggle') {
                <mat-slide-toggle [formControlName]="field.key">{{ field.label }}</mat-slide-toggle>
              }
              @case ('select') {
                <mat-form-field>
                  <mat-label>{{ field.label }}</mat-label>
                  <mat-select [formControlName]="field.key">
                    @for (option of field.options ?? []; track $index) {
                      <mat-option [value]="option.value">{{ option.label }}</mat-option>
                    }
                  </mat-select>
                  @if (field.hint) {
                    <mat-hint>{{ field.hint }}</mat-hint>
                  }
                  <mat-error>{{ error(field.key) }}</mat-error>
                </mat-form-field>
              }
              @case ('textarea') {
                <mat-form-field>
                  <mat-label>{{ field.label }}</mat-label>
                  <textarea matInput rows="3" [formControlName]="field.key"></textarea>
                  <mat-error>{{ error(field.key) }}</mat-error>
                </mat-form-field>
              }
              @default {
                <mat-form-field>
                  <mat-label>{{ field.label }}</mat-label>
                  <input
                    matInput
                    [type]="field.type === 'number' ? 'number' : 'text'"
                    [class.pan-uppercase]="field.uppercase"
                    [formControlName]="field.key"
                    autocomplete="off"
                  />
                  @if (field.hint) {
                    <mat-hint>{{ field.hint }}</mat-hint>
                  }
                  <mat-error>{{ error(field.key) }}</mat-error>
                </mat-form-field>
              }
            }
          }
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ data.saveLabel ?? 'Guardar' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 8px;
    }

    mat-slide-toggle {
      margin: 8px 0;
    }
  `,
})
export class RecordDialog<T> {
  protected readonly data = inject<RecordDialogData<T>>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<RecordDialog<T>, T>>(MatDialogRef);
  private readonly formErrors = inject(FormErrors);

  protected readonly saving = signal(false);
  protected readonly form = new FormGroup(
    Object.fromEntries(
      this.data.fields.map((field) => [
        field.key,
        new FormControl(
          { value: this.data.value[field.key] ?? defaultValue(field), disabled: !!field.readonly },
          validatorsFor(field),
        ),
      ]),
    ) as Record<string, AbstractControl>,
  );
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue() as Record<string, unknown>,
  });

  protected isVisible(field: RecordField): boolean {
    this.value();
    return !field.visibleWhen || field.visibleWhen(this.form.getRawValue());
  }

  protected error(key: string): string | null {
    this.value();
    return controlError(this.form.get(key));
  }

  protected async save(): Promise<void> {
    const visible = this.data.fields.filter((f) => this.isVisible(f));
    const invalid = visible.some((f) => this.form.get(f.key)?.invalid);
    if (invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const value: Record<string, unknown> = {};
    for (const field of this.data.fields) {
      let fieldValue = this.isVisible(field) ? raw[field.key] : null;
      if (typeof fieldValue === 'string') {
        fieldValue = fieldValue.trim();
        if (field.uppercase) fieldValue = (fieldValue as string).toUpperCase();
        if (fieldValue === '' && !field.required) fieldValue = null;
      }
      if (field.type === 'number' && fieldValue !== null && fieldValue !== '')
        fieldValue = Number(fieldValue);
      value[field.key] = fieldValue;
    }
    this.saving.set(true);
    try {
      this.ref.close(await firstValueFrom(this.data.save(value)));
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }
}

function defaultValue(field: RecordField): unknown {
  return field.type === 'toggle'
    ? false
    : field.type === 'text' || field.type === 'textarea'
      ? ''
      : null;
}

function validatorsFor(field: RecordField): ValidatorFn[] {
  const validators: ValidatorFn[] = [];
  if (field.required && field.type !== 'toggle') validators.push(Validators.required);
  if (field.maxLength) validators.push(Validators.maxLength(field.maxLength));
  if (field.min !== undefined) validators.push(Validators.min(field.min));
  return validators;
}

/** Opens the dialog and resolves with the saved record (undefined if cancelled). */
@Injectable({ providedIn: 'root' })
export class RecordDialogService {
  private readonly dialog = inject(MatDialog);

  async open<T>(data: RecordDialogData<T>): Promise<T | undefined> {
    const ref = this.dialog.open<RecordDialog<T>, RecordDialogData<T>, T>(RecordDialog, {
      data,
      width: '480px',
      maxWidth: '95vw',
    });
    return firstValueFrom(ref.afterClosed());
  }
}
