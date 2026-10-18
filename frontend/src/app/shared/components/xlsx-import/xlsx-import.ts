import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable, firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { toProblem } from '../../../core/http/problem-details';
import { downloadBlob } from '../../data-access/csv';

export type ImportError = Schemas['ImportError'];

/** What the server answers when validating: rows, errors (they block) and warnings (they need confirming). */
export interface XlsxPreview {
  rowCount: number;
  errors: readonly ImportError[];
  warnings: readonly { row: number | null; message: string }[];
}

export type XlsxStep = 'file' | 'review' | 'done';

/** RN-90: up to 5 MB. */
export const XLSX_MAX_BYTES = 5 * 1024 * 1024;

/** RN-91/RN-93: errors block; warnings allow continuing only once acknowledged. */
export function canImport(preview: XlsxPreview | null, acknowledged: boolean): boolean {
  if (!preview || preview.errors.length > 0) return false;
  return preview.warnings.length === 0 || acknowledged;
}

/**
 * `app-xlsx-import` (frontend §7.4.4, §8): Excel import in three steps validated by the server. 1) template and file
 * (`.xlsx`, up to 5 MB, drag and drop on desktop), sent to `validate`; 2) review: with errors a filterable table and
 * "Elegir otro archivo"; without them the warnings with the "Entiendo los avisos…" checkbox and the projected content
 * (`[preview]`: what will be created, options); 3) the projected result (`[result]`). The file stays in memory to send
 * it again on `submit` (the server revalidates).
 */
@Component({
  selector: 'app-xlsx-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './xlsx-import.html',
  styleUrl: './xlsx-import.scss',
})
export class XlsxImport<P extends XlsxPreview, R> {
  readonly templateName = input.required<string>();
  readonly template = input.required<() => Observable<Blob>>();
  readonly validate = input.required<(file: File) => Observable<P>>();
  readonly submit = input.required<(file: File, confirmWarnings: boolean) => Observable<R>>();
  readonly submitLabel = input('Importar');
  readonly validated = output<P | null>();
  readonly imported = output<R>();

  protected readonly step = signal<XlsxStep>('file');
  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<P | null>(null);
  protected readonly acknowledged = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly errorFilter = signal('');

  protected readonly errors = computed(() => {
    const filter = this.errorFilter().trim().toLowerCase();
    const errors = this.preview()?.errors ?? [];
    return filter
      ? errors.filter((e) =>
          `${e.row} ${e.column ?? ''} ${e.message}`.toLowerCase().includes(filter),
        )
      : errors;
  });
  protected readonly ready = computed(() => canImport(this.preview(), this.acknowledged()));

  protected async downloadTemplate(): Promise<void> {
    downloadBlob(this.templateName(), await firstValueFrom(this.template()()));
  }

  protected choose(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) void this.load(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.load(file);
  }

  protected async send(): Promise<void> {
    const file = this.file();
    if (!file || !this.ready()) return;
    this.busy.set(true);
    this.failure.set(null);
    try {
      const result = await firstValueFrom(this.submit()(file, this.acknowledged()));
      this.step.set('done');
      this.imported.emit(result);
    } catch (error) {
      const problem = toProblem(error);
      // The file changed between validating and importing: show the new errors.
      if (problem.status === 400 && problem.rowErrors) {
        const preview = { ...this.preview()!, errors: problem.rowErrors };
        this.preview.set(preview);
        this.validated.emit(preview);
      } else if (
        error instanceof HttpErrorResponse &&
        (error.status === 400 || error.status === 422)
      )
        this.failure.set(problem.detail ?? 'No se pudo importar el archivo.');
    } finally {
      this.busy.set(false);
    }
  }

  protected restart(): void {
    this.step.set('file');
    this.file.set(null);
    this.preview.set(null);
    this.acknowledged.set(false);
    this.failure.set(null);
    this.errorFilter.set('');
    this.validated.emit(null);
  }

  private async load(file: File): Promise<void> {
    this.restart();
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.failure.set('Elige un archivo de Excel (.xlsx).');
      return;
    }
    if (file.size > XLSX_MAX_BYTES) {
      this.failure.set('El archivo pesa más de 5 MB.');
      return;
    }
    this.file.set(file);
    this.busy.set(true);
    try {
      const preview = await firstValueFrom(this.validate()(file));
      this.preview.set(preview);
      this.step.set('review');
      this.validated.emit(preview);
    } catch (error) {
      this.failure.set(toProblem(error).detail ?? 'El archivo no se pudo leer.');
    } finally {
      this.busy.set(false);
    }
  }
}
