import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface SummaryItem {
  label: string;
  value: string;
}

export interface ConfirmSummaryData {
  title: string;
  /** Texto que explica la consecuencia: "Se descontará la existencia del origen." */
  message?: string;
  items?: SummaryItem[];
  /** Tabla opcional con las líneas que se registrarán. */
  lines?: { headers: string[]; rows: string[][]; alignEnd?: number[] };
  confirmLabel: string;
  cancelLabel?: string;
  /** `false` para avisos que solo se aceptan (ej. el resultado de una acción). */
  showCancel?: boolean;
  /** `warn` para acciones destructivas (cancelar, rechazar). */
  tone?: 'primary' | 'warn';
}

/**
 * Confirmación de acciones irreversibles con el resumen de lo que se va a registrar
 * (spec frontend §4). Se abre con `ConfirmService.confirm(...)`, que devuelve `true` al confirmar.
 */
@Component({
  selector: 'app-confirm-summary',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p class="message">{{ data.message }}</p>
      }
      @if (data.items?.length) {
        <dl>
          @for (item of data.items; track item.label) {
            <div>
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          }
        </dl>
      }
      @if (data.lines; as lines) {
        <div class="scroll">
          <table>
            <thead>
              <tr>
                @for (header of lines.headers; track $index) {
                  <th scope="col" [class.end]="lines.alignEnd?.includes($index)">{{ header }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of lines.rows; track $index) {
                <tr>
                  @for (cell of row; track $index) {
                    <td [class.end]="lines.alignEnd?.includes($index)">{{ cell }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.showCancel !== false) {
        <button mat-button type="button" [mat-dialog-close]="false">
          {{ data.cancelLabel ?? 'Volver' }}
        </button>
      }
      <button
        mat-flat-button
        type="button"
        [class.warn]="data.tone === 'warn'"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styleUrl: './dialogs.scss',
})
export class ConfirmSummary {
  protected readonly data = inject<ConfirmSummaryData>(MAT_DIALOG_DATA);
}
