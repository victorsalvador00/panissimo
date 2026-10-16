import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { toDateOnly } from '../../../shared/forms/date-range';
import type { CountInput } from '../data-access/physical-counts.api';

type AddLineForm = FormGroup<{
  item: FormControl<ItemOption | null>;
  lotNumber: FormControl<string>;
  expirationDate: FormControl<Date | null>;
  countedQty: FormControl<number | null>;
}>;

/** Artículos con lote: el lote contado es obligatorio (el backend lo crea si no existe). */
function lotRequired(group: AbstractControl): ValidationErrors | null {
  const { item, lotNumber } = (group as AddLineForm).getRawValue();
  return item?.tracksLots && !lotNumber.trim() ? { lotRequired: true } : null;
}

/** Línea de un artículo o lote que no estaba en la lista del conteo. */
export function toAddedCount(value: ReturnType<AddLineForm['getRawValue']>): CountInput {
  const tracksLots = !!value.item?.tracksLots;
  return {
    lineId: null,
    itemId: value.item!.id,
    lotId: null,
    lotNumber: tracksLots ? value.lotNumber.trim() : null,
    expirationDate: tracksLots ? toDateOnly(value.expirationDate) : null,
    countedQty: value.countedQty ?? 0,
  };
}

/** Agrega al conteo en captura un artículo o lote encontrado en anaquel que no estaba en la lista. */
@Component({
  selector: 'app-add-count-line-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    ItemPicker,
    QtyInput,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Agregar artículo al conteo</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="hint">Para algo que encontraste y no aparece en la lista.</p>
        <app-item-picker formControlName="item" />
        @if (item()?.tracksLots) {
          <div class="lot">
            <mat-form-field appearance="outline">
              <mat-label>Lote</mat-label>
              <input matInput formControlName="lotNumber" autocomplete="off" />
              @if (form.hasError('lotRequired') && form.controls.lotNumber.touched) {
                <mat-error>Captura el lote contado.</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Caducidad</mat-label>
              <input matInput [matDatepicker]="expiration" formControlName="expirationDate" />
              <mat-datepicker-toggle matIconSuffix [for]="expiration" />
              <mat-datepicker #expiration />
            </mat-form-field>
          </div>
        }
        <app-qty-input
          formControlName="countedQty"
          label="Cantidad contada"
          [unit]="item()?.baseUomCode"
          [allowZero]="true"
        />
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit">Agregar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: var(--sgo-space-1);
    }
    .hint {
      margin: 0 0 var(--sgo-space-2);
      color: var(--mat-sys-on-surface-variant);
    }
    .lot {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0 var(--sgo-space-2);
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class AddCountLineDialog {
  private readonly dialogRef = inject<MatDialogRef<AddCountLineDialog, CountInput>>(MatDialogRef);

  protected readonly form: AddLineForm = new FormGroup(
    {
      item: new FormControl<ItemOption | null>(null, Validators.required),
      lotNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
      expirationDate: new FormControl<Date | null>(null),
      countedQty: new FormControl<number | null>(null, Validators.required),
    },
    { validators: lotRequired },
  );

  protected readonly item = toSignal(this.form.controls.item.valueChanges, { initialValue: null });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.dialogRef.close(toAddedCount(this.form.getRawValue()));
  }
}
