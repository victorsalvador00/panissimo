import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CsvColumnGuide, CsvImport } from '../../../shared/components/csv-import/csv-import';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { AdjustmentsApi, InitialStockResult } from '../data-access/inventory-api';

const columns = ['ubicacion', 'sku', 'cantidad', 'costo_unitario', 'lote', 'caducidad'];
const exampleRows = [
  ['PLANTA-MP', 'HARINA-T', '250', '18.50', 'L-0915', '15/03/2027'],
  ['SUC-01', 'CONCHA-G', '40', '6.20', '', ''],
];
const guide: CsvColumnGuide[] = [
  {
    column: 'ubicacion',
    required: true,
    description:
      'Código de la ubicación donde está la existencia; en una planta con subalmacenes, el del subalmacén.',
  },
  { column: 'sku', required: true, description: 'SKU del artículo.' },
  {
    column: 'cantidad',
    required: true,
    description: 'En unidad base, mayor que 0; entera si la unidad es pza.',
  },
  { column: 'costo_unitario', required: true, description: 'Costo por unidad base, en pesos.' },
  {
    column: 'lote',
    description: 'Para artículos con lote: número de lote (vacío: el sistema asigna uno).',
  },
  { column: 'caducidad', description: 'Para artículos con lote: dd/mm/aaaa o aaaa-mm-dd.' },
];

/**
 * /inventario/existencias-iniciales (frontend §7.3, RN-08): initial stock by CSV, one correction adjustment per
 * location; all or nothing. An item that already has movements at that location is rejected.
 */
@Component({
  selector: 'app-initial-stock-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, PageHeader, CsvImport],
  template: `
    <app-page-header title="Existencias iniciales" />

    @if (result(); as result) {
      <section class="pan-card result" role="status" aria-labelledby="initial-result">
        <h2 id="initial-result">Existencias registradas</h2>
        <p>
          {{ result.lines }} {{ result.lines === 1 ? 'línea' : 'líneas' }} en
          {{ result.adjustmentFolios.length }}
          {{ result.adjustmentFolios.length === 1 ? 'ajuste' : 'ajustes' }} de corrección:
          {{ result.adjustmentFolios.join(', ') }}.
        </p>
        <a matButton="tonal" routerLink="/inventario/ajustes">Ver ajustes</a>
      </section>
    }

    <app-csv-import
      templateName="plantilla-existencias-iniciales.csv"
      [columns]="columns"
      [exampleRows]="exampleRows"
      [guide]="guide"
      [upload]="upload"
      (imported)="result.set($event)"
    />
  `,
  styles: `
    .result {
      margin-bottom: 16px;
      border-left: 4px solid var(--pan-status-green-fg);
    }

    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }
  `,
})
export class InitialStockPage {
  private readonly api = inject(AdjustmentsApi);

  protected readonly columns = columns;
  protected readonly exampleRows = exampleRows;
  protected readonly guide = guide;
  protected readonly result = signal<InitialStockResult | null>(null);
  protected readonly upload = (file: File) => {
    this.result.set(null);
    return this.api.importInitialStock(file);
  };
}
