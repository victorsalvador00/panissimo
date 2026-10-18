import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import {
  ProductionClose,
  ProductionCloseListItem,
  ProductionClosesApi,
} from '../data-access/production-api';
import { CloseConsumption } from './close-consumption';
import { TraceLink } from '../../inventory/ui/trace/trace-link';

/**
 * `app-close-timeline` (frontend §7.4.2): the closes of an order from the first to the last, with folio, kind, date and
 * time, shift, user, produced, lot, unit cost and waste; expanding one loads its consumption and lots.
 */
@Component({
  selector: 'app-close-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TraceLink,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    CloseConsumption,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    <ol class="timeline">
      @for (close of closes(); track close.id) {
        <li [class.final]="close.kind === 'Final'">
          <span class="dot" aria-hidden="true"></span>
          <div class="body">
            <div class="head">
              <a class="row-link" [routerLink]="['/produccion/cierres', close.id]">{{
                close.folio
              }}</a>
              <span class="kind">{{ close.kind | statusLabel: 'ProductionCloseKind' }}</span>
              <span class="muted">
                {{ close.closedAt | date: 'dd/MM/yyyy HH:mm' }}
                @if (close.shift) {
                  · {{ close.shift | statusLabel: 'Shift' }}
                }
                · {{ close.closedByName ?? '—' }}
              </span>
            </div>
            <div class="figures">
              <span
                ><strong>{{ close.producedQty | qty: close.baseUomCode }}</strong> producido</span
              >
              @if (close.outputLotNumber) {
                <span
                  >lote {{ close.outputLotNumber }}
                  <app-trace-link
                    type="Lot"
                    [id]="close.outputLotId"
                    [label]="'lote ' + close.outputLotNumber"
                    [compact]="true"
                /></span>
              }
              <span>{{ close.unitCost | mxn }} por {{ close.baseUomCode }}</span>
              <span [class.exit]="close.wasteCost > 0">merma {{ close.wasteCost | mxn }}</span>
              @if (close.exceedsTolerance) {
                <span class="over">supera la tolerancia</span>
              }
            </div>
            <button
              matButton
              type="button"
              [attr.aria-expanded]="open().has(close.id)"
              (click)="toggle(close)"
            >
              <mat-icon>{{ open().has(close.id) ? 'expand_less' : 'expand_more' }}</mat-icon>
              Consumos y lotes
            </button>
            @if (open().has(close.id)) {
              @if (details()[close.id]; as detail) {
                @if (detail.outputLotExpiration) {
                  <p class="muted">
                    Lote {{ detail.outputLotNumber }} caduca
                    {{ detail.outputLotExpiration | date: 'dd/MM/yyyy' }} · entró a
                    {{ detail.outputLocationCode }}
                  </p>
                }
                <app-close-consumption [close]="detail" />
              } @else {
                <p class="muted" role="status">Cargando…</p>
              }
            }
          </div>
        </li>
      } @empty {
        <li class="empty muted">Todavía no hay cierres.</li>
      }
    </ol>
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 8px 0 0;
      list-style: none;
    }

    li {
      position: relative;
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 8px;
      padding-bottom: 16px;

      &::before {
        position: absolute;
        top: 18px;
        bottom: 0;
        left: 7px;
        width: 2px;
        background: var(--pan-row-divider);
        content: '';
      }

      &:last-child::before {
        display: none;
      }
    }

    .dot {
      width: 16px;
      height: 16px;
      margin-top: 2px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
    }

    .final .dot {
      background: var(--pan-status-green-fg);
      box-shadow: 0 0 0 3px var(--pan-status-green-bg);
    }

    .body {
      min-width: 0;
    }

    .head,
    .figures {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 12px;
    }

    .kind {
      font-weight: 600;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .exit {
      color: var(--pan-status-red-fg);
    }

    .over {
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }

    .empty {
      display: block;
      padding: 8px;

      &::before {
        display: none;
      }
    }
  `,
})
export class CloseTimeline {
  readonly closes = input.required<ProductionCloseListItem[]>();

  private readonly api = inject(ProductionClosesApi);
  protected readonly open = signal(new Set<string>());
  protected readonly details = signal<Record<string, ProductionClose>>({});

  protected async toggle(close: ProductionCloseListItem): Promise<void> {
    const open = new Set(this.open());
    if (open.has(close.id)) open.delete(close.id);
    else open.add(close.id);
    this.open.set(open);
    if (open.has(close.id) && !this.details()[close.id]) {
      const detail = await firstValueFrom(this.api.get(close.id));
      this.details.update((all) => ({ ...all, [close.id]: detail }));
    }
  }
}
