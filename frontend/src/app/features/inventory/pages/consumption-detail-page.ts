import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { ConsumptionsApi } from '../data-access/inventory-api';

/** /inventario/consumos/:id: the consumption and the movements it posted (lots taken and cost). */
@Component({
  selector: 'app-consumption-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PageHeader, StatusTag, Stamp, QtyPipe, MxnPipe],
  template: `
    @if (consumption.hasValue()) {
      @let c = consumption.value();
      <app-page-header [title]="'Consumo ' + c.folio">
        <app-status-tag [value]="c.status" kind="ConsumptionStatus" />
      </app-page-header>

      <section class="pan-card">
        <dl class="data">
          <dt>Ubicación</dt>
          <dd>{{ c.locationCode }}</dd>
          <dt>Día</dt>
          <dd>{{ c.businessDate | date: 'dd/MM/yyyy' }}</dd>
          <dt>Importe</dt>
          <dd>{{ c.totalCost | mxn }}</dd>
          <dt>Registró</dt>
          <dd><app-stamp [at]="c.createdAt" [by]="c.createdByName" /></dd>
          @if (c.notes) {
            <dt>Notas</dt>
            <dd>{{ c.notes }}</dd>
          }
        </dl>
      </section>

      <section class="pan-card" aria-labelledby="consumption-movements">
        <h2 id="consumption-movements">Artículos</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col">Lote</th>
                <th scope="col" class="end">Cantidad</th>
                <th scope="col" class="end">Costo unitario</th>
                <th scope="col" class="end">Importe</th>
              </tr>
            </thead>
            <tbody>
              @for (movement of c.movements; track $index) {
                <tr>
                  <td>{{ movement.sku }}</td>
                  <td>{{ movement.lotNumber ?? '—' }}</td>
                  <td class="end">{{ -movement.quantity | qty }}</td>
                  <td class="end">{{ movement.unitCost | mxn }}</td>
                  <td class="end">{{ -movement.totalCost | mxn }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (consumption.isLoading()) {
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
export class ConsumptionDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(ConsumptionsApi);
  private readonly breadcrumbs = inject(BreadcrumbsService);

  protected readonly consumption = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    effect(() => {
      if (this.consumption.hasValue()) this.breadcrumbs.setCurrent(this.consumption.value().folio);
    });
  }
}
