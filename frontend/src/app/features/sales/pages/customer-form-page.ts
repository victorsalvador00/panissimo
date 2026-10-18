import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { rfcValidator } from '../../../shared/forms/rfc';
import { Customer, CustomersApi } from '../data-access/sales-api';
import { CustomerItems } from '../ui/customer-items';
import { DeliveryPoints } from '../ui/delivery-points';

/** Customer code (Customer.CodePattern): letters, digits and dashes, starting with a letter or digit. */
const CODE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

/**
 * /ventas/clientes/nuevo and /:id (frontend §7.7): tabs **Datos generales** (code in capitals, editable while unique;
 * optional RFC with the supplier's rules), **Puntos de entrega**, **Artículos** and **Historial**.
 */
@Component({
  selector: 'app-customer-form-page',
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
    Stamp,
    StatusTag,
    AuditPanel,
    DeliveryPoints,
    CustomerItems,
  ],
  template: `
    <app-page-header
      [title]="customer() ? customer()!.code + ' · ' + customer()!.name : 'Nuevo cliente'"
    >
      @if (customer(); as c) {
        <app-status-tag
          [text]="c.isActive ? 'Activo' : 'Inactivo'"
          [color]="c.isActive ? 'green' : 'grey'"
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
          id="customer-form"
          class="general pan-has-action-bar"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          <section class="pan-card" aria-labelledby="customer-data">
            <h2 id="customer-data">Datos generales</h2>
            <div class="fields">
              <mat-form-field>
                <mat-label>Código</mat-label>
                <input matInput class="pan-uppercase" formControlName="code" autocomplete="off" />
                <mat-hint>Letras, números y guiones (ej. CLI-001).</mat-hint>
                <mat-error>{{ controlError(form.controls.code) }}</mat-error>
              </mat-form-field>
              <mat-form-field class="wide">
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="name" />
                <mat-error>{{ controlError(form.controls.name) }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>RFC (opcional)</mat-label>
                <input matInput class="pan-uppercase" formControlName="taxId" autocomplete="off" />
                <mat-error>{{ controlError(form.controls.taxId) }}</mat-error>
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
              <mat-form-field class="full">
                <mat-label>Notas</mat-label>
                <textarea matInput formControlName="notes" rows="2"></textarea>
                <mat-error>{{ controlError(form.controls.notes) }}</mat-error>
              </mat-form-field>
              @if (customer()) {
                <mat-slide-toggle formControlName="isActive">Activo</mat-slide-toggle>
              }
            </div>
          </section>
          @if (customer(); as c) {
            <p class="stamps">
              Creado <app-stamp [at]="c.createdAt" [by]="c.createdByName" />
              @if (c.updatedAt) {
                · Modificado <app-stamp [at]="c.updatedAt" [by]="c.updatedByName" />
              }
            </p>
          }
        </form>
      </mat-tab>

      @if (customer(); as c) {
        <mat-tab label="Puntos de entrega">
          <div class="tab-card">
            <app-delivery-points [customerId]="c.id" [canManage]="canManage" />
          </div>
        </mat-tab>
        <mat-tab label="Artículos">
          <div class="tab-card">
            <app-customer-items [customerId]="c.id" [canManage]="canManage" />
          </div>
        </mat-tab>
        @if (canSeeAudit) {
          <mat-tab label="Historial">
            <section class="pan-card tab-card">
              <ng-template matTabContent>
                <app-audit-panel [entityId]="c.id" />
              </ng-template>
            </section>
          </mat-tab>
        }
      }
    </mat-tab-group>

    @if (canManage && tab() === 0) {
      <div class="pan-action-bar">
        <a matButton routerLink="/ventas/clientes">Volver</a>
        <button matButton="filled" type="submit" form="customer-form" [disabled]="saving()">
          {{ customer() ? 'Guardar' : 'Crear cliente' }}
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

      .full {
        grid-column: 1 / -1;
      }
    }

    mat-form-field {
      width: 100%;
    }

    .stamps {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
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
export class CustomerFormPage {
  /** Present for an existing customer (`/:id`). */
  readonly id = input<string>();

  private readonly api = inject(CustomersApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly canManage = this.auth.can('sales.customers.manage');
  protected readonly canSeeAudit = this.auth.can('security.audit.view');
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);
  protected readonly tab = signal(0);
  protected readonly customer = signal<Customer | null>(null);

  protected readonly form = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(20),
        (control: AbstractControl<string>) =>
          !control.value || CODE.test(control.value.trim())
            ? null
            : { message: 'Usa letras, números y guiones; empieza con letra o número.' },
      ],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    taxId: new FormControl('', { nonNullable: true, validators: rfcValidator }),
    contactName: new FormControl('', { nonNullable: true, validators: Validators.maxLength(150) }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.maxLength(30) }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(200)],
    }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
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
    const definition = {
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      taxId: v.taxId.trim().toUpperCase() || null,
      contactName: v.contactName.trim() || null,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      notes: v.notes.trim() || null,
    };
    const customer = this.customer();

    this.saving.set(true);
    try {
      if (customer) {
        this.show(
          await firstValueFrom(
            this.api.update(customer.id, {
              ...definition,
              version: customer.version,
              isActive: v.isActive,
            }),
          ),
        );
        this.notifier.info('Cambios guardados.');
      } else {
        const created = await firstValueFrom(this.api.create(definition));
        this.notifier.info('Cliente creado. Agrega sus puntos de entrega.');
        await this.router.navigate(['/ventas/clientes', created.id]);
      }
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private show(customer: Customer): void {
    this.customer.set(customer);
    this.breadcrumbs.setCurrent(customer.code);
    this.form.reset({
      code: customer.code,
      name: customer.name,
      taxId: customer.taxId ?? '',
      contactName: customer.contactName ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      notes: customer.notes ?? '',
      isActive: customer.isActive,
    });
  }
}
