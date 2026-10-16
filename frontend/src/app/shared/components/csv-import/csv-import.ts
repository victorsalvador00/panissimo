import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { ImportRowError, toProblem } from '../../../core/http/problem-details';
import { CsvTable, downloadText, parseCsv, toCsv } from '../../data-access/csv';

/** Tamaño máximo que aceptan las importaciones del backend (`ImportsController.MaxFileBytes`). */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const PREVIEW_ROWS = 20;

export interface CsvColumnGuide {
  column: string;
  values: string;
}

/** Revisión rápida del encabezado en el navegador (el backend valida todo al importar). */
export function headerProblems(
  headers: string[],
  columns: readonly string[],
  required: readonly string[],
): string[] {
  const problems: string[] = [];
  const missing = required.filter((column) => !headers.includes(column));
  const unknown = headers.filter((h) => !columns.includes(h));
  if (missing.length) {
    problems.push(`Faltan columnas obligatorias: ${missing.join(', ')}.`);
  }
  if (unknown.length) {
    problems.push(`Columnas desconocidas: ${unknown.join(', ')}.`);
  }
  return problems;
}

/**
 * Importación CSV "todo o nada" (spec frontend §7.2/§7.3): plantilla descargable con guía de columnas,
 * vista previa, envío y tabla de errores por fila (400 `import_invalid` con `rowErrors`). Emite
 * `imported` con el resultado; la página muestra qué se importó.
 */
@Component({
  selector: 'app-csv-import',
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './csv-import.html',
  styleUrl: './csv-import.scss',
})
export class CsvImport<R> {
  readonly columns = input.required<readonly string[]>();
  readonly required = input.required<readonly string[]>();
  readonly guide = input.required<CsvColumnGuide[]>();
  readonly exampleRows = input<string[][]>([]);
  readonly templateName = input.required<string>();
  /** Texto de "1. Prepara el archivo" (qué hace la importación). */
  readonly intro = input('');
  readonly upload = input.required<(file: File) => Observable<R>>();

  readonly imported = output<R>();

  protected readonly file = signal<File | null>(null);
  protected readonly table = signal<CsvTable | null>(null);
  protected readonly fileError = signal<string | null>(null);
  protected readonly importing = signal(false);
  protected readonly done = signal(false);
  protected readonly rowErrors = signal<ImportRowError[]>([]);
  protected readonly importError = signal<string | null>(null);

  protected readonly preview = computed(() => this.table()?.rows.slice(0, PREVIEW_ROWS) ?? []);
  protected readonly totalRows = computed(() => this.table()?.rows.length ?? 0);
  protected readonly headerWarnings = computed(() => {
    const table = this.table();
    return table ? headerProblems(table.headers, this.columns(), this.required()) : [];
  });
  protected readonly errorLines = computed(() => new Set(this.rowErrors().map((e) => e.row)));

  protected downloadTemplate(): void {
    downloadText(this.templateName(), toCsv([...this.columns()], this.exampleRows()));
  }

  protected async onFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.reset();
    if (!file) {
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      this.fileError.set('El archivo pesa más de 2 MB. Divídelo en varios archivos.');
      return;
    }
    const table = parseCsv(await file.text());
    if (!table.headers.length || !table.rows.length) {
      this.fileError.set('El archivo está vacío o no tiene filas de datos.');
      return;
    }
    this.file.set(file);
    this.table.set(table);
  }

  protected import(): void {
    const file = this.file();
    if (!file || this.importing()) {
      return;
    }
    this.importing.set(true);
    this.rowErrors.set([]);
    this.importError.set(null);
    this.upload()(file).subscribe({
      next: (result) => {
        this.importing.set(false);
        this.done.set(true);
        this.imported.emit(result);
      },
      error: (error: unknown) => {
        this.importing.set(false);
        const problem = toProblem(error);
        if (problem?.rowErrors?.length) {
          this.rowErrors.set(problem.rowErrors);
        } else if (problem?.status === 400) {
          this.importError.set(problem.detail ?? 'El archivo no es válido.');
        }
      },
    });
  }

  protected reset(): void {
    this.file.set(null);
    this.table.set(null);
    this.fileError.set(null);
    this.done.set(false);
    this.rowErrors.set([]);
    this.importError.set(null);
  }
}
