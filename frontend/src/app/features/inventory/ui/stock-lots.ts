import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { StockApi } from '../data-access/inventory-api';
import { daysToExpireText } from './expiry';
import { TraceLink } from './trace/trace-link';

/** Lots of an item at a location, first to expire first; expired lots in red (frontend §7.3). */
@Component({
  selector: 'app-stock-lots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TraceLink, DatePipe, QtyPipe, StatusTag],
  template: `
    @if (lots.isLoading()) {
      <p class="muted" role="status">Cargando lotes…</p>
    } @else if (lots.hasValue()) {
      @if (lots.value().length === 0) {
        <p class="muted">Sin existencia por lote.</p>
      } @else {
        <table class="lots" [attr.aria-label]="'Lotes de ' + itemName()">
          <thead>
            <tr>
              <th scope="col">Lote</th>
              <th scope="col">Caducidad</th>
              <th scope="col" class="end">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            @for (lot of lots.value(); track $index) {
              <tr [class.expired]="lot.isExpired">
                <td>
                  {{ lot.lotNumber ?? 'Sin lote' }}
                  @if (lot.lotId) {
                    <app-trace-link
                      type="Lot"
                      [id]="lot.lotId"
                      [label]="'lote ' + lot.lotNumber"
                      [compact]="true"
                    />
                  }
                </td>
                <td>
                  @if (lot.expirationDate) {
                    {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
                    @if (lot.isExpired) {
                      <app-status-tag text="Vencido" color="red" />
                    } @else if (lot.daysToExpire !== null) {
                      <span class="muted">({{ expiry(lot.daysToExpire) }})</span>
                    }
                  } @else {
                    —
                  }
                </td>
                <td class="end">{{ lot.quantity | qty: unit() }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    }
  `,
  styles: `
    .lots {
      width: 100%;
      max-width: 640px;
      border-collapse: collapse;

      th,
      td {
        padding: 4px 8px;
        text-align: left;
      }

      th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
    }

    .end {
      text-align: right !important;
    }

    .expired td {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }

    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StockLots {
  readonly locationId = input.required<string>();
  readonly itemId = input.required<string>();
  readonly itemName = input('');
  readonly unit = input<string | null>(null);

  protected readonly expiry = daysToExpireText;
  private readonly api = inject(StockApi);
  protected readonly lots = rxResource({
    params: () => ({ locationId: this.locationId(), itemId: this.itemId() }),
    stream: ({ params }) => this.api.lots(params.locationId, params.itemId),
  });
}
