import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CsvColumnGuide, CsvImport } from '../../../shared/components/csv-import/csv-import';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { AdjustmentsApi, InitialStockImportResult } from '../data-access/adjustments.api';

/** Columnas del CSV que espera el backend (`InitialStockImportService.Columns`). */
export const INITIAL_STOCK_COLUMNS = [
  'ubicacion',
  'sku',
  'cantidad',
  'costo_unitario',
  'lote',
  'caducidad',
] as const;
export const INITIAL_STOCK_REQUIRED = ['ubicacion', 'sku', 'cantidad', 'costo_unitario'];

export const INITIAL_STOCK_GUIDE: CsvColumnGuide[] = [
  { column: 'ubicacion', values: 'Obligatorio: código de la ubicación (ej. SUC-01).' },
  { column: 'sku', values: 'Obligatorio: SKU de un artículo existente.' },
  {
    column: 'cantidad',
    values: 'Obligatorio: mayor que 0, en la unidad base. Punto decimal (ej. 12.5).',
  },
  { column: 'costo_unitario', values: 'Obligatorio: costo por unidad base, ≥ 0 (ej. 18.75).' },
  { column: 'lote', values: 'Obligatorio si el artículo maneja lotes.' },
  { column: 'caducidad', values: 'Opcional: aaaa-mm-dd o dd/mm/aaaa.' },
];

export const INITIAL_STOCK_EXAMPLE: string[][] = [
  ['SUC-01', 'AZU-001', '25', '18.50', '', ''],
  ['COM', 'HAR-001', '100', '14.20', 'L-2409', '2026-12-31'],
];

/** Existencias iniciales por CSV (spec frontend §7.3): crea un ajuste por ubicación. */
@Component({
  selector: 'app-initial-stock-page',
  imports: [RouterLink, MatButtonModule, PageHeader, CsvImport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        title="Existencias iniciales"
        subtitle="Carga única de existencias al empezar a usar el sistema. Si hay un solo error, no se carga nada."
      />
      <app-csv-import
        [columns]="columns"
        [required]="required"
        [guide]="guide"
        [exampleRows]="example"
        templateName="plantilla-existencias-iniciales.csv"
        intro="Cada fila suma existencia con su costo; se registra como ajuste por corrección, uno por ubicación."
        [upload]="upload"
        (imported)="result.set($event)"
      />
      @if (result(); as done) {
        <div class="notice notice-info" role="status">
          Se cargaron {{ done.lines }} líneas en {{ done.adjustmentFolios.length }}
          {{ done.adjustmentFolios.length === 1 ? 'ajuste' : 'ajustes' }}:
          {{ done.adjustmentFolios.join(', ') }}.
          <a mat-button routerLink="/inventario/existencias">Ver existencias</a>
          <a mat-button routerLink="/inventario/ajustes">Ver ajustes</a>
        </div>
      }
    </section>
  `,
})
export class InitialStockPage {
  private readonly api = inject(AdjustmentsApi);

  protected readonly columns = INITIAL_STOCK_COLUMNS;
  protected readonly required = INITIAL_STOCK_REQUIRED;
  protected readonly guide = INITIAL_STOCK_GUIDE;
  protected readonly example = INITIAL_STOCK_EXAMPLE;
  protected readonly upload = (file: File) => this.api.importInitialStock(file);
  protected readonly result = signal<InitialStockImportResult | null>(null);
}
