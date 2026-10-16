import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { LotStock, StockApi } from '../data-access/stock.api';

/**
 * Lote de una salida: los lotes con existencia del artículo en la ubicación, o "Automático (FEFO)"
 * (`null`: el backend toma primero el que caduca antes). Emite los lotes cargados para que la página
 * pueda nombrarlos en el diálogo de faltantes.
 */
@Component({
  selector: 'app-lot-select',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, DatePipe, QtyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" floatLabel="always">
      <mat-label>Lote</mat-label>
      <mat-select [formControl]="control()" placeholder="Automático (primero en caducar)">
        <mat-option [value]="null">Automático (primero en caducar)</mat-option>
        @for (lot of lots.value() ?? []; track lot.lotId) {
          @if (lot.lotId) {
            <mat-option [value]="lot.lotId" [disabled]="lot.isExpired && !allowExpired()">
              {{ lot.lotNumber }}
              @if (lot.expirationDate) {
                · cad. {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
              }
              · {{ lot.quantity | qty: uom() }}
              @if (lot.isExpired) {
                (vencido)
              }
            </mat-option>
          }
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    mat-form-field {
      width: 100%;
    }
  `,
})
export class LotSelect {
  private readonly api = inject(StockApi);

  readonly control = input.required<FormControl<string | null>>();
  readonly locationId = input.required<string | null>();
  readonly itemId = input.required<string>();
  readonly uom = input('');
  /** Un lote vencido solo se puede dar de baja (RN-05): se permite con el motivo "Caducado". */
  readonly allowExpired = input(false);
  readonly loaded = output<LotStock[]>();

  protected readonly lots = rxResource({
    params: () => {
      const locationId = this.locationId();
      return locationId ? { locationId, itemId: this.itemId() } : undefined;
    },
    stream: ({ params }) => this.api.lots(params.locationId, params.itemId),
  });

  constructor() {
    effect(() => {
      const lots = this.lots.value();
      if (lots) {
        this.loaded.emit(lots);
        const selected = this.control().value;
        if (selected && !lots.some((lot) => lot.lotId === selected)) {
          this.control().setValue(null);
        }
      }
    });
  }
}
