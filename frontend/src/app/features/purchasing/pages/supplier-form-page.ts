import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { Supplier, SuppliersApi } from '../data-access/purchasing-api';
import { rfcValidator } from '../ui/rfc';
import { SupplierItems } from '../ui/supplier-items';

/**
 * /compras/proveedores/nuevo and /:id (frontend §7.6, RN-35): tab **Datos generales** (RFC in capitals with the SAT
 * format, business name, contact, payment terms, active; deactivating warns that it loses its preferences), tab
 * **Artículos** (its catalog) and **Historial**.
 */
@Component({
  selector: 'app-supplier-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    QtyInput,
    Stamp,
    StatusTag,
    AuditPanel,
    SupplierItems,
  ],
  template: `
    <app-page-header [title]="supplier()?.name ?? 'Nuevo proveedor'">
      @if (supplier(); as s) {
        <app-status-tag
          [text]="s.isActive ? 'Activo' : 'Inactivo'"
          [color]="s.isActive ? 'green' : 'grey'"
        />
      }
    </app-page-header>

    <mat-tab-group
      mat-stretch-tabs="false"
      animationDuration="0ms"
      [selectedIndex]="tab()"
      (selectedIndexChange)="tab.set($event)"
    >
      <mat-tab label="Datos generales">
        <form
          id="supplier-form"
          class="general pan-has-action-bar"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          <section class="pan-card" aria-labelledby="supplier-data">
            <h2 id="supplier-data">Datos generales</h2>
            <div class="fields">
              <mat-form-field>
                <mat-label>RFC</mat-label>
                <input matInput class="pan-uppercase" formControlName="taxId" autocomplete="off" />
                <mat-hint>12 caracteres (moral) o 13 (física).</mat-hint>
                <mat-error>{{ controlError(form.controls.taxId) }}</mat-error>
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Razón social</mat-label>
                <input matInput formControlName="name" />
                <mat-error>{{ controlError(form.controls.name) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Contacto</mat-label>
                <input matInput formControlName="contactName" />
                <mat-error>{{ controlError(form.controls.contactName) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Teléfono</mat-label>
                <input matInput type="tel" formControlName="phone" />
                <mat-error>{{ controlError(form.controls.phone) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Correo</mat-label>
                <input matInput type="email" formControlName="email" />
                <mat-error>{{ controlError(form.controls.email) }}</mat-error>
              </mat-form-field>
              <app-qty-input
                formControlName="paymentTermsDays"
                label="Días de crédito"
                unit="días"
                [decimals]="0"
                [max]="365"
                allowZero
              />
              @if (supplier()) {
                <mat-slide-toggle formControlName="isActive">Activo</mat-slide-toggle>
              }
            </div>
            <p class="muted hint">0 días de crédito = de contado.</p>
          </section>
          @if (supplier(); as s) {
            <p class="stamps">
              Creado <app-stamp [at]="s.createdAt" [by]="s.createdByName" />
              @if (s.updatedAt) {
                · Modificado <app-stamp [at]="s.updatedAt" [by]="s.updatedByName" />
              }
            </p>
          }
        </form>
      </mat-tab>

      @if (supplier(); as s) {
        <mat-tab label="Artículos">
          <div class="tab-card">
            <app-supplier-items
              [supplierId]="s.id"
              [supplierActive]="s.isActive"
              [canManage]="canManage"
            />
          </div>
        </mat-tab>
        @if (canSeeAudit) {
          <mat-tab label="Historial">
            <section class="pan-card tab-card">
              <ng-template matTabContent>
                <app-audit-panel [entityId]="s.id" />
              </ng-template>
            </section>
          </mat-tab>
        }
      }
    </mat-tab-group>

    @if (canManage && tab() === 0) {
      <div class="pan-action-bar">
        <a matButton routerLink="/compras/proveedores">Volver</a>
        <button matButton="filled" type="submit" form="supplier-form" [disabled]="saving()">
          {{ supplier() ? 'Guardar' : 'Crear proveedor' }}
        </button>
      </div>
    }
  `,
  styles: `
    .general {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 16px;
    }

    h2 {
      margin: 0 0 12px;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }

    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 8px 16px;
      align-items: center;

      .wide {
        grid-column: span 2;
      }
    }

    mat-form-field {
      width: 100%;
    }

    .muted,
    .stamps {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .hint {
      margin-top: 8px;
      font: var(--mat-sys-body-small);
    }

    .tab-card {
      margin-top: 16px;
    }

    @media (max-width: 599.98px) {
      .fields .wide {
        grid-column: auto;
      }
    }
  `,
})
export class SupplierFormPage {
  /** Present for an existing supplier (`/:id`). */
  readonly id = input<string>();

  private readonly api = inject(SuppliersApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly canManage = this.auth.can('purchasing.suppliers.manage');
  protected readonly canSeeAudit = this.auth.can('security.audit.view');
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);
  protected readonly tab = signal(0);
  protected readonly supplier = signal<Supplier | null>(null);

  protected readonly form = new FormGroup({
    taxId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, rfcValidator],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    contactName: new FormControl('', { nonNullable: true, validators: Validators.maxLength(150) }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.maxLength(30) }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(200)],
    }),
    paymentTermsDays: new FormControl<number | null>(0, Validators.required),
    isActive: new FormControl(true, { nonNullable: true }),
  });

  private readonly loaded = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    if (!this.canManage) this.form.disable();
    effect(() => {
      if (this.loaded.hasValue()) this.show(this.loaded.value());
    });
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const supplier = this.supplier();
    if (supplier?.isActive && !v.isActive) {
      const confirmed = await this.confirmService.confirm({
        title: 'Desactivar proveedor',
        message: `${supplier.name} deja de ser el proveedor preferido de sus artículos y su catálogo no se edita hasta reactivarlo.`,
        confirmLabel: 'Desactivar',
        destructive: true,
      });
      if (!confirmed) return;
    }
    const definition = {
      taxId: v.taxId.trim().toUpperCase(),
      name: v.name.trim(),
      contactName: v.contactName.trim() || null,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      paymentTermsDays: v.paymentTermsDays!,
    };

    this.saving.set(true);
    try {
      if (supplier) {
        const saved = await firstValueFrom(
          this.api.update(supplier.id, {
            ...definition,
            version: supplier.version,
            isActive: v.isActive,
          }),
        );
        this.show(saved);
        this.notifier.info('Cambios guardados.');
      } else {
        const created = await firstValueFrom(this.api.create(definition));
        this.notifier.info('Proveedor creado. Agrega los artículos que vende.');
        await this.router.navigate(['/compras/proveedores', created.id]);
      }
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private show(supplier: Supplier): void {
    this.supplier.set(supplier);
    this.breadcrumbs.setCurrent(supplier.name);
    this.form.reset({
      taxId: supplier.taxId,
      name: supplier.name,
      contactName: supplier.contactName ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      paymentTermsDays: supplier.paymentTermsDays,
      isActive: supplier.isActive,
    });
  }
}
