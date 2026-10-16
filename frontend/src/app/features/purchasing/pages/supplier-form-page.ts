import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { SupplierDto, SuppliersApi } from '../data-access/suppliers.api';
import { SupplierItems } from '../ui/supplier-items';
import { daysValidator, MAX_DAYS, normalizeTaxId, taxIdValidator } from '../ui/supplier-validators';

/**
 * Alta y edición de proveedores (`/compras/proveedores/nuevo`, `/:id`). Quien solo tiene
 * `purchasing.view` ve el detalle en solo lectura.
 */
@Component({
  selector: 'app-supplier-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTabsModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    SupplierItems,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-form-page.html',
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-4);
    }
    .wide {
      grid-column: 1 / -1;
    }
    .toggle {
      align-self: center;
    }
    .upper {
      text-transform: uppercase;
    }
    .tab {
      padding-top: var(--sgo-space-4);
    }
    .notice {
      margin: 0 0 var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SupplierFormPage {
  private readonly api = inject(SuppliersApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly confirmService = inject(ConfirmService);

  readonly id = input<string>();

  protected readonly canManage = inject(AuthService).can('purchasing.suppliers.manage');
  protected readonly maxDays = MAX_DAYS;
  protected readonly isNew = computed(() => !this.id());
  protected readonly supplier = signal<SupplierDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly auditRefresh = signal(0);
  /** El backend no deja editar artículos de un proveedor inactivo. */
  protected readonly itemsEditable = computed(
    () => this.canManage && this.supplier()?.isActive === true,
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    taxId: ['', [Validators.required, taxIdValidator]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    contactName: ['', Validators.maxLength(150)],
    phone: ['', Validators.maxLength(30)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    paymentTermsDays: [0 as number | null, daysValidator],
    isActive: [true],
  });

  constructor() {
    if (!this.canManage) {
      this.form.disable();
    }
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
    const v = this.form.getRawValue();
    const request = {
      taxId: normalizeTaxId(v.taxId),
      name: v.name.trim(),
      contactName: v.contactName.trim() || null,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      paymentTermsDays: v.paymentTermsDays ?? 0,
    };
    const supplier = this.supplier();
    const deactivating = !!supplier?.isActive && !v.isActive;

    this.confirmDeactivation(deactivating).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.saving.set(true);
      const request$ = supplier
        ? this.api.update(supplier.id, {
            ...request,
            isActive: v.isActive,
            version: supplier.version,
          })
        : this.api.create(request);

      request$.subscribe({
        next: (saved) => {
          this.saving.set(false);
          if (supplier) {
            this.setSupplier(saved);
            this.notifier.success('Proveedor guardado.');
          } else {
            this.notifier.success(`Proveedor ${saved.name} creado. Ahora agrega sus artículos.`);
            void this.router.navigate(['/compras/proveedores', saved.id]);
          }
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formErrors.handle(error, this.form, {
            reload: () => supplier && this.load(supplier.id),
          });
        },
      });
    });
  }

  private confirmDeactivation(deactivating: boolean): Observable<boolean> {
    return deactivating
      ? this.confirmService.confirm({
          title: 'Desactivar proveedor',
          message:
            'Dejará de ser el proveedor preferido de sus artículos y no se podrán hacer órdenes de compra con él. Puedes reactivarlo después.',
          confirmLabel: 'Desactivar',
          tone: 'warn',
        })
      : of(true);
  }

  private load(id: string): void {
    this.api.get(id).subscribe({
      next: (supplier) => this.setSupplier(supplier),
      error: () => void this.router.navigate(['/compras/proveedores']),
    });
  }

  private setSupplier(supplier: SupplierDto): void {
    this.supplier.set(supplier);
    this.form.reset({
      taxId: supplier.taxId,
      name: supplier.name,
      contactName: supplier.contactName ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      paymentTermsDays: supplier.paymentTermsDays,
      isActive: supplier.isActive,
    });
    this.auditRefresh.update((n) => n + 1);
  }
}
