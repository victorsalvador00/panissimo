import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';
import { toProblem } from '../../core/http/problem-details';
import { ConcurrencyDialog } from './concurrency-dialog/concurrency-dialog';
import { ConfirmSummary, ConfirmSummaryData } from './confirm-summary/confirm-summary';
import { ShortagesDialog, ShortagesDialogData } from './shortages-dialog/shortages-dialog';

/** Abre la confirmación de acciones irreversibles; emite `true` si el usuario confirma. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  confirm(data: ConfirmSummaryData): Observable<boolean> {
    return this.dialog
      .open<ConfirmSummary, ConfirmSummaryData, boolean>(ConfirmSummary, {
        data,
        width: '560px',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .pipe(map((confirmed) => confirmed === true));
  }
}

export interface ConflictOptions {
  /** Se llama si el usuario elige "Recargar" en un 409 `concurrency`. */
  reload?: () => void;
  lotLabels?: ShortagesDialogData['lotLabels'];
  units?: ShortagesDialogData['units'];
}

/**
 * Muestra el diálogo que corresponde a un 409 (spec frontend §6). Devuelve `true` si lo manejó;
 * `false` si el error no es un 409 conocido y la pantalla debe tratarlo.
 */
@Injectable({ providedIn: 'root' })
export class ConflictHandler {
  private readonly dialog = inject(MatDialog);

  handle(error: unknown, options: ConflictOptions = {}): boolean {
    const problem = toProblem(error);
    if (problem?.code === 'insufficient_stock') {
      this.dialog.open<ShortagesDialog, ShortagesDialogData>(ShortagesDialog, {
        data: {
          shortages: problem.shortages ?? [],
          lotLabels: options.lotLabels,
          units: options.units,
        },
        width: '720px',
        maxWidth: 'calc(100vw - 32px)',
      });
      return true;
    }
    if (problem?.code === 'concurrency') {
      this.dialog
        .open<ConcurrencyDialog, void, boolean>(ConcurrencyDialog, {
          maxWidth: 'calc(100vw - 32px)',
        })
        .afterClosed()
        .subscribe((reload) => {
          if (reload) {
            (options.reload ?? (() => window.location.reload()))();
          }
        });
      return true;
    }
    return false;
  }
}
