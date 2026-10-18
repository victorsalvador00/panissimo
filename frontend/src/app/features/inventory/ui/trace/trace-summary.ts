import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QtyPipe } from '../../../../shared/pipes/pipes';
import type { TraceGraph } from '../../data-access/traceability-api';
import { shortDate } from './trace-text';

/**
 * Resumen (RN-108, trazabilidad §6.3): origins, finished lots, locations with the current stock highlighted and
 * customers, plus the loss in transit. On phones every row is a card (each cell carries its column name).
 */
@Component({
  selector: 'app-trace-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [QtyPipe],
  template: `
    @let s = graph().summary;
    @if (s.inTransitLossQty > 0) {
      <p class="loss" role="note">
        Pérdida en tránsito: <strong>{{ s.inTransitLossQty | qty: lossUom() }}</strong> (recibido
        con diferencia; no es existencia en ninguna ubicación).
      </p>
    }

    <section class="pan-card">
      <h2>Ubicaciones</h2>
      @if (s.locations.length === 0) {
        <p class="muted">Ningún lote terminado llegó a una ubicación.</p>
      } @else {
        <table class="cards" aria-label="Ubicaciones">
          <thead>
            <tr>
              <th scope="col">Ubicación</th>
              <th scope="col" class="end">Recibido</th>
              <th scope="col" class="end">Consumido</th>
              <th scope="col" class="end">Merma</th>
              <th scope="col" class="end">Existencia actual</th>
            </tr>
          </thead>
          <tbody>
            @for (l of s.locations; track l.locationId) {
              <tr>
                <th scope="row" data-label="Ubicación">
                  {{ l.locationCode }} · {{ l.locationName }}
                </th>
                <td class="end" data-label="Recibido">{{ l.receivedQty | qty: l.baseUom }}</td>
                <td class="end" data-label="Consumido">{{ l.consumedQty | qty: l.baseUom }}</td>
                <td class="end" data-label="Merma">{{ l.wasteQty | qty: l.baseUom }}</td>
                <td class="end" data-label="Existencia actual">
                  <span [class.on-hand]="l.onHandQty > 0">{{ l.onHandQty | qty: l.baseUom }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    @if (s.customers.length > 0) {
      <section class="pan-card">
        <h2>Clientes</h2>
        <table class="cards" aria-label="Clientes">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Remisiones</th>
              <th scope="col" class="end">Remisionado</th>
            </tr>
          </thead>
          <tbody>
            @for (c of s.customers; track c.customerId) {
              <tr>
                <th scope="row" data-label="Cliente">{{ c.customerName }}</th>
                <td data-label="Remisiones">{{ c.shipmentFolios.join(', ') }}</td>
                <td class="end" data-label="Remisionado">{{ c.shippedQty | qty: c.baseUom }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    <section class="pan-card">
      <h2>Lotes terminados</h2>
      @if (s.finishedLots.length === 0) {
        <p class="muted">La cadena no tiene lotes de producto terminado.</p>
      } @else {
        <table class="cards" aria-label="Lotes terminados">
          <thead>
            <tr>
              <th scope="col">Lote</th>
              <th scope="col">Artículo</th>
              <th scope="col" class="end">Producido</th>
              <th scope="col">Caducidad</th>
            </tr>
          </thead>
          <tbody>
            @for (l of s.finishedLots; track l.lotId) {
              <tr>
                <th scope="row" data-label="Lote">{{ l.lotNumber }}</th>
                <td data-label="Artículo">{{ l.sku }} · {{ l.itemName }}</td>
                <td class="end" data-label="Producido">{{ l.producedQty | qty: l.baseUom }}</td>
                <td data-label="Caducidad">{{ date(l.expirationDate) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>

    <section class="pan-card">
      <h2>Orígenes</h2>
      @if (s.origins.length === 0) {
        <p class="muted">Sin lotes de materia prima en la cadena.</p>
      } @else {
        <table class="cards" aria-label="Orígenes">
          <thead>
            <tr>
              <th scope="col">Proveedor</th>
              <th scope="col">OC y recepción</th>
              <th scope="col">Lote</th>
              <th scope="col" class="end">Consumido</th>
            </tr>
          </thead>
          <tbody>
            @for (o of s.origins; track o.lotId + (o.receiptFolio ?? o.docFolio ?? '')) {
              <tr>
                <th scope="row" data-label="Proveedor">
                  {{ o.supplierName ?? 'Sin proveedor (ajuste o conteo)' }}
                </th>
                <td data-label="OC y recepción">
                  {{ join(o.purchaseOrderFolio, o.receiptFolio, o.docFolio) }}
                </td>
                <td data-label="Lote">{{ o.sku }} · {{ o.lotNumber }}</td>
                <td class="end" data-label="Consumido">{{ o.consumedQty | qty: o.baseUom }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-medium);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }

    th,
    td {
      padding: 8px;
      border-bottom: 1px solid var(--pan-row-divider);
      text-align: left;
    }

    thead th {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }

    tbody th {
      font-weight: 500;
    }

    .end {
      text-align: right;
    }

    .on-hand {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--pan-status-orange-bg);
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }

    .loss {
      margin: 0;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--pan-status-orange-bg);
      color: var(--pan-status-orange-fg);
    }

    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    @media (max-width: 767.98px) {
      table.cards thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }

      table.cards,
      table.cards tbody,
      table.cards tr,
      table.cards th,
      table.cards td {
        display: block;
      }

      table.cards tr {
        margin-bottom: 10px;
        padding: 8px 12px;
        border: 1px solid var(--pan-row-divider);
        border-radius: 10px;
      }

      table.cards th,
      table.cards td {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 4px 0;
        border: 0;
        text-align: right;
        overflow-wrap: anywhere;
      }

      table.cards [data-label]::before {
        content: attr(data-label);
        flex: none;
        color: var(--mat-sys-on-surface-variant);
        font-weight: 400;
        text-align: left;
      }
    }
  `,
})
export class TraceSummary {
  readonly graph = input.required<TraceGraph>();
  protected lossUom(): string | null {
    return this.graph().summary.finishedLots[0]?.baseUom ?? null;
  }
  protected join(...values: (string | null)[]): string {
    return values.filter(Boolean).join(' · ');
  }
  protected date(value: string | null): string {
    return value ? shortDate(value) : '—';
  }
}
