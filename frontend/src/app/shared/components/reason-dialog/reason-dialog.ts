import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
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
import { firstValueFrom } from 'rxjs';
import { controlError } from '../../forms/control-error';

export interface ReasonOptions {
  title: string;
  message?: string;
  label?: string;
  confirmLabel?: string;
}

const maxLength = 500;

/** Required reason (up to 500 characters) to reject, or to close with a balance (frontend §8). */
@Component({
  selector: 'app-reason-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form (ngSubmit)="save()">
      <mat-dialog-content>
        @if (data.message) {
          <p>{{ data.message }}</p>
        }
        <mat-form-field class="field">
          <mat-label>{{ data.label ?? 'Motivo' }}</mat-label>
          <textarea matInput [formControl]="reason" rows="4" [maxlength]="maxLength"></textarea>
          <mat-hint align="end">{{ reason.value.length }} / {{ maxLength }}</mat-hint>
          <mat-error>{{ error() }}</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit">{{ data.confirmLabel ?? 'Guardar' }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
    }
  `,
})
export class ReasonDialog {
  protected readonly data = inject<ReasonOptions>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ReasonDialog, string>>(MatDialogRef);
  protected readonly maxLength = maxLength;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(maxLength), notBlank],
  });

  protected error(): string | null {
    return controlError(this.reason);
  }

  protected save(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    this.ref.close(this.reason.value.trim());
  }
}

/** Only spaces counts as empty. */
function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value && !control.value.trim() ? { required: true } : null;
}

@Injectable({ providedIn: 'root' })
export class ReasonService {
  private readonly dialog = inject(MatDialog);

  /** The trimmed reason, or null when the user cancels. */
  async ask(options: ReasonOptions): Promise<string | null> {
    const ref = this.dialog.open<ReasonDialog, ReasonOptions, string>(ReasonDialog, {
      data: options,
      width: '520px',
      maxWidth: '95vw',
    });
    return (await firstValueFrom(ref.afterClosed())) ?? null;
  }
}
