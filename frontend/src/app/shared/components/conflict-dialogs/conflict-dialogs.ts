import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import type { Problem } from '../../../core/http/problem-details';
import { QtyPipe } from '../../pipes/pipes';

/** 409 `concurrency`: someone saved the document first; reload to see the current version (frontend §6). */
@Component({
  selector: 'app-concurrency-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Otro usuario modificó este documento</h2>
    <mat-dialog-content>
      <p>{{ problem.detail }}</p>
      <p>Recarga para ver la versión actual; tus cambios sin guardar se perderán.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cerrar</button>
      <button matButton="filled" type="button" mat-dialog-close="reload" cdkFocusInitial>
        Recargar
      </button>
    </mat-dialog-actions>
  `,
})
export class ConcurrencyDialog {
  protected readonly problem = inject<Problem>(MAT_DIALOG_DATA);
}

/** 409 `insufficient_stock`: what is missing, by item and lot (frontend §6). */
@Component({
  selector: 'app-shortages-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, QtyPipe],
  template: `
    <h2 mat-dialog-title>Existencia insuficiente</h2>
    <mat-dialog-content>
      <p>{{ problem.detail }}</p>
      <div class="table-wrap">
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
            @for (shortage of problem.shortages ?? []; track $index) {
              <tr>
                <td>{{ shortage.sku }} · {{ shortage.name }}</td>
                <td>{{ shortage.lotNumber ?? '—' }}</td>
                <td class="end">{{ shortage.requested | qty }}</td>
                <td class="end">{{ shortage.available | qty }}</td>
                <td class="end missing">{{ shortage.requested - shortage.available | qty }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" type="button" mat-dialog-close cdkFocusInitial>Entendido</button>
    </mat-dialog-actions>
  `,
  styles: `
    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      padding: 8px;
      border-bottom: 1px solid var(--pan-row-divider);
      text-align: left;
    }

    .end {
      text-align: right;
    }

    .missing {
      color: var(--mat-sys-error);
      font-weight: 700;
    }
  `,
})
export class ShortagesDialog {
  protected readonly problem = inject<Problem>(MAT_DIALOG_DATA);
}

/** Opens the dialog of a 409; used by ConflictHandler, which loads this file only when needed. */
export function openConflictDialog(injector: Injector, problem: Problem, reload: () => void): void {
  const dialog = injector.get(MatDialog);
  if (problem.code === 'insufficient_stock') {
    dialog.open(ShortagesDialog, { data: problem, width: '720px', maxWidth: '95vw' });
    return;
  }
  dialog
    .open(ConcurrencyDialog, { data: problem, width: '480px', maxWidth: '95vw' })
    .afterClosed()
    .subscribe((result) => {
      if (result === 'reload') reload();
    });
}
