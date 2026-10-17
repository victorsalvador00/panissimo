import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { toProblem } from '../../../core/http/problem-details';
import { ThemeMenu } from '../../../core/theme/theme-menu';
import { controlError } from '../../../shared/forms/control-error';
import { PlexusBackground } from '../ui/plexus-background';

/** Login (frontend §4.1, §5): shows the backend message on invalid credentials, lockout or too many attempts. */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    ThemeMenu,
    PlexusBackground,
  ],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query param `returnUrl`: where the user was going before the login. */
  readonly returnUrl = input<string>();

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly controlError = controlError;

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.login(email.trim(), password);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } catch (error) {
      this.error.set(toProblem(error).detail ?? 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      this.submitting.set(false);
    }
  }
}

/** Only paths of this app: never another site (`//host`) nor the login itself. */
export function safeReturnUrl(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/login')
    ? url
    : '/';
}
