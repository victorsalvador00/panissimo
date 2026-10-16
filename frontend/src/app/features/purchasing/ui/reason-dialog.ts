import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ReasonDialogData {
  title: string;
  message?: string;
  confirmLabel: string;
}

/** Pide el motivo de un rechazo (requisición u OC). Cierra con el motivo o sin valor al cancelar. */
@Component({
  selector: 'app-reason-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="confirm()" novalidate>
      <mat-dialog-content>
        @if (data.message) {
          <p class="message">{{ data.message }}</p>
        }
        <mat-form-field appearance="outline" class="reason">
          <mat-label>Motivo</mat-label>
          <textarea matInput rows="3" formControlName="reason" required cdkFocusInitial></textarea>
          <mat-hint align="end">{{ reason.value.length }} / 500</mat-hint>
          @if (reason.hasError('maxlength')) {
            <mat-error>Máximo 500 caracteres.</mat-error>
          } @else {
            <mat-error>Escribe el motivo.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Volver</button>
        <button mat-flat-button type="submit" class="warn">{{ data.confirmLabel }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .message {
      margin-top: 0;
    }
    .reason {
      width: 100%;
    }
    button.warn {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ReasonDialog {
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ReasonDialog, string>);

  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });
  protected readonly form = new FormGroup({ reason: this.reason });

  protected confirm(): void {
    const reason = this.reason.value.trim();
    if (!reason || this.reason.invalid) {
      this.reason.setValue(reason);
      this.reason.markAsTouched();
      return;
    }
    this.dialogRef.close(reason);
  }
}
