import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom, map, startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { generatePassword, passwordPolicy } from '../../../shared/forms/password';
import { requiredList } from '../../../shared/forms/validators';
import { enumLabel } from '../../../shared/pipes/labels';
import { LocationsLookupApi, RolesApi, User, UsersApi } from '../data-access/admin-api';
import { ResetPasswordDialog } from '../ui/reset-password-dialog';

/**
 * /admin/usuarios/nuevo and /admin/usuarios/:id (frontend §7.8): data, roles, locations and default location;
 * activate or deactivate, and reset the password with a generator. The backend only lets you grant the roles and
 * locations you have (RN-43).
 */
@Component({
  selector: 'app-user-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    PageHeader,
    StatusTag,
    Stamp,
    AuditPanel,
  ],
  templateUrl: './user-form-page.html',
  styleUrl: './admin-form.scss',
})
export class UserFormPage {
  /** Route parameter; absent on /nuevo. */
  readonly id = input<string>();

  private readonly api = inject(UsersApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly dialog = inject(MatDialog);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly auth = inject(AuthService);
  private readonly rolesApi = inject(RolesApi);
  private readonly locationsApi = inject(LocationsLookupApi);

  protected readonly isNew = computed(() => !this.id());
  protected readonly canSeeAudit = computed(() => this.auth.can('security.audit.view'));
  protected readonly user = signal<User | null>(null);
  protected readonly saving = signal(false);
  protected readonly passwordVisible = signal(false);
  protected readonly controlError = controlError;

  protected readonly roles = rxResource({
    stream: () => this.rolesApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });
  protected readonly locations = rxResource({
    stream: () => this.locationsApi.list(),
    defaultValue: [],
  });
  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(256)],
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(128), passwordPolicy],
    }),
    roleIds: new FormControl<string[]>([], {
      nonNullable: true,
      validators: requiredList('Asigna al menos un rol.'),
    }),
    locationIds: new FormControl<string[]>([], {
      nonNullable: true,
      validators: requiredList('Asigna al menos una ubicación.'),
    }),
    defaultLocationId: new FormControl<string | null>(null),
  });

  private readonly chosenLocationIds = toSignal(
    this.form.controls.locationIds.valueChanges.pipe(
      startWith(this.form.controls.locationIds.value),
    ),
    { initialValue: [] as string[] },
  );
  /** The default location is one of the chosen ones. */
  protected readonly defaultOptions = computed(() =>
    this.locations.value().filter((l) => this.chosenLocationIds().includes(l.id)),
  );

  constructor() {
    effect(() => {
      if (this.loaded.hasValue()) this.showUser(this.loaded.value());
    });
    effect(() => {
      const chosen = this.chosenLocationIds();
      const current = this.form.controls.defaultLocationId.value;
      if (current && !chosen.includes(current)) this.form.controls.defaultLocationId.setValue(null);
    });
  }

  protected locationLabel(location: { code: string; name: string; type: string }): string {
    return `${location.code} · ${location.name} (${enumLabel('LocationType', location.type as never)})`;
  }

  protected generatePassword(): void {
    this.form.controls.password.setValue(generatePassword());
    this.passwordVisible.set(true);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    try {
      const user = this.user();
      if (user) {
        const saved = await firstValueFrom(
          this.api.update(user.id, {
            version: user.version,
            fullName: value.fullName.trim(),
            roleIds: value.roleIds,
            locationIds: value.locationIds,
            defaultLocationId: value.defaultLocationId,
          }),
        );
        this.showUser(saved);
        this.notifier.info('Cambios guardados.');
      } else {
        const created = await firstValueFrom(
          this.api.create({
            email: value.email.trim(),
            fullName: value.fullName.trim(),
            password: value.password,
            roleIds: value.roleIds,
            locationIds: value.locationIds,
            defaultLocationId: value.defaultLocationId,
          }),
        );
        this.notifier.info('Usuario creado. Comparte la contraseña temporal de forma segura.');
        await this.router.navigate(['/admin/usuarios', created.id]);
      }
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggleActive(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const deactivate = user.isActive;
    const confirmed = await this.confirmService.confirm(
      deactivate
        ? {
            title: 'Desactivar usuario',
            message: `${user.fullName} ya no podrá iniciar sesión y se cerrarán sus sesiones abiertas.`,
            confirmLabel: 'Desactivar',
            destructive: true,
          }
        : {
            title: 'Activar usuario',
            message: `${user.fullName} podrá volver a iniciar sesión.`,
            confirmLabel: 'Activar',
          },
    );
    if (!confirmed) return;
    try {
      const saved = await firstValueFrom(
        deactivate
          ? this.api.deactivate(user.id, user.version)
          : this.api.activate(user.id, user.version),
      );
      this.showUser(saved);
      this.notifier.info(deactivate ? 'Usuario desactivado.' : 'Usuario activado.');
    } catch {
      // The error interceptor already showed it.
    }
  }

  protected async resetPassword(): Promise<void> {
    const user = this.user();
    if (!user) return;
    const password = await firstValueFrom(
      this.dialog
        .open<ResetPasswordDialog, string, string>(ResetPasswordDialog, {
          data: user.fullName,
          width: '480px',
          maxWidth: '95vw',
        })
        .afterClosed(),
    );
    if (!password) return;
    try {
      await firstValueFrom(this.api.resetPassword(user.id, password));
      this.notifier.info('Contraseña restablecida. Compártela con el usuario de forma segura.');
      this.loaded.reload();
    } catch {
      // The error interceptor already showed it.
    }
  }

  private showUser(user: User): void {
    this.user.set(user);
    this.breadcrumbs.setCurrent(user.fullName);
    this.form.reset({
      email: user.email,
      fullName: user.fullName,
      password: '',
      roleIds: user.roleIds,
      locationIds: user.locationIds,
      defaultLocationId: user.defaultLocationId,
    });
    // The email does not change and the password is reset apart.
    this.form.controls.email.disable();
    this.form.controls.password.disable();
  }
}
