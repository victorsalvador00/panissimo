import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { toProblem } from '../../../core/http/problem-details';
import { CsvDocument, buildCsv, downloadText, parseCsv } from '../../data-access/csv';

export type ImportError = Schemas['ImportError'];

export interface CsvColumnGuide {
  column: string;
  required?: boolean;
  description: string;
}

const previewRows = 20;

/**
 * CSV import (frontend §8): template generated in the browser (with BOM), value guide, preview of the first 20 rows
 * and, if the backend rejects the file (400 `import_invalid`), the table of errors by row. The import is all or
 * nothing: with errors nothing is saved. The page shows the result it receives in `imported`.
 */
@Component({
  selector: 'app-csv-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.scss',
})
export class CsvImport<T> {
  readonly templateName = input.required<string>();
  readonly columns = input.required<readonly string[]>();
  readonly exampleRows = input<readonly (readonly string[])[]>([]);
  readonly guide = input<readonly CsvColumnGuide[]>([]);
  /** Sends the file to the backend. */
  readonly upload = input.required<(file: File) => Observable<T>>();
  readonly imported = output<T>();

  protected readonly file = signal<File | null>(null);
  protected readonly document = signal<CsvDocument | null>(null);
  protected readonly errors = signal<ImportError[]>([]);
  protected readonly failure = signal<string | null>(null);
  protected readonly uploading = signal(false);

  protected readonly preview = computed(() => this.document()?.rows.slice(0, previewRows) ?? []);
  protected readonly rowCount = computed(() => this.document()?.rows.length ?? 0);
  /** Columns of the file the backend does not know (typos), to warn before uploading. */
  protected readonly unknownColumns = computed(() => {
    const known = new Set(this.columns());
    return (this.document()?.headers ?? []).filter((h) => h && !known.has(h));
  });

  protected downloadTemplate(): void {
    downloadText(this.templateName(), buildCsv(this.columns(), this.exampleRows()));
  }

  protected async choose(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.reset();
    if (!file) return;
    this.file.set(file);
    this.document.set(parseCsv(await file.text()));
  }

  protected async send(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.uploading.set(true);
    this.errors.set([]);
    this.failure.set(null);
    try {
      const result = await firstValueFrom(this.upload()(file));
      this.reset();
      this.imported.emit(result);
    } catch (error) {
      const problem = toProblem(error);
      if (problem.status === 400 && problem.rowErrors) this.errors.set(problem.rowErrors);
      else if (error instanceof HttpErrorResponse && error.status === 400)
        this.failure.set(problem.detail ?? 'El archivo no se pudo leer.');
    } finally {
      this.uploading.set(false);
    }
  }

  protected reset(): void {
    this.file.set(null);
    this.document.set(null);
    this.errors.set([]);
    this.failure.set(null);
  }
}
