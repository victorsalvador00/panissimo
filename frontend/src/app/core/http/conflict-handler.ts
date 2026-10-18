import { Injectable, Injector, inject } from '@angular/core';
import { Problem, toProblem } from './problem-details';

export interface ConflictOptions {
  /** What "Recargar" does; by default the page reloads. */
  reload?: () => void;
}

/**
 * Dialogs of a 409 (frontend §6): `concurrency` offers to reload and `insufficient_stock` lists the shortages. The
 * error interceptor uses it for every request; a screen that sends `SILENT_ERRORS` can call it with its own reload.
 * The dialogs load on first use, outside the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ConflictHandler {
  private readonly injector = inject(Injector);

  /** Opens the dialog and returns true when the error is one of these conflicts. */
  handle(error: unknown, options: ConflictOptions = {}): boolean {
    const problem = toProblem(error);
    if (!isConflictWithDialog(problem)) return false;
    void this.open(problem, options.reload ?? (() => window.location.reload()));
    return true;
  }

  private async open(problem: Problem, reload: () => void): Promise<void> {
    const { openConflictDialog } =
      await import('../../shared/components/conflict-dialogs/conflict-dialogs');
    openConflictDialog(this.injector, problem, reload);
  }
}

export function isConflictWithDialog(problem: Problem): boolean {
  return (
    problem.status === 409 &&
    (problem.code === 'concurrency' || problem.code === 'insufficient_stock')
  );
}
