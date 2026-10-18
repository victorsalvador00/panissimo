import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { XlsxImport } from '../../../shared/components/xlsx-import/xlsx-import';
import { QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { ImportPreview, ImportResult, OrderImportsApi } from '../data-access/production-api';

/**
 * /produccion/importar (frontend §7.4.4, RN-90..RN-95): production orders from Excel with `app-xlsx-import`. The
 * review shows "N filas → M órdenes", the orders to create and, for whoever manages orders, "Liberar las órdenes al
 * importar". The result brings the import folio and "Ver órdenes" (the list filtered by the import).
 */
@Component({
  selector: 'app-orders-import-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    PageHeader,
    XlsxImport,
    QtyPipe,
    StatusLabelPipe,
  ],
  template: `
    <app-page-header title="Importar órdenes de producción">
      <a matButton routerLink="/produccion/importaciones">
        <mat-icon>history</mat-icon>
        Historial
      </a>
    </app-page-header>

    <app-xlsx-import
      templateName="plantilla-ordenes-produccion.xlsx"
      [template]="template"
      [validate]="validate"
      [submit]="submit"
      submitLabel="Importar órdenes"
      (validated)="preview.set($event)"
      (imported)="result.set($event)"
    >
      @if (preview(); as p) {
        <div preview class="preview">
          <p class="summary" role="status">
            {{ p.rowCount }} {{ p.rowCount === 1 ? 'fila' : 'filas' }} →
            <strong>{{ p.orderCount }} {{ p.orderCount === 1 ? 'orden' : 'órdenes' }}</strong>
            (las filas con la misma fecha, producto, área, turno y planta se suman).
          </p>
          <div class="table-wrap">
            <table aria-label="Órdenes a crear">
              <thead>
                <tr>
                  <th scope="col">Filas</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Producto</th>
                  <th scope="col" class="end">Cantidad</th>
                  <th scope="col">Área y turno</th>
                  <th scope="col">Planta</th>
                  <th scope="col">Receta</th>
                </tr>
              </thead>
              <tbody>
                @for (order of p.orders; track $index) {
                  <tr>
                    <td>{{ order.rows.join(', ') }}</td>
                    <td>{{ order.scheduledDate | date: 'dd/MM/yyyy' }}</td>
                    <td>
                      <strong>{{ order.sku }}</strong> {{ order.name }}
                    </td>
                    <td class="end">{{ order.quantity | qty: order.uom }}</td>
                    <td>
                      {{ order.areaName ?? 'Sin área' }}
                      @if (order.shift) {
                        · {{ order.shift | statusLabel: 'Shift' }}
                      }
                    </td>
                    <td>{{ order.locationCode }}</td>
                    <td>v{{ order.recipeVersion }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (canRelease) {
            <mat-checkbox [checked]="release()" (change)="release.set($event.checked)">
              Liberar las órdenes al importar
            </mat-checkbox>
          }
        </div>
      }
      @if (result(); as r) {
        <div result class="result">
          <p role="status">
            Importación <strong>{{ r.folio }}</strong
            >: {{ r.orderCount }}
            {{ r.orderCount === 1 ? 'orden creada' : 'órdenes creadas' }}
            {{ r.releasedOnImport ? 'y liberadas' : 'en borrador' }}.
          </p>
          <p class="muted">{{ r.orderFolios.join(', ') }}</p>
          <div class="links">
            <a
              matButton="filled"
              routerLink="/produccion/ordenes"
              [queryParams]="{ importId: r.importId, tab: 'All' }"
            >
              Ver órdenes
            </a>
            <a matButton="tonal" [routerLink]="['/produccion/importaciones', r.importId]">
              Ver la importación
            </a>
          </div>
        </div>
      }
    </app-xlsx-import>
  `,
  styles: `
    .preview,
    .result {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-self: stretch;
    }

    p {
      margin: 0;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 8px;
        border-bottom: 1px solid var(--pan-row-divider);
        text-align: left;
      }

      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-large);
      }
    }

    .end {
      text-align: right !important;
    }
  `,
})
export class OrdersImportPage {
  private readonly api = inject(OrderImportsApi);
  /** RN-94: releasing on import needs the permission to manage orders. */
  protected readonly canRelease = inject(AuthService).can('production.orders.manage');
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly release = signal(false);

  protected readonly template = () => this.api.template();
  protected readonly validate = (file: File) => this.api.validate(file);
  protected readonly submit = (file: File, confirmWarnings: boolean) =>
    this.api.import(file, confirmWarnings, this.canRelease && this.release());
}
