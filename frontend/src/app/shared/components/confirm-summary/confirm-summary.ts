import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

export interface SummaryRow {
  label: string;
  value: string;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** What will be recorded (frontend §4.3): origin, destination, lines, totals… */
  summary?: readonly SummaryRow[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Cancel, reject: the confirm button in the error color. */
  destructive?: boolean;
}

/** Confirmation of an irreversible action with the summary of what will be recorded (frontend §4.3, §8). */
@Component({
  selector: 'app-confirm-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p>{{ data.message }}</p>
      }
      @if (data.summary?.length) {
        <dl class="summary">
          @for (row of data.summary; track $index) {
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          }
        </dl>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="false">
        {{ data.cancelLabel ?? 'Cancelar' }}
      </button>
      <button
        matButton="filled"
        type="button"
        [class.destructive]="data.destructive"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >
        {{ data.confirmLabel ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 16px;
      margin: 0;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--pan-soft-bg);
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
    }

    dd {
      margin: 0;
      font-weight: 600;
    }

    .destructive {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmSummary {
  protected readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  /** Resolves true only when the user confirms. */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<ConfirmSummary, ConfirmOptions, boolean>(ConfirmSummary, {
      data: options,
      width: '480px',
      maxWidth: '95vw',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
