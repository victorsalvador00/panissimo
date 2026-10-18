import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import type { ProductionClose } from '../data-access/production-api';

/** Consumption of a close by component: theoretical, actual, waste, cost and the lots taken (RN-61, RN-13). */
@Component({
  selector: 'app-close-consumption',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, QtyPipe, MxnPipe],
  template: `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Componente</th>
            <th scope="col" class="end">Teórico</th>
            <th scope="col" class="end">Real</th>
            <th scope="col" class="end">Merma</th>
            <th scope="col" class="end">Costo</th>
            <th scope="col">Lotes</th>
          </tr>
        </thead>
        <tbody>
          @for (line of close().lines; track line.id) {
            <tr>
              <td>
                <strong>{{ line.sku }}</strong> {{ line.name }}
                <span class="muted">· {{ line.locationCode }}</span>
              </td>
              <td class="end">{{ line.theoreticalQty | qty: line.baseUomCode }}</td>
              <td class="end">{{ line.actualQty | qty: line.baseUomCode }}</td>
              <td class="end" [class.exit]="line.wasteQty > 0">
                {{ line.wasteQty | qty: line.baseUomCode }}
              </td>
              <td class="end">{{ line.totalCost | mxn }}</td>
              <td>
                @for (lot of line.lots; track lot.lotId) {
                  <span class="lot">
                    {{ lot.lotNumber }} · {{ lot.quantity | qty: line.baseUomCode }}
                    @if (lot.expirationDate) {
                      <span class="muted">· {{ lot.expirationDate | date: 'dd/MM/yyyy' }}</span>
                    }
                  </span>
                } @empty {
                  <span class="muted">—</span>
                }
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="muted">Sin consumo: no se produjo en este cierre.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
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
        vertical-align: top;
      }

      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-large);
      }
    }

    .end {
      text-align: right !important;
    }

    .lot {
      display: block;
      white-space: nowrap;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .exit {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }
  `,
})
export class CloseConsumption {
  readonly close = input.required<ProductionClose>();
}
