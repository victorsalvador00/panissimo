import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormRecord,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { forkJoin, map, startWith } from 'rxjs';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { LotStock, StockApi } from '../../inventory/data-access/stock.api';
import type {
  DispatchTransferRequest,
  TransferDto,
  TransferLine,
} from '../data-access/transfers.api';
import { LotQty, lotsSumValidator, lotsTotal } from '../../inventory/ui/lot-split';
import { DispatchLine, toDispatchRequest } from './transfer-lines';

export interface DispatchDialogResult {
  request: DispatchTransferRequest;
  /** Números de lote por id (para el resumen y el diálogo de faltantes). */
  lotLabels: Record<string, string>;
}

/**
 * Datos del envío y, opcionalmente, reparto manual por lotes (RN-21). Sin reparto, el backend usa el
 * lote planeado o FEFO. Devuelve la petición; la confirmación la pide la página.
 */
@Component({
  selector: 'app-dispatch-dialog',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    QtyInput,
    QtyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Despachar {{ data.folio }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <div class="shipping">
          <mat-form-field appearance="outline">
            <mat-label>Vehículo</mat-label>
            <input matInput formControlName="vehicleDescription" autocomplete="off" />
            <mat-hint>Ej. Nissan NP300 ABC-123</mat-hint>
            <mat-error>Captura el vehículo.</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Chofer</mat-label>
            <input matInput formControlName="driverName" autocomplete="off" />
            <mat-error>Captura el chofer.</mat-error>
          </mat-form-field>
        </div>

        <h3>Lotes</h3>
        @if (!lots()) {
          <p class="muted">Cargando lotes…</p>
        }
        <ul class="lines">
          @for (line of data.lines; track line.id) {
            <li>
              <div class="line-head">
                <div class="info">
                  <strong>{{ line.sku }} · {{ line.itemName }}</strong>
                  <span class="muted">{{ line.shippedQty | qty: line.baseUomCode }}</span>
                </div>
                @if (lotsOf(line).length) {
                  <mat-slide-toggle [formControl]="lineForm(line.id).controls.manual">
                    Elegir lotes
                  </mat-slide-toggle>
                }
              </div>
              @if (lineForm(line.id).controls.manual.value) {
                <ul class="lots">
                  @for (lot of lotsOf(line); track lot.lotId) {
                    <li>
                      <span class="lot">
                        {{ lot.lotNumber }}
                        @if (lot.expirationDate) {
                          · cad. {{ lot.expirationDate | date: 'dd/MM/yy' }}
                        }
                        <span class="muted">Disp. {{ lot.quantity | qty: line.baseUomCode }}</span>
                      </span>
                      <app-qty-input
                        [formControl]="
                          lineForm(line.id).controls.lots.controls[lot.lotId!].controls.quantity
                        "
                        [ariaLabel]="'Cantidad del lote ' + lot.lotNumber"
                        [unit]="line.baseUomCode"
                        [allowZero]="true"
                        subscriptSizing="dynamic"
                      />
                    </li>
                  }
                </ul>
                <p class="sum" [class.error]="lineForm(line.id).hasError('lotsSum')">
                  Repartido {{ assigned(line) | qty: line.baseUomCode }} de
                  {{ line.shippedQty | qty: line.baseUomCode }}
                </p>
              } @else {
                <p class="muted auto">
                  {{
                    line.lotNumber
                      ? 'Lote planeado ' + line.lotNumber
                      : lotsOf(line).length
                        ? 'Automático (primero en caducar)'
                        : 'Sin lotes'
                  }}
                </p>
              }
            </li>
          }
        </ul>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="!lots()">Continuar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .shipping {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0 var(--sgo-space-3);
    }
    mat-form-field {
      width: 100%;
    }
    h3 {
      margin: var(--sgo-space-3) 0 var(--sgo-space-2);
      font: var(--mat-sys-title-small);
    }
    .lines,
    .lots {
      display: grid;
      gap: var(--sgo-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .lines > li {
      padding: var(--sgo-space-2) var(--sgo-space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
    }
    .line-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--sgo-space-2);
    }
    .info {
      display: grid;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .lots {
      margin-top: var(--sgo-space-2);
    }
    .lots li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 9rem;
      align-items: center;
      gap: var(--sgo-space-2);
    }
    .lot {
      display: grid;
      font: var(--mat-sys-body-medium);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .auto,
    .sum {
      margin: var(--sgo-space-1) 0 0;
    }
    .sum {
      font: var(--mat-sys-body-small);
    }
    .sum.error {
      color: var(--sgo-status-red-fg);
    }
  `,
})
export class DispatchDialog {
  protected readonly data = inject<TransferDto>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<DispatchDialog, DispatchDialogResult>>(MatDialogRef);

  protected readonly form = new FormGroup({
    vehicleDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    driverName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    lines: new FormRecord<DispatchLine>({}),
  });

  /** Lotes vigentes con existencia en el origen, por artículo. */
  protected readonly lots = signal<Map<string, LotStock[]> | null>(null);
  private readonly lotsValue = toSignal(
    this.form.controls.lines.valueChanges.pipe(startWith(null)),
  );

  constructor() {
    for (const line of this.data.lines) {
      this.form.controls.lines.addControl(
        line.id,
        new FormGroup(
          {
            manual: new FormControl(false, { nonNullable: true }),
            lots: new FormRecord<LotQty>({}),
          },
          { validators: lotsSumValidator(line.shippedQty) },
        ),
      );
    }
    const stock = inject(StockApi);
    const itemIds = [...new Set(this.data.lines.map((line) => line.itemId))];
    forkJoin(itemIds.map((itemId) => stock.lots(this.data.from.id, itemId)))
      .pipe(
        map(
          (results) =>
            new Map(
              itemIds.map((itemId, i) => [
                itemId,
                results[i].filter((lot) => lot.lotId && !lot.isExpired && lot.quantity > 0),
              ]),
            ),
        ),
      )
      .subscribe((lots) => {
        for (const line of this.data.lines) {
          const group = this.lineForm(line.id).controls.lots;
          for (const lot of lots.get(line.itemId) ?? []) {
            group.addControl(
              lot.lotId!,
              new FormGroup({
                lotId: new FormControl(lot.lotId!, { nonNullable: true }),
                quantity: new FormControl<number | null>(0),
              }),
            );
          }
        }
        this.lots.set(lots);
      });
  }

  protected lineForm(lineId: string): DispatchLine {
    return this.form.controls.lines.controls[lineId];
  }

  protected lotsOf(line: TransferLine): LotStock[] {
    return this.lots()?.get(line.itemId) ?? [];
  }

  protected assigned(line: TransferLine): number {
    this.lotsValue();
    return lotsTotal(Object.values(this.lineForm(line.id).controls.lots.getRawValue()));
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const lotLabels: Record<string, string> = {};
    this.lots()?.forEach((lots) =>
      lots.forEach((lot) => lot.lotId && lot.lotNumber && (lotLabels[lot.lotId] = lot.lotNumber)),
    );
    this.dialogRef.close({
      request: toDispatchRequest(
        this.data.version,
        value.vehicleDescription,
        value.driverName,
        value.lines,
      ),
      lotLabels,
    });
  }
}
