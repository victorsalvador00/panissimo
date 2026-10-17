import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';

/** /perfil: the user's data and the password change; saving it closes every session (frontend §7.1). */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './profile-page.html',
  styles: `
    .grid {
      display: grid;
      gap: 24px;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      align-items: start;
    }

    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 0;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    h2 {
      margin: 0 0 16px;
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);

  protected readonly user = this.auth.user;
  protected readonly saving = signal(false);
  protected readonly controlError = controlError;

  protected readonly form = new FormGroup({
    currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128)],
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, matchesNewPassword],
    }),
  });

  constructor() {
    // The confirmation is checked again when the new password changes.
    this.form.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    try {
      await this.auth.changePassword({ currentPassword, newPassword });
      this.notifier.info('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
      await this.router.navigate(['/login']);
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }
}

function matchesNewPassword(control: AbstractControl<string>): ValidationErrors | null {
  const newPassword = control.parent?.get('newPassword')?.value as string | undefined;
  return control.value && newPassword !== undefined && control.value !== newPassword
    ? { mismatch: true }
    : null;
}
