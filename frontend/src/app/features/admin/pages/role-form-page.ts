import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { RoleDto, RolesApi } from '../data-access/roles.api';
import { PermissionMatrix } from '../ui/permission-matrix';

/** Alta y edición de roles con la matriz de permisos (`/admin/roles/nuevo`, `/admin/roles/:id`). */
@Component({
  selector: 'app-role-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    PermissionMatrix,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        [title]="isNew() ? 'Nuevo rol' : (role()?.name ?? 'Rol')"
        [crumbs]="[
          { label: 'Administración' },
          { label: 'Roles', url: '/admin/roles' },
          { label: isNew() ? 'Nuevo' : (role()?.name ?? '…') },
        ]"
      >
        @if (role()?.isSystem) {
          <app-status-tag label="Predefinido" color="blue" />
        }
      </app-page-header>

      @if (role()?.isAdministrator) {
        <p class="notice notice-info" role="status">
          El rol Administrador siempre tiene todos los permisos; sus permisos no se pueden cambiar.
        </p>
      }

      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="sgo-stack">
        <mat-card appearance="outlined">
          <mat-card-content class="fields">
            <mat-form-field appearance="outline">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" autocomplete="off" required />
              @if (form.controls.name.hasError('required')) {
                <mat-error>Escribe el nombre del rol.</mat-error>
              } @else if (form.controls.name.getError('server'); as message) {
                <mat-error>{{ message }}</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Descripción</mat-label>
              <input matInput formControlName="description" autocomplete="off" />
              @if (form.controls.description.getError('server'); as message) {
                <mat-error>{{ message }}</mat-error>
              }
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>
              Permisos ({{ form.controls.permissions.value.length }} de {{ totalPermissions() }})
            </h2>
            <app-permission-matrix formControlName="permissions" [groups]="groups.value() ?? []" />
            @if (form.controls.permissions.getError('server'); as message) {
              <p class="sgo-field-error" role="alert">{{ message }}</p>
            }
          </mat-card-content>
        </mat-card>

        <div class="sgo-row">
          <button mat-flat-button type="submit" [disabled]="saving()">
            {{ isNew() ? 'Crear rol' : 'Guardar cambios' }}
          </button>
          <a mat-button routerLink="/admin/roles">Volver</a>
        </div>
      </form>

      @if (role(); as current) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <app-audit-panel [entityId]="current.id" [refresh]="auditRefresh()" />
          </mat-card-content>
        </mat-card>
      }
    </section>
  `,
  styles: `
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-4);
    }
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class RoleFormPage {
  private readonly api = inject(RolesApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly auth = inject(AuthService);

  readonly id = input<string>();

  protected readonly isNew = computed(() => !this.id());
  protected readonly role = signal<RoleDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly auditRefresh = signal(0);

  protected readonly groups = rxResource({ stream: () => this.api.permissions() });
  protected readonly totalPermissions = computed(() =>
    (this.groups.value() ?? []).reduce((sum, group) => sum + group.permissions.length, 0),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(300)],
    permissions: [[] as string[]],
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        this.load(id);
      }
    });
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { name, description, permissions } = this.form.getRawValue();
    const role = this.role();
    const request = { name: name.trim(), description: description.trim(), permissions };

    const request$ = role
      ? this.api.update(role.id, { ...request, version: role.version })
      : this.api.create(request);

    request$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (role) {
          this.setRole(saved);
          this.notifier.success('Rol guardado.');
          // Si tengo este rol, mis permisos pudieron cambiar: recargar /me actualiza el menú.
          this.auth.reloadUser();
        } else {
          this.notifier.success(`Rol ${saved.name} creado.`);
          void this.router.navigate(['/admin/roles', saved.id]);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => role && this.load(role.id) });
      },
    });
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (role) => this.setRole(role),
      error: () => void this.router.navigate(['/admin/roles']),
    });
  }

  private setRole(role: RoleDto): void {
    this.role.set(role);
    this.form.reset({
      name: role.name,
      description: role.description,
      permissions: role.permissions,
    });
    if (role.isAdministrator) {
      this.form.controls.permissions.disable();
    } else {
      this.form.controls.permissions.enable();
    }
    this.auditRefresh.update((n) => n + 1);
  }
}
