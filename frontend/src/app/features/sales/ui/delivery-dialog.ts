import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { ENUM_LABELS } from '../../../shared/pipes/labels';
import { QtyPipe } from '../../../shared/pipes/pipes';
import type { WarehouseOption } from '../../inventory/data-access/inventory-api';
import type { CustomerShipment } from '../data-access/sales-api';

type Reason = ApiEnum<'ShipmentRejectionReason'>;
type Disposition = ApiEnum<'RejectionDisposition'>;

export interface DeliveryDialogData {
  shipment: CustomerShipment;
  /** The plant's stock locations what returns may re-enter (empty: the plant itself). */
  warehouses: WarehouseOption[];
}

export type DeliveryResult = Omit<Schemas['DeliverCustomerShipmentRequest'], 'version'>;

/** One dispatched lot (or line, without lots) and what the customer rejected of it. */
interface DeliveryRow {
  lineId: string;
  lotId: string | null;
  sku: string;
  itemName: string;
  lotNumber: string | null;
  uomCode: string;
  shipped: number;
  form: FormGroup<{
    rejected: FormControl<number | null>;
    reason: FormControl<Reason | null>;
    notes: FormControl<string>;
    disposition: FormControl<Disposition>;
    warehouseId: FormControl<string | null>;
  }>;
}

/** `yyyy-MM-ddTHH:mm` in local time, for a datetime-local input. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The input has minute precision: a delivery in the same minute as the dispatch (20:54 for a dispatch at 20:54:02)
 * takes the millisecond after the dispatch, so it is not "before" it.
 */
export function deliveryInstant(local: string, dispatchedAt: string | null | undefined): string {
  const chosen = new Date(local);
  const dispatched = dispatchedAt ? new Date(dispatchedAt) : null;
  // The API keeps microseconds and a Date only milliseconds: the next millisecond is never before the dispatch.
  if (dispatched && chosen <= dispatched && dispatched.getTime() - chosen.getTime() < 60_000)
    return new Date(dispatched.getTime() + 1).toISOString();
  return chosen.toISOString();
}

/** RN-114: what is rejected needs a reason; "Otro" a note; what returns, its sub-warehouse. */
export function rejectionValidator(needsWarehouse: boolean, shipped: number) {
  return (group: AbstractControl): ValidationErrors | null => {
    const v = (group as DeliveryRow['form']).getRawValue();
    const rejected = v.rejected ?? 0;
    if (rejected <= 0) return null;
    if (rejected > shipped) return { overShipped: true };
    if (!v.reason) return { reason: true };
    if (v.reason === 'Other' && !v.notes.trim()) return { notes: true };
    if (v.disposition === 'Return' && needsWarehouse && !v.warehouseId) return { warehouse: true };
    return null;
  };
}

/**
 * Delivery of a dispatched shipment (RN-114, F-27): when, who received and, per dispatched lot, what was rejected with
 * its reason and whether it returns to the plant (choosing the sub-warehouse) or is lost. The rest is accepted.
 */
