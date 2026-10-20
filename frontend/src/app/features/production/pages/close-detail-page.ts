import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { ProductionClosesApi } from '../data-access/production-api';
import { CloseConsumption } from '../ui/close-consumption';

/** /produccion/cierres/:id (frontend §7.4): the close with its output lot, costs, consumption and lots (RN-65: read-only). */
@Component({
  selector: 'app-close-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    PageHeader,
    Stamp,
    CloseConsumption,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    @if (close.hasValue()) {
      @let c = close.value();
      <app-page-header
        [title]="'Cierre ' + c.folio + ' · ' + (c.kind | statusLabel: 'ProductionCloseKind')"
      />

      <section class="pan-card">
        <dl class="data">
          <dt>Orden</dt>
          <dd>
            <a class="row-link" [routerLink]="['/produccion/ordenes', c.productionOrderId]">
              {{ c.orderFolio }}
            </a>
            · cierre {{ c.sequence }}
          </dd>
          <dt>Producto</dt>
          <dd>
            <strong>{{ c.sku }}</strong> {{ c.itemName }}
          </dd>
          <dt>Producido</dt>
          <dd>
            {{ c.producedQty | qty: c.baseUomCode }}
            @if (c.exceedsTolerance) {
              <span class="over">· supera la tolerancia</span>
            }
          </dd>
          @if (c.outputLotNumber) {
            <dt>Lote</dt>
            <dd>
              {{ c.outputLotNumber }}
              @if (c.outputLotExpiration) {
                · caduca {{ c.outputLotExpiration | date: 'dd/MM/yyyy' }}
              }
            </dd>
          }
          <dt>Entró a</dt>
          <dd>{{ c.outputLocationCode }}</dd>
          <dt>Día, turno y fábrica</dt>
          <dd>
            {{ c.businessDate | date: 'dd/MM/yyyy' }}
            @if (c.shift) {
              · {{ c.shift | statusLabel: 'Shift' }}
            }
            · {{ c.factoryName ?? 'sin fábrica' }}
          </dd>
          <dt>Costo</dt>
          <dd>{{ c.totalCost | mxn }} · {{ c.unitCost | mxn }} por {{ c.baseUomCode }}</dd>
          <dt>Merma</dt>
          <dd>{{ c.wasteCost | mxn }}</dd>
          <dt>Registró</dt>
          <dd><app-stamp [at]="c.closedAt" [by]="c.closedByName" /></dd>
          @if (c.notes) {
            <dt>Notas</dt>
            <dd>{{ c.notes }}</dd>
          }
        </dl>
      </section>

      <section class="pan-card" aria-labelledby="close-lines">
        <h2 id="close-lines">Consumos y lotes</h2>
        <app-close-consumption [close]="c" />
      </section>
    } @else if (close.isLoading()) {
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
      }
    }

    .over {
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }
  `,
})
export class CloseDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(ProductionClosesApi);
  private readonly breadcrumbs = inject(BreadcrumbsService);

  protected readonly close = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    effect(() => {
      if (this.close.hasValue()) this.breadcrumbs.setCurrent(this.close.value().folio);
    });
  }
}
