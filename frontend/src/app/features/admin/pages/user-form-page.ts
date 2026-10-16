import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { filter, map, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService } from '../../../shared/components/dialogs.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import {
  generatePassword,
  PASSWORD_POLICY_TEXT,
  passwordPolicy,
} from '../../../shared/forms/password';
import { RolesApi } from '../data-access/roles.api';
import { UserDto, UsersApi } from '../data-access/users.api';
import { ResetPasswordDialog } from '../ui/reset-password-dialog';
import { defaultLocationAllowed, nextDefaultLocation } from '../ui/user-form-validators';
import { UserStatusTag } from '../ui/user-status-tag';

/** Alta y edición de usuarios (`/admin/usuarios/nuevo`, `/admin/usuarios/:id`). */
@Component({
  selector: 'app-user-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    PageHeader,
    AuditPanel,
    UserStatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-form-page.html',
  styles: `
    .form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-4);
    }
    .full {
      grid-column: 1 / -1;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--sgo-space-2);
      margin-top: var(--sgo-space-2);
    }
    .mono {
      font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    }
  `,
})
export class UserFormPage {
  private readonly api = inject(UsersApi);
  private readonly rolesApi = inject(RolesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  /** Parámetro de ruta `:id`; sin él es alta. */
  readonly id = input<string>();

  protected readonly isNew = computed(() => !this.id());
  protected readonly canAssignRoles = this.auth.can('security.roles.manage');
  protected readonly isSelf = computed(() => this.id() === this.auth.user()?.id);
  protected readonly locations = inject(LocationContextService).locations;
  protected readonly policy = PASSWORD_POLICY_TEXT;

  protected readonly user = signal<UserDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly auditRefresh = signal(0);
  protected readonly passwordVisible = signal(false);

  protected readonly roles = rxResource({
    stream: () =>
      this.canAssignRoles
        ? this.rolesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items))
        : of([]),
  });

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
      password: ['', [Validators.required, passwordPolicy]],
      roleIds: [[] as string[]],
      locationIds: [[] as string[]],
      defaultLocationId: [null as string | null],
    },
    { validators: defaultLocationAllowed },
  );

  protected readonly selectedLocations = signal<string[]>([]);
  protected readonly defaultOptions = computed(() =>
    this.locations().filter((location) => this.selectedLocations().includes(location.id)),
  );

  constructor() {
    if (!this.canAssignRoles) {
      this.form.controls.roleIds.disable();
    }

    this.form.controls.locationIds.valueChanges.pipe(takeUntilDestroyed()).subscribe((ids) => {
      this.selectedLocations.set(ids);
      const next = nextDefaultLocation(this.form.controls.defaultLocationId.value, ids);
      if (next !== this.form.controls.defaultLocationId.value) {
        this.form.controls.defaultLocationId.setValue(next);
      }
    });

    // Edición: cargar el usuario cuando llega el :id.
    effect(() => {
      const id = this.id();
      if (id) {
        this.form.controls.email.disable();
        this.form.controls.password.disable();
        this.load(id);
      }
    });
  }

  protected generatePassword(): void {
    this.form.controls.password.setValue(generatePassword());
    this.passwordVisible.set(true);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const user = this.user();

    const request$ = user
      ? this.api.update(user.id, {
          fullName: value.fullName.trim(),
          roleIds: value.roleIds,
          locationIds: value.locationIds,
          defaultLocationId: value.defaultLocationId,
          version: user.version,
        })
      : this.api.create({
          fullName: value.fullName.trim(),
          email: value.email.trim(),
          password: value.password,
          roleIds: value.roleIds,
          locationIds: value.locationIds,
          defaultLocationId: value.defaultLocationId,
        });

    request$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (user) {
          this.setUser(saved);
          this.notifier.success('Usuario guardado.');
        } else {
          this.notifier.success(`Usuario ${saved.fullName} creado.`);
          void this.router.navigate(['/admin/usuarios', saved.id]);
        }
      },
      error: (error: unknown) => this.onError(error),
    });
  }

  protected toggleActive(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    const activate = !user.isActive;
    this.confirmService
      .confirm({
        title: activate ? `¿Activar a ${user.fullName}?` : `¿Desactivar a ${user.fullName}?`,
        message: activate
          ? 'Podrá volver a iniciar sesión.'
          : 'No podrá iniciar sesión y se cerrarán todas sus sesiones abiertas.',
        confirmLabel: activate ? 'Activar' : 'Desactivar',
        tone: activate ? 'primary' : 'warn',
      })
      .pipe(
        filter(Boolean),
        switchMap(() =>
          activate
            ? this.api.activate(user.id, user.version)
            : this.api.deactivate(user.id, user.version),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.setUser(saved);
          this.notifier.success(activate ? 'Usuario activado.' : 'Usuario desactivado.');
        },
        error: (error: unknown) => this.onError(error),
      });
  }

  protected resetPassword(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.dialog
      .open<ResetPasswordDialog, { fullName: string }, string>(ResetPasswordDialog, {
        data: { fullName: user.fullName },
        width: '520px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(
        filter((password): password is string => !!password),
        switchMap((password) => this.api.resetPassword(user.id, password)),
        switchMap(() => this.api.get(user.id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.setUser(saved);
          this.notifier.success('Contraseña restablecida.');
        },
        error: (error: unknown) => this.onError(error),
      });
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (user) => this.setUser(user),
      error: () => void this.router.navigate(['/admin/usuarios']),
    });
  }

  private setUser(user: UserDto): void {
    this.user.set(user);
    this.form.reset({
      fullName: user.fullName,
      email: user.email,
      password: '',
      roleIds: user.roleIds,
      locationIds: user.locationIds,
      defaultLocationId: user.defaultLocationId,
    });
    this.selectedLocations.set(user.locationIds);
    this.auditRefresh.update((n) => n + 1);
  }

  private onError(error: unknown): void {
    this.saving.set(false);
    const user = this.user();
    this.formErrors.handle(error, this.form, { reload: () => user && this.load(user.id) });
  }
}
