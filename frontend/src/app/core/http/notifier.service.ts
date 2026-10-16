import { EnvironmentInjector, inject, Injectable } from '@angular/core';

/**
 * Avisos breves (toasts) en la parte inferior de la pantalla. `MatSnackBar` se carga la primera vez
 * que se usa: arrastra overlay, botón y animaciones, y no hace falta en el arranque.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly injector = inject(EnvironmentInjector);

  success(message: string): void {
    void this.open(message, 4000, 'sgo-toast-success');
  }

  error(message: string): void {
    void this.open(message, 8000, 'sgo-toast-error');
  }

  private async open(message: string, duration: number, panelClass: string): Promise<void> {
    const { MatSnackBar } = await import('@angular/material/snack-bar');
    try {
      this.injector.get(MatSnackBar).open(message, 'Cerrar', { duration, panelClass });
    } catch {
      // La app (o la prueba) se destruyó mientras cargaba el módulo: ya no hay dónde mostrarlo.
    }
  }
}
