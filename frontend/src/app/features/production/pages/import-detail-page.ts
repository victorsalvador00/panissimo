import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { OrderImportsApi } from '../data-access/production-api';

/** /produccion/importaciones/:id: the import (file, rows, who) and the orders it created with their current state. */
@Component({
  selector: 'app-import-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, PageHeader, Stamp, StatusTag, QtyPipe, StatusLabelPipe],
  template: `
    @if (item.hasValue()) {
      @let i = item.value();
      <app-page-header [title]="'Importación ' + i.folio" />

      <section class="pan-card">
        <dl class="data">
          <dt>Archivo</dt>
          <dd>{{ i.fileName }}</dd>
          <dt>Filas y órdenes</dt>
          <dd>
            {{ i.rowCount }} {{ i.rowCount === 1 ? 'fila' : 'filas' }} → {{ i.orderCount }}
            {{ i.orderCount === 1 ? 'orden' : 'órdenes' }}
            {{ i.releasedOnImport ? '(liberadas al importar)' : '(en borrador)' }}
          </dd>
          <dt>Importó</dt>
          <dd><app-stamp [at]="i.createdAt" [by]="i.createdByName" /></dd>
          <dt>Huella del archivo</dt>
          <dd class="hash">{{ i.fileSha256 }}</dd>
        </dl>
      </section>

      <section class="pan-card" aria-labelledby="import-orders">
        <h2 id="import-orders">Órdenes</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Fecha</th>
                <th scope="col">Producto</th>
                <th scope="col" class="end">Planeado</th>
                <th scope="col">Fábrica y turno</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (order of i.orders; track order.id) {
                <tr>
                  <td>
                    <a class="row-link" [routerLink]="['/produccion/ordenes', order.id]">
                      {{ order.folio }}
                    </a>
                  </td>
                  <td>{{ order.scheduledDate | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    <strong>{{ order.sku }}</strong> {{ order.itemName }}
                  </td>
                  <td class="end">{{ order.plannedQty | qty }}</td>
                  <td>
                    {{ order.factoryName ?? 'Sin fábrica' }}
                    @if (order.shift) {
                      · {{ order.shift | statusLabel: 'Shift' }}
                    }
                  </td>
                  <td><app-status-tag [value]="order.status" kind="ProductionOrderStatus" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (item.isLoading()) {
      <p role="status">Cargando…</p>
    }
  `,
  styles: `
    section {
      margin-bottom: 16px;
    }

    h2 {
      margin: 0 0 12px;
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }

    .data {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 0;

      dt {
        color: var(--mat-sys-on-surface-variant);
      }

      dd {
        margin: 0;
        min-width: 0;
      }
    }

    .hash {
      font-family: monospace;
      font-size: 0.8rem;
      overflow-wrap: anywhere;
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
export class ImportDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(OrderImportsApi);
  private readonly breadcrumbs = inject(BreadcrumbsService);

  protected readonly item = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    effect(() => {
      if (this.item.hasValue()) this.breadcrumbs.setCurrent(this.item.value().folio);
    });
  }
}