@Component({
  selector: 'app-delivery-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    QtyInput,
    QtyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Registrar entrega de {{ data.shipment.folio }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="muted">
          Despachada {{ data.shipment.dispatchedAt | date: 'dd/MM/yyyy HH:mm' }}. Captura solo lo
          que el cliente rechazó; lo demás se da por aceptado.
        </p>
        <div class="pair">
          <mat-form-field>
            <mat-label>Entregada el</mat-label>
            <input matInput type="datetime-local" formControlName="deliveredAt" [max]="maxDate" />
            <mat-error>{{ controlError(form.controls.deliveredAt) }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Recibió</mat-label>
            <input matInput formControlName="receivedByName" autocomplete="off" />
            <mat-error>{{ controlError(form.controls.receivedByName) }}</mat-error>
          </mat-form-field>
        </div>

        <h3>Rechazos</h3>
        @for (row of rows; track row.lineId + (row.lotId ?? '')) {
          @let v = row.form.getRawValue();
          <article class="row" [formGroup]="row.form">
            <div class="head">
              <strong>{{ row.sku }}</strong> {{ row.itemName }}
              <span class="muted">
                @if (row.lotNumber) {
                  · lote {{ row.lotNumber }}
                }
                · enviado {{ row.shipped | qty: row.uomCode }}
              </span>
            </div>
            <div class="fields">
              <app-qty-input
                formControlName="rejected"
                label="Rechazado"
                [unit]="row.uomCode"
                [max]="row.shipped"
                allowZero
              />
              @if ((v.rejected ?? 0) > 0) {
                <mat-form-field>
                  <mat-label>Motivo</mat-label>
                  <mat-select formControlName="reason">
                    @for (option of reasons; track option.value) {
                      <mat-option [value]="option.value">{{ option.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field>
                  <mat-label>Destino</mat-label>
                  <mat-select formControlName="disposition">
                    @for (option of dispositions; track option.value) {
                      <mat-option [value]="option.value">{{ option.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                @if (v.disposition === 'Return' && data.warehouses.length > 0) {
                  <mat-form-field>
                    <mat-label>Regresa al subalmacén</mat-label>
                    <mat-select formControlName="warehouseId">
                      @for (warehouse of data.warehouses; track warehouse.id) {
                        <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                <mat-form-field class="wide">
                  <mat-label>{{ v.reason === 'Other' ? 'Nota (obligatoria)' : 'Nota' }}</mat-label>
                  <input matInput formControlName="notes" autocomplete="off" maxlength="300" />
                </mat-form-field>
              }
            </div>
            @if (row.form.touched && row.form.errors; as errors) {
              <p class="exit" role="alert">
                @if (errors['overShipped']) {
                  No puede rechazarse más de lo enviado.
                } @else if (errors['reason']) {
                  Elige el motivo del rechazo.
                } @else if (errors['notes']) {
                  Un rechazo por "Otro" necesita una nota.
                } @else if (errors['warehouse']) {
                  Elige el subalmacén al que regresa.
                }
              </p>
            }
          </article>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit">Continuar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .pair,
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0 16px;
      align-items: start;
    }

    .fields .wide {
      grid-column: 1 / -1;
    }

    h3 {
      margin: 8px 0;
      font: var(--mat-sys-title-small);
    }

    .row {
      padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }

    .head {
      margin-bottom: 8px;
    }

    .exit {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
})
export class DeliveryDialog {
  protected readonly data = inject<DeliveryDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DeliveryDialog, DeliveryResult>>(MatDialogRef);
  protected readonly controlError = controlError;
  protected readonly maxDate = localInput(new Date());

  protected readonly reasons = Object.entries(ENUM_LABELS.ShipmentRejectionReason).map(
    ([value, label]) => ({
      value: value as Reason,
      label,
    }),
  );
  protected readonly dispositions = Object.entries(ENUM_LABELS.RejectionDisposition).map(
    ([value, label]) => ({
      value: value as Disposition,
      label,
    }),
  );

  protected readonly form = new FormGroup({
    deliveredAt: new FormControl(localInput(new Date()), {
      nonNullable: true,
      validators: Validators.required,
    }),
    receivedByName: new FormControl(this.data.shipment.receivedByName ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
  });

  protected readonly rows: DeliveryRow[] = this.data.shipment.lines
    .filter((l) => l.quantity > 0)
    .flatMap((line) =>
      (line.lots.length > 0
        ? line.lots.map((lot) => ({
            lotId: lot.lotId as string | null,
            lotNumber: lot.lotNumber as string | null,
            shipped: lot.quantity,
          }))
        : [{ lotId: null, lotNumber: null, shipped: line.quantity }]
      ).map((part) => ({
        lineId: line.id,
        sku: line.sku,
        itemName: line.itemName,
        uomCode: line.uomCode,
        ...part,
        form: new FormGroup(
          {
            rejected: new FormControl<number | null>(0),
            reason: new FormControl<Reason | null>(null),
            notes: new FormControl('', { nonNullable: true }),
            disposition: new FormControl<Disposition>('Return', { nonNullable: true }),
            warehouseId: new FormControl<string | null>(
              this.data.warehouses.length === 1 ? this.data.warehouses[0].id : null,
            ),
          },
          { validators: rejectionValidator(this.data.warehouses.length > 0, part.shipped) },
        ),
      })),
    );

  protected submit(): void {
    this.form.markAllAsTouched();
    for (const row of this.rows) row.form.markAllAsTouched();
    if (this.form.invalid || this.rows.some((r) => r.form.invalid)) return;
    const { deliveredAt, receivedByName } = this.form.getRawValue();
    const rejections = this.rows
      .map((row) => ({ row, v: row.form.getRawValue() }))
      .filter(({ v }) => (v.rejected ?? 0) > 0)
      .map(({ row, v }) => ({
        lineId: row.lineId,
        lotId: row.lotId,
        quantity: v.rejected!,
        reason: v.reason!,
        notes: v.notes.trim() || null,
        disposition: v.disposition,
        returnWarehouseId: v.disposition === 'Return' ? v.warehouseId : null,
      }));
    this.ref.close({
      deliveredAt: deliveryInstant(deliveredAt, this.data.shipment.dispatchedAt),
      receivedByName: receivedByName.trim(),
      rejections: rejections.length > 0 ? rejections : null,
    });
  }
}
