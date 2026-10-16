import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  generatePassword,
  PASSWORD_POLICY_TEXT,
  passwordPolicy,
} from '../../../shared/forms/password';

export interface ResetPasswordData {
  fullName: string;
}

/**
 * Pide la contraseña nueva de un usuario (con botón para generarla). Devuelve la contraseña al
 * confirmar; la página hace la llamada. El usuario deberá entrar con ella; no hay "cambio obligatorio".
 */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Restablecer contraseña</h2>
    <mat-dialog-content>
      <p>
        Se asignará una contraseña nueva a <strong>{{ data.fullName }}</strong
        >, se cerrarán sus sesiones y, si estaba bloqueada, la cuenta se desbloqueará. Comunícale la
        contraseña de forma segura.
      </p>
      <mat-form-field appearance="outline" class="field">
        <mat-label>Contraseña nueva</mat-label>
        <input
          matInput
          [type]="visible() ? 'text' : 'password'"
          [formControl]="password"
          autocomplete="new-password"
          class="mono"
        />
        <button
          mat-icon-button
          matSuffix
          type="button"
          (click)="visible.set(!visible())"
          [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        >
          <mat-icon>{{ visible() ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
        <mat-hint>{{ policy }}</mat-hint>
        @if (password.hasError('required')) {
          <mat-error>Escribe o genera una contraseña.</mat-error>
        } @else if (password.hasError('passwordPolicy')) {
          <mat-error>{{ policy }}</mat-error>
        }
      </mat-form-field>
      <div class="sgo-row">
        <button mat-stroked-button type="button" (click)="generate()">
          <mat-icon>casino</mat-icon>
          Generar
        </button>
        <button
          mat-button
          type="button"
          (click)="copy()"
          [disabled]="!password.value"
          matTooltip="Copiar al portapapeles"
        >
          <mat-icon>content_copy</mat-icon>
          {{ copied() ? 'Copiada' : 'Copiar' }}
        </button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" (click)="confirm()">Restablecer</button>
    </mat-dialog-actions>
  `,
  styles: `
    .field {
      width: 100%;
    }
    .mono {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    }
  `,
})
export class ResetPasswordDialog {
  protected readonly data = inject<ResetPasswordData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ResetPasswordDialog, string>);

  protected readonly policy = PASSWORD_POLICY_TEXT;
  protected readonly password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, passwordPolicy],
  });
  protected readonly visible = signal(false);
  protected readonly copied = signal(false);

  protected generate(): void {
    this.password.setValue(generatePassword());
    this.visible.set(true);
    this.copied.set(false);
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.password.value).then(() => this.copied.set(true));
  }

  protected confirm(): void {
    if (this.password.invalid) {
      this.password.markAsTouched();
      return;
    }
    this.dialogRef.close(this.password.value);
  }
}
