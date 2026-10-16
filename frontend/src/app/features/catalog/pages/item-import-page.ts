import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CsvImport } from '../../../shared/components/csv-import/csv-import';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ItemImportResult, ItemsApi } from '../data-access/items.api';
import {
  ITEM_IMPORT_COLUMNS,
  ITEM_IMPORT_EXAMPLE_ROWS,
  ITEM_IMPORT_GUIDE,
  ITEM_IMPORT_REQUIRED,
} from '../ui/item-import-template';

/** Importación de artículos por CSV (spec frontend §7.2): plantilla, vista previa y errores por fila. */
@Component({
  selector: 'app-item-import-page',
  imports: [RouterLink, MatButtonModule, PageHeader, CsvImport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        title="Importar artículos"
        subtitle="Alta o actualización masiva desde un archivo CSV. Si hay un solo error, no se importa nada."
        [crumbs]="[
          { label: 'Catálogos' },
          { label: 'Artículos', url: '/catalogos/articulos' },
          { label: 'Importar' },
        ]"
      />
      <app-csv-import
        [columns]="columns"
        [required]="required"
        [guide]="guide"
        [exampleRows]="exampleRows"
        templateName="plantilla-articulos.csv"
        intro="Los artículos cuyo SKU ya existe se actualizan; los demás se crean."
        [upload]="upload"
        (imported)="result.set($event)"
      />
      @if (result(); as done) {
        <p class="notice notice-info" role="status">
          {{ done.created }} artículos creados y {{ done.updated }} actualizados.
          <a mat-button routerLink="/catalogos/articulos">Ver artículos</a>
        </p>
      }
    </section>
  `,
})
export class ItemImportPage {
  private readonly api = inject(ItemsApi);

  protected readonly columns = ITEM_IMPORT_COLUMNS;
  protected readonly required = ITEM_IMPORT_REQUIRED;
  protected readonly guide = ITEM_IMPORT_GUIDE;
  protected readonly exampleRows = ITEM_IMPORT_EXAMPLE_ROWS;
  protected readonly upload = (file: File) => this.api.import(file);
  protected readonly result = signal<ItemImportResult | null>(null);
}
