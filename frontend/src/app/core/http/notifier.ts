import { Injectable, Injector, inject } from '@angular/core';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';

/**
 * Short notices at the bottom of the screen (snackbar). Errors stay until closed; information hides itself.
 * The snackbar is loaded on the first notice, so it stays out of the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly injector = inject(Injector);

  info(message: string): void {
    void this.open(message, { duration: 5000, politeness: 'polite' });
  }

  error(message: string): void {
    void this.open(message, { politeness: 'assertive', panelClass: 'pan-snack-error' });
  }

  private async open(message: string, config: MatSnackBarConfig): Promise<void> {
    const { MatSnackBar } = await import('@angular/material/snack-bar');
    this.injector.get(MatSnackBar).open(message, 'Cerrar', config);
  }
}
