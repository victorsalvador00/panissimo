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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom, startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { requiredList } from '../../../shared/forms/validators';
import { PermissionGroup, Role, RolesApi } from '../data-access/admin-api';

/**
 * /admin/roles/nuevo and /admin/roles/:id (frontend §7.8): name, description and the permission matrix by module.
 * The Administrator role always has every permission and is read-only.
 */
@Component({
  selector: 'app-role-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    PageHeader,
    AuditPanel,
  ],
  templateUrl: './role-form-page.html',
  styleUrls: ['./admin-form.scss', './role-form-page.scss'],
})
export class RoleFormPage {
  readonly id = input<string>();

  private readonly api = inject(RolesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly auth = inject(AuthService);

  protected readonly role = signal<Role | null>(null);
  protected readonly saving = signal(false);
  protected readonly locked = computed(() => this.role()?.isAdministrator ?? false);
  protected readonly canSeeAudit = computed(() => this.auth.can('security.audit.view'));
  protected readonly controlError = controlError;

  protected readonly groups = rxResource({
    stream: () => this.api.permissions(),
    defaultValue: [] as PermissionGroup[],
  });
  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    permissions: new FormControl<string[]>([], {
      nonNullable: true,
      validators: requiredList('Selecciona al menos un permiso.'),
    }),
  });

  private readonly granted = toSignal(
    this.form.controls.permissions.valueChanges.pipe(
      startWith(this.form.controls.permissions.value),
    ),
    { initialValue: [] as string[] },
  );
  protected readonly grantedSet = computed(() => new Set(this.granted()));

  constructor() {
    effect(() => {
      if (this.loaded.hasValue()) this.showRole(this.loaded.value());
    });
  }

  protected moduleState(group: PermissionGroup): 'all' | 'some' | 'none' {
    const count = group.permissions.filter((p) => this.grantedSet().has(p.code)).length;
    return count === 0 ? 'none' : count === group.permissions.length ? 'all' : 'some';
  }

  protected toggle(code: string, checked: boolean): void {
    const next = new Set(this.granted());
    if (checked) next.add(code);
    else next.delete(code);
    this.setPermissions(next);
  }

  protected toggleModule(group: PermissionGroup, checked: boolean): void {
    const next = new Set(this.granted());
    for (const permission of group.permissions) {
      if (checked) next.add(permission.code);
      else next.delete(permission.code);
    }
    this.setPermissions(next);
  }

  protected async save(): Promise<void> {
    if (this.locked()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const request = {
      name: value.name.trim(),
      description: value.description.trim(),
      permissions: value.permissions,
    };
    try {
      const role = this.role();
      if (role) {
        this.showRole(
          await firstValueFrom(this.api.update(role.id, { ...request, version: role.version })),
        );
        this.notifier.info('Cambios guardados. Aplican de inmediato a los usuarios del rol.');
      } else {
        const created = await firstValueFrom(this.api.create(request));
        this.notifier.info('Rol creado.');
        await this.router.navigate(['/admin/roles', created.id]);
      }
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private setPermissions(codes: Set<string>): void {
    const control = this.form.controls.permissions;
    control.setValue([...codes]);
    control.markAsTouched();
    control.markAsDirty();
  }

  private showRole(role: Role): void {
    this.role.set(role);
    this.breadcrumbs.setCurrent(role.name);
    this.form.reset({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
    if (role.isAdministrator) this.form.disable();
  }
}
