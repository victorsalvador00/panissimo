import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable, firstValueFrom } from 'rxjs';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { CustomerItem, CustomersApi } from '../data-access/sales-api';

export interface CustomerItemDialogData {
  customerId: string;
  /** Present when editing a row. */
  row: CustomerItem | null;
}

/** A finished good the customer buys (D-05, D-06): its code for the customer and an optional informative price. */
@Component({
  selector: 'app-customer-item-dialog',
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
          <app-item-picker formControlName="item" label="Producto terminado" type="FinishedGood" />
        }
        <mat-form-field>
          <mat-label>Clave del cliente</mat-label>
          <input matInput formControlName="customerSku" autocomplete="off" />
          <mat-error>{{ controlError(form.controls.customerSku) }}</mat-error>
        </mat-form-field>
        <app-qty-input
          formControlName="price"
          label="Precio informativo (sin IVA)"
          unit="$"
          [decimals]="4"
          allowZero
        />
        @if (data.row) {
          <mat-slide-toggle formControlName="isActive">Activo</mat-slide-toggle>
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
  `,
})
export class CustomerItemDialog {
  protected readonly data = inject<CustomerItemDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<CustomerItemDialog, CustomerItem>>(MatDialogRef);
  private readonly api = inject(CustomersApi);
  private readonly formErrors = inject(FormErrors);
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    item: new FormControl<ItemOption | null>(null, this.data.row ? null : Validators.required),
    customerSku: new FormControl(this.data.row?.customerSku ?? '', {
      nonNullable: true,
      validators: Validators.maxLength(50),
    }),
    price: new FormControl<number | null>(this.data.row?.price ?? null),
    isActive: new FormControl(this.data.row?.isActive ?? true, { nonNullable: true }),
  });

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const row = this.data.row;
    const request: Observable<CustomerItem> = row
      ? this.api.updateItem(this.data.customerId, row.id, {
          version: row.version,
          customerSku: v.customerSku.trim() || null,
          price: v.price,
          isActive: v.isActive,
        })
      : this.api.addItem(this.data.customerId, {
          itemId: v.item!.id,
          customerSku: v.customerSku.trim() || null,
          price: v.price,
        });
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
