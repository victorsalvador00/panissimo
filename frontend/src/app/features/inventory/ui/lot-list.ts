import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { LotStock, StockApi } from '../data-access/stock.api';

export type LotState = 'expired' | 'expiring' | 'ok' | 'none';

/** Vencido (rojo), por caducar según `/alerts` (amarillo), vigente o sin caducidad. */
export function lotState(lot: LotStock, expiringLotIds: ReadonlySet<string>): LotState {
  if (lot.isExpired) {
    return 'expired';
  }
  if (lot.lotId && expiringLotIds.has(lot.lotId)) {
    return 'expiring';
  }
  return lot.expirationDate ? 'ok' : 'none';
}

/** Lotes de un artículo en una ubicación (detalle expandible de Existencias). */
@Component({
  selector: 'app-lot-list',
  imports: [DatePipe, QtyPipe, StatusTag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lots.isLoading()) {
      <p class="muted">Cargando lotes…</p>
    } @else if (!(lots.value() ?? []).length) {
      <p class="muted">Sin existencia por lote.</p>
    } @else {
      <table>
        <caption class="sgo-visually-hidden">
          Lotes
        </caption>
        <thead>
          <tr>
            <th scope="col">Lote</th>
            <th scope="col">Caducidad</th>
            <th scope="col" class="end">Cantidad</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (lot of lots.value(); track lot.lotId ?? $index) {
            <tr>
              <td>{{ lot.lotNumber ?? 'Sin lote' }}</td>
              <td>
                @if (lot.expirationDate) {
                  {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
                  @if (!lot.isExpired && lot.daysToExpire !== null) {
                    <span class="muted">({{ lot.daysToExpire }} días)</span>
                  }
                } @else {
                  —
                }
              </td>
              <td class="end">{{ lot.quantity | qty: uom() }}</td>
              <td>
                @switch (state(lot)) {
                  @case ('expired') {
                    <app-status-tag label="Vencido" color="red" />
                  }
                  @case ('expiring') {
                    <app-status-tag label="Por caducar" color="yellow" />
                  }
                  @case ('ok') {
                    <app-status-tag label="Vigente" color="green" />
                  }
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    table {
      width: 100%;
      max-width: 640px;
      border-collapse: collapse;
    }
    th,
    td {
      padding: var(--sgo-space-1) var(--sgo-space-3);
      text-align: start;
    }
    th {
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }
    .end {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LotList {
  private readonly api = inject(StockApi);

  readonly locationId = input.required<string>();
  readonly itemId = input.required<string>();
  readonly uom = input('');
  readonly expiringLotIds = input<ReadonlySet<string>>(new Set());

  protected readonly lots = rxResource({
    params: () => ({ locationId: this.locationId(), itemId: this.itemId() }),
    stream: ({ params }) => this.api.lots(params.locationId, params.itemId),
  });

  protected state(lot: LotStock): LotState {
    return lotState(lot, this.expiringLotIds());
  }
}
