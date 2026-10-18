import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Notifier } from '../../../core/http/notifier';
import { controlError } from '../../../shared/forms/control-error';
import { generatePassword, passwordPolicy } from '../../../shared/forms/password';

/** Temporary password for a user, generated or typed; the user changes it afterwards in /perfil. */
@Component({
  selector: 'app-reset-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Restablecer contraseña</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p>
          Contraseña temporal para <strong>{{ name }}</strong
          >. Al guardarla se desbloquea la cuenta y se cierran sus sesiones abiertas.
        </p>
        <mat-form-field class="field">
          <mat-label>Contraseña temporal</mat-label>
          <input
            matInput
            [type]="visible() ? 'text' : 'password'"
            [formControl]="password"
            autocomplete="new-password"
          />
          <button
            matIconButton
            matSuffix
            type="button"
            [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            (click)="visible.set(!visible())"
          >
            <mat-icon>{{ visible() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <mat-error>{{ error() }}</mat-error>
        </mat-form-field>
        <div class="tools">
          <button matButton="tonal" type="button" (click)="generate()">
            <mat-icon>autorenew</mat-icon>
            Generar otra
          </button>
          <button matButton type="button" (click)="copy()">
            <mat-icon>content_copy</mat-icon>
            Copiar
          </button>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit">Restablecer</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
    }

    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class ResetPasswordDialog {
  protected readonly name = inject<string>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ResetPasswordDialog, string>>(MatDialogRef);
  private readonly notifier = inject(Notifier);

  protected readonly visible = signal(true);
  protected readonly password = new FormControl(generatePassword(), {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(128), passwordPolicy],
  });
  /** The form directive handles the submit (a bare <form> would reload the page). */
  protected readonly form = new FormGroup({ password: this.password });

  protected error(): string | null {
    return controlError(this.password);
  }

  protected generate(): void {
    this.password.setValue(generatePassword());
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.password.value);
      this.notifier.info('Contraseña copiada.');
    } catch {
      this.notifier.error('No se pudo copiar; selecciónala y cópiala a mano.');
    }
  }

  protected save(): void {
    if (this.password.invalid) {
      this.password.markAsTouched();
      return;
    }
    this.ref.close(this.password.value);
  }
}
