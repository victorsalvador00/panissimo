import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { GoodsReceiptsApi } from '../data-access/purchasing-api';
import { TraceLink } from '../../inventory/ui/trace/trace-link';

/** /compras/recepciones/:id: the receipt with its lines in the purchase and base units, lots and costs (RN-33). */
@Component({
  selector: 'app-goods-receipt-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TraceLink, DatePipe, RouterLink, PageHeader, Stamp, StatusTag, QtyPipe, MxnPipe],
  template: `
    @if (receipt.hasValue()) {
      @let g = receipt.value();
      <app-page-header [title]="'Recepción ' + g.folio" />

      <section class="pan-card">
        <dl class="data">
          <dt>Orden de compra</dt>
          <dd>
            <a class="row-link" [routerLink]="['/compras/ordenes', g.purchaseOrderId]">
              {{ g.purchaseOrderFolio }}
            </a>
            <app-status-tag [value]="g.purchaseOrderStatus" kind="PurchaseOrderStatus" />
          </dd>
          <dt>Proveedor</dt>
          <dd>{{ g.supplierName }}</dd>
          <dt>Entró a</dt>
          <dd>{{ g.locationName }}</dd>
          @if (g.supplierInvoiceNumber) {
            <dt>Factura</dt>
            <dd>{{ g.supplierInvoiceNumber }}</dd>
          }
          <dt>Recibió</dt>
          <dd><app-stamp [at]="g.receivedAt" [by]="g.receivedByName" /></dd>
          <dt>Costo</dt>
          <dd>{{ g.totalCost | mxn }} <span class="muted">sin IVA</span></dd>
          @if (g.notes) {
            <dt>Notas</dt>
            <dd>{{ g.notes }}</dd>
          }
        </dl>
      </section>

      <section class="pan-card" aria-labelledby="receipt-lines">
        <h2 id="receipt-lines">Artículos</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col" class="end">Recibido</th>
                <th scope="col" class="end">En unidad base</th>
                <th scope="col">Lote</th>
                <th scope="col" class="end">Costo unitario</th>
                <th scope="col" class="end">Importe</th>
              </tr>
            </thead>
            <tbody>
              @for (line of g.lines; track line.id) {
                <tr>
                  <td>
                    <strong>{{ line.sku }}</strong> {{ line.itemName }}
                    <span class="muted">· {{ line.locationCode }}</span>
                  </td>
                  <td class="end">{{ line.quantity | qty: line.uomCode }}</td>
                  <td class="end">{{ line.baseQuantity | qty: line.baseUomCode }}</td>
                  <td>
                    {{ line.lotNumber ?? '—' }}
                    @if (line.lotId) {
                      <app-trace-link
                        type="Lot"
                        [id]="line.lotId"
                        [label]="'lote ' + line.lotNumber"
                        [compact]="true"
                      />
                    }
                    @if (line.expirationDate) {
                      <span class="muted">· {{ line.expirationDate | date: 'dd/MM/yyyy' }}</span>
                    }
                    @if (line.supplierLotNumber) {
                      <span class="muted">· proveedor {{ line.supplierLotNumber }}</span>
                    }
                  </td>
                  <td class="end">{{ line.unitCostBase | mxn }} / {{ line.baseUomCode }}</td>
                  <td class="end">{{ line.lineCost | mxn }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (receipt.isLoading()) {
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
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        margin: 0;
      }
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
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
export class GoodsReceiptDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(GoodsReceiptsApi);
  private readonly breadcrumbs = inject(BreadcrumbsService);

  protected readonly receipt = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    effect(() => {
      if (this.receipt.hasValue()) this.breadcrumbs.setCurrent(this.receipt.value().folio);
    });
  }
}
