import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable, firstValueFrom } from 'rxjs';
import type { ApiEnum } from '../../../core/api/api';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { SupplierItem, SuppliersApi } from '../data-access/purchasing-api';

export interface SupplierItemDialogData {
  supplierId: string;
  /** Present when editing a row of the catalog. */
  row: SupplierItem | null;
}

/** What a supplier sells: raw materials and supplies. */
const PURCHASED_TYPES: readonly ApiEnum<'ItemType'>[] = ['RawMaterial', 'Supply'];

/**
 * A row of the supplier's catalog (RN-30, RN-35): item (raw material or supply; fixed once added), supplier code,
 * price without VAT per purchase unit, lead time, preferred and active. Saves and closes with the saved row.
 */
@Component({
  selector: 'app-supplier-item-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    ItemPicker,
    QtyInput,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.row ? 'Editar ' + data.row.itemSku : 'Agregar artículo' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        @if (data.row; as row) {
          <p>
            <strong>{{ row.itemSku }}</strong> {{ row.itemName }}
          </p>
        } @else {
          <app-item-picker
            formControlName="item"
            label="Materia prima o insumo"
            [types]="purchasedTypes"
          />
        }
        <mat-form-field>
          <mat-label>Clave del proveedor</mat-label>
          <input matInput formControlName="supplierSku" autocomplete="off" />
          <mat-error>{{ controlError(form.controls.supplierSku) }}</mat-error>
        </mat-form-field>
        <app-qty-input
          formControlName="price"
          [label]="priceLabel()"
          unit="$"
          [decimals]="4"
          allowZero
        />
        <app-qty-input
          formControlName="leadTimeDays"
          label="Días de entrega"
          unit="días"
          [decimals]="0"
          allowZero
        />
        <mat-slide-toggle formControlName="isPreferred">
          Proveedor preferido de este artículo
        </mat-slide-toggle>
        <p class="hint">Marcarlo quita la preferencia del proveedor que la tenía.</p>
        @if (data.row) {
          <mat-slide-toggle formControlName="isActive">Activo en el catálogo</mat-slide-toggle>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ data.row ? 'Guardar' : 'Agregar' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    p {
      margin: 0;
    }

    .hint {
      margin: -4px 0 4px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class SupplierItemDialog {
  protected readonly data = inject<SupplierItemDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SupplierItemDialog, SupplierItem>>(MatDialogRef);
  private readonly api = inject(SuppliersApi);
  private readonly formErrors = inject(FormErrors);
  protected readonly purchasedTypes = PURCHASED_TYPES;
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    item: new FormControl<ItemOption | null>(null, this.data.row ? null : Validators.required),
    supplierSku: new FormControl(this.data.row?.supplierSku ?? '', {
      nonNullable: true,
      validators: Validators.maxLength(50),
    }),
    price: new FormControl<number | null>(this.data.row?.price ?? null, Validators.required),
    leadTimeDays: new FormControl<number | null>(this.data.row?.leadTimeDays ?? 0, [
      Validators.required,
      Validators.max(365),
    ]),
    isPreferred: new FormControl(this.data.row?.isPreferred ?? false, { nonNullable: true }),
    isActive: new FormControl(this.data.row?.isActive ?? true, { nonNullable: true }),
  });

  /** The price is per purchase unit when the item has one (RN-33 converts it to the base unit). */
  protected priceLabel(): string {
    const row = this.data.row;
    const unit = row ? (row.purchaseUomCode ?? row.baseUomCode) : null;
    return unit ? `Precio por ${unit} (sin IVA)` : 'Precio por unidad de compra (sin IVA)';
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const row = this.data.row;
    const common = {
      supplierSku: v.supplierSku.trim() || null,
      price: v.price!,
      leadTimeDays: v.leadTimeDays!,
      isPreferred: v.isPreferred && v.isActive,
    };
    const request: Observable<SupplierItem> = row
      ? this.api.updateItem(this.data.supplierId, row.id, {
          ...common,
          version: row.version,
          isActive: v.isActive,
        })
      : this.api.addItem(this.data.supplierId, { ...common, itemId: v.item!.id });
    this.saving.set(true);
    try {
      this.ref.close(await firstValueFrom(request));
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }
}
