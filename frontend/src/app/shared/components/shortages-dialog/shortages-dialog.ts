import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { StockShortage } from '../../../core/http/problem-details';
import { QtyPipe } from '../../pipes/qty.pipe';

export interface ShortagesDialogData {
  shortages: StockShortage[];
  /** Números de lote que conoce la pantalla (el 409 solo trae `lotId`). */
  lotLabels?: Record<string, string>;
  /** Unidad por artículo, si la pantalla la conoce. */
  units?: Record<string, string>;
}

/** Faltantes de un 409 `insufficient_stock` (spec frontend §6). */
@Component({
  selector: 'app-shortages-dialog',
  imports: [MatDialogModule, MatButtonModule, QtyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Existencia insuficiente</h2>
    <mat-dialog-content>
      <p class="message">
        No hay existencia suficiente para registrar el documento. Ajusta las cantidades e intenta de
        nuevo.
      </p>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Artículo</th>
              <th scope="col">Lote</th>
              <th scope="col" class="end">Solicitado</th>
              <th scope="col" class="end">Disponible</th>
              <th scope="col" class="end">Falta</th>
            </tr>
          </thead>
          <tbody>
            @for (shortage of data.shortages; track $index) {
              <tr>
                <td>{{ shortage.sku }} · {{ shortage.name }}</td>
                <td>{{ lotLabel(shortage.lotId) }}</td>
                <td class="end">{{ shortage.requested | qty: unit(shortage.itemId) }}</td>
                <td class="end">{{ shortage.available | qty: unit(shortage.itemId) }}</td>
                <td class="end shortage">
                  {{ shortage.requested - shortage.available | qty: unit(shortage.itemId) }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Entendido</button>
    </mat-dialog-actions>
  `,
  styleUrl: '../confirm-summary/dialogs.scss',
})
export class ShortagesDialog {
  protected readonly data = inject<ShortagesDialogData>(MAT_DIALOG_DATA);

  protected lotLabel(lotId: string | null): string {
    if (!lotId) {
      return 'Cualquiera';
    }
    return this.data.lotLabels?.[lotId] ?? 'Lote asignado';
  }

  protected unit(itemId: string): string | null {
    return this.data.units?.[itemId] ?? null;
  }
}
