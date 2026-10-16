import { ChangeDetectionStrategy, Component, inject, LOCALE_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatMxn } from '../../../shared/pipes/mxn.pipe';
import { SupplierItemDto, SuppliersApi } from '../data-access/suppliers.api';
import { daysValidator, MAX_DAYS, pricePerBaseUnit, priceValidator } from './supplier-validators';

export interface SupplierItemDialogData {
  supplierId: string;
  /** `null` para ligar un artículo nuevo. */
  row: SupplierItemDto | null;
}

/** Liga un artículo al proveedor o edita su precio, clave, días de entrega, preferido y estado. */
@Component({
  selector: 'app-supplier-item-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    ItemPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ row ? 'Editar artículo del proveedor' : 'Agregar artículo' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        @if (row) {
          <p class="item">
            <strong>{{ row.sku }} · {{ row.name }}</strong>
            <span class="muted">Se compra por {{ row.purchaseUomCode }}</span>
          </p>
        } @else {
          <app-item-picker formControlName="item" label="Artículo" />
        }
        <mat-form-field appearance="outline">
          <mat-label>Clave del proveedor</mat-label>
          <input matInput formControlName="supplierSku" autocomplete="off" />
          <mat-hint>Opcional. Como aparece en su lista de precios o factura.</mat-hint>
          @if (form.controls.supplierSku.hasError('maxlength')) {
            <mat-error>Máximo 50 caracteres.</mat-error>
          } @else {
            <mat-error>{{ form.controls.supplierSku.getError('server') }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Precio sin IVA</mat-label>
          <span matTextPrefix>$&nbsp;</span>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            formControlName="price"
            required
          />
          @if (row) {
            <span matTextSuffix>/ {{ row.purchaseUomCode }}</span>
          }
          <mat-hint>{{ priceHint() }}</mat-hint>
          @if (form.controls.price.hasError('required')) {
            <mat-error>Escribe el precio.</mat-error>
          } @else if (form.controls.price.hasError('min')) {
            <mat-error>No puede ser negativo.</mat-error>
          } @else if (form.controls.price.hasError('decimals')) {
            <mat-error>Máximo 4 decimales.</mat-error>
          } @else {
            <mat-error>{{ form.controls.price.getError('server') }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Días de entrega</mat-label>
          <input
            matInput
            type="number"
            inputmode="numeric"
            min="0"
            [max]="maxDays"
            formControlName="leadTimeDays"
            required
          />
          <span matTextSuffix>días</span>
          <mat-hint>Desde que se envía la orden de compra.</mat-hint>
          @if (form.controls.leadTimeDays.hasError('server')) {
            <mat-error>{{ form.controls.leadTimeDays.getError('server') }}</mat-error>
          } @else {
            <mat-error>Número entero de 0 a {{ maxDays }}.</mat-error>
          }
        </mat-form-field>
        <mat-slide-toggle formControlName="isPreferred">Proveedor preferido</mat-slide-toggle>
        <p class="muted toggle-hint">
          Se sugiere en requisiciones. Si el artículo ya tiene otro preferido, lo reemplaza.
        </p>
        @if (row) {
          <mat-slide-toggle formControlName="isActive">Activo</mat-slide-toggle>
          <p class="muted toggle-hint">Inactivo ya no se puede agregar a órdenes de compra.</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--sgo-space-1);
    }
    .item {
      display: flex;
      flex-direction: column;
      margin: 0 0 var(--sgo-space-3);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .toggle-hint {
      margin: 0 0 var(--sgo-space-2);
    }
  `,
})
export class SupplierItemDialog {
  private readonly data = inject<SupplierItemDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(SuppliersApi);
  private readonly dialogRef = inject(MatDialogRef<SupplierItemDialog, SupplierItemDto>);
  private readonly formErrors = inject(FormErrors);
  private readonly locale = inject(LOCALE_ID);

  protected readonly row = this.data.row;
  protected readonly maxDays = MAX_DAYS;
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    item: [null as ItemOption | null, this.row ? [] : [Validators.required]],
    supplierSku: [this.row?.supplierSku ?? '', Validators.maxLength(50)],
    price: [this.row?.price ?? (null as number | null), priceValidator],
    leadTimeDays: [this.row?.leadTimeDays ?? 1, daysValidator],
    isPreferred: [this.row?.isPreferred ?? false],
    isActive: [this.row?.isActive ?? true],
  });

  private readonly price = signal(this.form.controls.price.value);

  constructor() {
    const { isActive, isPreferred, price } = this.form.controls;
    // Un artículo inactivo nunca es el preferido (regla del backend).
    const syncPreferred = (active: boolean) => {
      if (active) {
        isPreferred.enable({ emitEvent: false });
      } else {
        isPreferred.setValue(false, { emitEvent: false });
        isPreferred.disable({ emitEvent: false });
      }
    };
    syncPreferred(isActive.value);
    isActive.valueChanges.pipe(takeUntilDestroyed()).subscribe(syncPreferred);
    price.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.price.set(value));
  }

  /** "1 caja = 25 kg · $16.50 / kg" para comparar con otros proveedores. */
  protected priceHint(): string {
    const row = this.row;
    if (!row) {
      return 'Por unidad de compra del artículo.';
    }
    const price = this.price();
    if (
      row.purchaseToBaseFactor === 1 ||
      price === null ||
      priceValidator(this.form.controls.price)
    ) {
      return `Por ${row.purchaseUomCode}.`;
    }
    const perBase = formatMxn(
      pricePerBaseUnit(price, row.purchaseToBaseFactor),
      this.locale,
      '1.2-4',
    );
    return `1 ${row.purchaseUomCode} = ${row.purchaseToBaseFactor} ${row.baseUomCode} · ${perBase} / ${row.baseUomCode}`;
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const common = {
      supplierSku: value.supplierSku.trim() || null,
      price: value.price ?? 0,
      leadTimeDays: value.leadTimeDays,
      isPreferred: value.isActive && value.isPreferred,
    };
    const request$ = this.row
      ? this.api.updateItem(this.data.supplierId, this.row.id, {
          ...common,
          isActive: value.isActive,
          version: this.row.version,
        })
      : this.api.addItem(this.data.supplierId, { ...common, itemId: value.item!.id });

    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => this.dialogRef.close() });
      },
    });
  }
}
