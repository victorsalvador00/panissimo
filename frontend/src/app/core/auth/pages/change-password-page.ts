import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Notifier } from '../../http/notifier.service';
import { toProblem } from '../../http/problem-details';
import { applyServerErrors } from '../../http/server-errors';
import { passwordPolicy } from '../../../shared/forms/password';
import { AuthService } from '../auth.service';

const passwordsMatch: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword');
  if (!confirmation?.value || password === confirmation.value) {
    return null;
  }
  return { passwordMismatch: true };
};

@Component({
  selector: 'app-change-password-page',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password-page.html',
  styles: `
    .form-card {
      max-width: 480px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: var(--sgo-space-1);
    }
    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
    }
    .hint {
      margin: 0 0 var(--sgo-space-4);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly notifier = inject(Notifier);

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordPolicy]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );
  protected readonly submitting = signal(false);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth.changePassword({ currentPassword, newPassword }).subscribe({
      error: (error: unknown) => {
        this.submitting.set(false);
        const unmapped = applyServerErrors(this.form, toProblem(error));
        if (unmapped.length) {
          this.notifier.error(unmapped.join(' '));
        }
      },
    });
  }
}
