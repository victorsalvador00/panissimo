import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { LotStock, StockApi, WarehouseOption } from '../../inventory/data-access/inventory-api';
import type { Transfer, TransferLine } from '../data-access/logistics-api';
import { lotsTotal } from './transfer-rules';

export interface DispatchDialogData {
  transfer: Transfer;
  /** Sub-warehouses of the origin where the user moves stock; with them, one is required (RN-45). */
  warehouses: WarehouseOption[];
}

export type DispatchResult = Omit<Schemas['DispatchTransferRequest'], 'version'>;

/** Lots chosen for one line: open or not, the lots with stock and a quantity per lot. */
class LineLots {
  readonly open = signal(false);
  readonly lots = signal<LotStock[] | null>(null);
  readonly controls = new Map<string, FormControl<number | null>>();
  readonly total = signal(0);

  constructor(readonly line: TransferLine) {}

  control(lotId: string): FormControl<number | null> {
    let control = this.controls.get(lotId);
    if (!control) {
      control = new FormControl<number | null>(null);
      control.valueChanges.subscribe(() => this.total.set(lotsTotal(this.quantities())));
      this.controls.set(lotId, control);
    }
    return control;
  }

  chosen(): Schemas['LotQuantity'][] {
    return [...this.controls]
      .filter(([, c]) => (c.value ?? 0) > 0)
      .map(([lotId, c]) => ({ lotId, qty: c.value! }));
  }

  /** Nothing chosen (planned lot or first to expire), or exactly the line's quantity. */
  valid(): boolean {
    const total = this.total();
    return total === 0 || total === this.line.shippedQty;
  }

  reset(): void {
    this.lots.set(null);
    this.controls.clear();
    this.total.set(0);
  }

  private quantities(): (number | null)[] {
    return [...this.controls.values()].map((c) => c.value);
  }
}

/**
 * Dispatch of a draft (RN-21): vehicle and driver, the sub-warehouse it leaves when the origin has them, and optionally
 * the lots of each line ("Elegir lotes"; otherwise the planned lot or the first to expire). Returns the request; the
 * page confirms and posts it.
 */
@Component({
  selector: 'app-dispatch-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    QtyInput,
    QtyPipe,
  ],
  template: `
    <h2 mat-dialog-title>Despachar {{ data.transfer.folio }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="content">
        @if (data.warehouses.length > 0) {
          <mat-form-field>
            <mat-label>Sale del subalmacén</mat-label>
            <mat-select formControlName="fromWarehouseId">
              @for (warehouse of data.warehouses; track warehouse.id) {
                <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
              }
            </mat-select>
            <mat-error>{{ controlError(form.controls.fromWarehouseId) }}</mat-error>
          </mat-form-field>
        }
        <div class="pair">
          <mat-form-field>
            <mat-label>Vehículo</mat-label>
            <input matInput formControlName="vehicleDescription" />
            <mat-error>{{ controlError(form.controls.vehicleDescription) }}</mat-error>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Chofer</mat-label>
            <input matInput formControlName="driverName" />
            <mat-error>{{ controlError(form.controls.driverName) }}</mat-error>
          </mat-form-field>
        </div>

        <h3>Artículos</h3>
        @for (entry of entries; track entry.line.id) {
          <article class="line">
            <div class="head">
              <div class="item">
                <strong>{{ entry.line.sku }}</strong> {{ entry.line.itemName }}
                <span class="muted">
                  {{ entry.line.shippedQty | qty: entry.line.baseUomCode }} ·
                  {{
                    entry.line.lotNumber
                      ? 'lote ' + entry.line.lotNumber
                      : 'el lote que caduca primero'
                  }}
                </span>
              </div>
              <button matButton type="button" (click)="toggle(entry)">
                <mat-icon>{{ entry.open() ? 'expand_less' : 'expand_more' }}</mat-icon>
                Elegir lotes
              </button>
            </div>
            @if (entry.open()) {
              @if (entry.lots(); as lots) {
                @for (lot of lots; track lot.lotId) {
                  @if (lot.lotId) {
                    <div class="lot">
                      <span>
                        {{ lot.lotNumber }}
                        <span class="muted">
                          @if (lot.expirationDate) {
                            · caduca {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
                          }
                          · hay {{ lot.quantity | qty: entry.line.baseUomCode }}
                        </span>
                      </span>
                      <app-qty-input
                        [formControl]="entry.control(lot.lotId)"
                        [unit]="entry.line.baseUomCode"
                        [max]="lot.quantity"
                        [ariaLabel]="'Cantidad del lote ' + lot.lotNumber"
                      />
                    </div>
                  }
                } @empty {
                  <p class="muted">No hay lotes con existencia.</p>
                }
                <p class="total" [class.error]="!entry.valid()">
                  Elegido {{ entry.total() | qty: entry.line.baseUomCode }} de
                  {{ entry.line.shippedQty | qty: entry.line.baseUomCode }}
                  @if (!entry.valid()) {
                    · debe sumar la cantidad de la línea
                  }
                </p>
              } @else {
                <p class="muted" role="status">Cargando lotes…</p>
              }
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
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .pair {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px 16px;
    }

    h3 {
      margin: 8px 0 0;
      font: var(--mat-sys-title-small);
    }

    .line {
      padding: 8px 0;
      border-bottom: 1px solid var(--pan-row-divider);
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 4px 8px;
    }

    .item {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .lot {
      display: grid;
      grid-template-columns: 1fr minmax(120px, 160px);
      align-items: center;
      gap: 8px;
      padding: 4px 0 0 16px;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .total {
      margin: 4px 0 0 16px;

      &.error {
        color: var(--mat-sys-error);
      }
    }
  `,
})
export class DispatchDialog {
  protected readonly data = inject<DispatchDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DispatchDialog, DispatchResult>>(MatDialogRef);
  private readonly stockApi = inject(StockApi);
  protected readonly controlError = controlError;

  protected readonly form = new FormGroup({
    fromWarehouseId: new FormControl<string | null>(
      this.data.warehouses.length === 1 ? this.data.warehouses[0].id : null,
      this.data.warehouses.length > 0 ? Validators.required : null,
    ),
    vehicleDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    driverName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
  });
  protected readonly entries = this.data.transfer.lines.map((line) => new LineLots(line));
  private readonly allValid = computed(() => this.entries.every((e) => e.valid()));

  constructor() {
    // The lots shown are those of the sub-warehouse it leaves: changing it starts over.
    this.form.controls.fromWarehouseId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      for (const entry of this.entries) {
        entry.reset();
        if (entry.open()) void this.loadLots(entry);
      }
    });
  }

  protected toggle(entry: LineLots): void {
    entry.open.update((open) => !open);
    if (entry.open() && !entry.lots()) void this.loadLots(entry);
  }

  protected submit(): void {
    if (this.form.invalid || !this.allValid()) {
      this.form.markAllAsTouched();
      return;
    }
    const { fromWarehouseId, vehicleDescription, driverName } = this.form.getRawValue();
    const lines = this.entries
      .map((e) => ({ lineId: e.line.id, lots: e.chosen() }))
      .filter((l) => l.lots.length > 0);
    this.ref.close({
      vehicleDescription: vehicleDescription.trim(),
      driverName: driverName.trim(),
      fromWarehouseId,
      lines: lines.length > 0 ? lines : null,
    });
  }

  private async loadLots(entry: LineLots): Promise<void> {
    const locationId = this.form.controls.fromWarehouseId.value ?? this.data.transfer.from.id;
    const lots = await firstValueFrom(this.stockApi.lots(locationId, entry.line.itemId));
    entry.lots.set(lots);
  }
}
