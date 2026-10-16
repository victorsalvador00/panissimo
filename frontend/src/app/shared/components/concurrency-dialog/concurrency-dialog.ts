import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

/** 409 `concurrency` (spec frontend §6): el documento cambió; cerrar con `true` = recargar. */
@Component({
  selector: 'app-concurrency-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Otro usuario modificó este documento</h2>
    <mat-dialog-content>
      <p>
        Mientras lo tenías abierto, alguien más guardó cambios. Recarga el documento para ver la
        versión actual; tus cambios sin guardar se perderán.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cerrar</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true" cdkFocusInitial>
        Recargar
      </button>
    </mat-dialog-actions>
  `,
})
export class ConcurrencyDialog {}
