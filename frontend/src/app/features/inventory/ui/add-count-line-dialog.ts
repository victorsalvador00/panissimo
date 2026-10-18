import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { controlError } from '../../../shared/forms/control-error';
import { toIsoDate } from '../../../shared/forms/dates';

export interface AddCountLineResult {
  itemId: string;
  lotId: string | null;
  lotNumber: string | null;
  expirationDate: string | null;
}

/**
 * Item (or lot) found during the count that was not in the snapshot (RN-06): its expected quantity is 0. A lot item
 * brings its lot number and expiry; empty, the system assigns one.
 */
@Component({
  selector: 'app-add-count-line-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    ItemPicker,
  ],
  template: `
    <h2 mat-dialog-title>Agregar artículo al conteo</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        <p class="muted">Para artículos o lotes que encontraste y no estaban en la lista.</p>
        <app-item-picker formControlName="item" label="Artículo" />
        @if (item()?.tracksLots) {
          <mat-form-field>
            <mat-label>Lote</mat-label>
            <input matInput formControlName="lotNumber" />
            <mat-hint>Vacío: el sistema le asigna uno.</mat-hint>
            <mat-error>{{ error('lotNumber') }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Caducidad</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="expirationDate" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit">Agregar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AddCountLineDialog {
  private readonly ref = inject<MatDialogRef<AddCountLineDialog, AddCountLineResult>>(MatDialogRef);

  protected readonly form = new FormGroup({
    item: new FormControl<ItemOption | null>(null, Validators.required),
    lotNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
    expirationDate: new FormControl<Date | null>(null),
  });
  protected readonly item = toSignal(this.form.controls.item.valueChanges, { initialValue: null });

  protected error(key: 'lotNumber'): string | null {
    return controlError(this.form.controls[key]);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { item, lotNumber, expirationDate } = this.form.getRawValue();
    const lots = !!item!.tracksLots;
    this.ref.close({
      itemId: item!.id,
      lotId: null,
      lotNumber: lots ? lotNumber.trim() || null : null,
      expirationDate: lots ? toIsoDate(expirationDate) : null,
    });
  }
}
