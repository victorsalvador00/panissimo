import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CsvColumnGuide, CsvImport } from '../../../shared/components/csv-import/csv-import';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ItemImportResult, ItemsApi } from '../data-access/catalog-api';

/** Columns of the backend item import (ItemImportService.Columns), in template order. */
const columns = [
  'sku',
  'sku_interno',
  'nombre',
  'tipo',
  'categoria',
  'unidad_base',
  'unidad_compra',
  'factor_compra',
  'maneja_lotes',
  'vida_util_dias',
  'almacenamiento',
  'iva',
  'presentacion',
  'sku_granel',
  'piezas_por_paquete',
  'area',
  'multiplo_op',
  'gramaje_g',
];

const exampleRows = [
  [
    'HARINA-T',
    'MP-001',
    'Harina de trigo',
    'materia_prima',
    'Harinas',
    'kg',
    'bulto',
    '25',
    'si',
    '180',
    'ambiente',
    '0',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'CONCHA-G',
    'PT-010',
    'Concha a granel',
    'terminado',
    'Pan dulce',
    'pza',
    '',
    '',
    'si',
    '3',
    'ambiente',
    '0',
    'granel',
    '',
    '',
    'PAN-DULCE',
    '12',
    '70',
  ],
  [
    'CONCHA-6',
    'PT-011',
    'Concha paquete de 6',
    'terminado',
    'Pan dulce',
    'pza',
    '',
    '',
    'si',
    '3',
    'ambiente',
    '0',
    'empaquetado',
    'CONCHA-G',
    '6',
    'PAN-DULCE',
    '',
    '420',
  ],
];

const guide: CsvColumnGuide[] = [
  {
    column: 'sku',
    required: true,
    description: 'Letras, números, punto, guion y guion bajo. Si ya existe, se actualiza.',
  },
  {
    column: 'sku_interno',
    required: true,
    description: 'Código de Paníssimo, único. La fila sin él se omite y se reporta.',
  },
  { column: 'nombre', required: true, description: 'Hasta 200 caracteres.' },
  {
    column: 'tipo',
    required: true,
    description: 'materia_prima, insumo, semiterminado o terminado.',
  },
  { column: 'categoria', required: true, description: 'Nombre de una categoría activa.' },
  { column: 'unidad_base', required: true, description: 'Código de la unidad (kg, l, pza…).' },
  {
    column: 'unidad_compra',
    description: 'Código de la unidad en que se compra; vacío si es la misma.',
  },
  { column: 'factor_compra', description: 'Unidades base por unidad de compra (25 kg por bulto).' },
  { column: 'maneja_lotes', description: 'si o no (no por omisión).' },
  { column: 'vida_util_dias', description: 'Número entero de días.' },
  {
    column: 'almacenamiento',
    description: 'ambiente, refrigerado o congelado (ambiente por omisión).',
  },
  { column: 'iva', description: '0 o 16 (0 por omisión).' },
  {
    column: 'presentacion',
    description: 'Solo productos terminados: granel o empaquetado (obligatoria en ellos).',
  },
  {
    column: 'sku_granel',
    description: 'Empaquetados: SKU de su versión a granel (existente o en el mismo archivo).',
  },
  { column: 'piezas_por_paquete', description: 'Empaquetados: número entero de piezas.' },
  {
    column: 'area',
    description: 'Semiterminados y terminados: código o nombre del área de producción.',
  },
  { column: 'multiplo_op', description: 'Múltiplo de las órdenes de producción, en unidad base.' },
  { column: 'gramaje_g', description: 'Peso por pieza en gramos.' },
];

/** /catalogos/articulos/importar (frontend §7.2): item CSV, all or nothing. */
@Component({
  selector: 'app-items-import-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, PageHeader, CsvImport],
  template: `
    <app-page-header title="Importar artículos" />

    @if (result(); as result) {
      <section class="pan-card result" role="status" aria-labelledby="import-result">
        <h2 id="import-result">Importación terminada</h2>
        <p>
          {{ result.created }}
          {{ result.created === 1 ? 'artículo creado' : 'artículos creados' }} y
          {{ result.updated }} {{ result.updated === 1 ? 'actualizado' : 'actualizados' }}.
        </p>
        @if (result.skipped.length > 0) {
          <p>
            {{ result.skipped.length }}
            {{ result.skipped.length === 1 ? 'fila omitida' : 'filas omitidas' }}:
          </p>
          <ul>
            @for (skipped of result.skipped; track $index) {
              <li>Fila {{ skipped.row }}: {{ skipped.message }}</li>
            }
          </ul>
        }
        <a matButton="tonal" routerLink="/catalogos/articulos">Ver artículos</a>
      </section>
    }

    <app-csv-import
      templateName="plantilla-articulos.csv"
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
export class ItemsImportPage {
  private readonly api = inject(ItemsApi);

  protected readonly columns = columns;
  protected readonly exampleRows = exampleRows;
  protected readonly guide = guide;
  protected readonly result = signal<ItemImportResult | null>(null);
  protected readonly upload = (file: File) => {
    this.result.set(null);
    return this.api.importCsv(file);
  };
}
