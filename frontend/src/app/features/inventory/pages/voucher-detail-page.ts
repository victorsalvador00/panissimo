import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe, StatusLabelPipe, formatQty } from '../../../shared/pipes/pipes';
import { InternalTransfersApi, Transfer } from '../../logistics/data-access/logistics-api';
import { stockWarehouses } from '../ui/stock-warehouses';

/**
 * ★ /inventario/vales-internos/:id (frontend §7.3, RN-47): the voucher by state. A draft is edited, cancelled or sent
 * (first to expire, or the planned lot; confirmation with the summary); one in transit is received at its destination.
 */
@Component({
  selector: 'app-voucher-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    StatusTag,
    Stamp,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  template: `
    @if (voucher(); as v) {
      <app-page-header [title]="'Vale ' + v.folio">
        <app-status-tag [value]="v.status" kind="TransferStatus" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="canSend() || canReceive()">
        <section class="pan-card">
          <dl class="data">
            <dt>Sale de</dt>
            <dd>
              {{ v.from.name }} <span class="muted">({{ v.from.code }})</span>
            </dd>
            <dt>Entra a</dt>
            <dd>
              {{ v.to.name }} <span class="muted">({{ v.to.code }})</span>
            </dd>
            @if (v.notes) {
              <dt>Notas</dt>
              <dd>{{ v.notes }}</dd>
            }
            <dt>Creado</dt>
            <dd><app-stamp [at]="v.createdAt" [by]="v.createdByName" /></dd>
            @if (v.dispatchedAt) {
              <dt>Enviado</dt>
              <dd><app-stamp [at]="v.dispatchedAt" [by]="v.dispatchedByName" /></dd>
              <dt>Valor enviado</dt>
              <dd>{{ v.shippedValue | mxn }}</dd>
            }
            @if (v.receivedAt) {
              <dt>Recibido</dt>
              <dd><app-stamp [at]="v.receivedAt" [by]="v.receivedByName" /></dd>
            }
            @if (v.transitLossValue > 0) {
              <dt>Pérdida en tránsito</dt>
              <dd class="exit">{{ v.transitLossValue | mxn }}</dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="voucher-lines">
          <h2 id="voucher-lines">Artículos</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Artículo</th>
                  <th scope="col">Lote</th>
                  <th scope="col" class="end">{{ v.dispatchedAt ? 'Enviado' : 'Cantidad' }}</th>
                  @if (received()) {
                    <th scope="col" class="end">Recibido</th>
                    <th scope="col" class="end">Faltante</th>
                    <th scope="col">Motivo</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (line of v.lines; track line.id) {
                  <tr>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                    </td>
                    <td>
                      @if (line.lotNumber) {
                        {{ line.lotNumber }}
                        @if (line.expirationDate) {
                          <span class="muted"
                            >· {{ line.expirationDate | date: 'dd/MM/yyyy' }}</span
                          >
                        }
                      } @else {
                        <span class="muted">{{
                          v.status === 'Draft' ? 'El que caduca primero' : '—'
                        }}</span>
                      }
                    </td>
                    <td class="end">{{ line.shippedQty | qty: line.baseUomCode }}</td>
                    @if (received()) {
                      <td class="end">{{ line.receivedQty | qty: line.baseUomCode }}</td>
                      <td class="end" [class.exit]="line.shortQty > 0">
                        {{ line.shortQty > 0 ? (line.shortQty | qty: line.baseUomCode) : '—' }}
                      </td>
                      <td>
                        @if (line.discrepancyReason) {
                          {{ line.discrepancyReason | statusLabel: 'DiscrepancyReason' }}
                          @if (line.discrepancyNotes) {
                            <span class="muted">· {{ line.discrepancyNotes }}</span>
                          }
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>

      @if (canSend() || canReceive()) {
        <div class="pan-action-bar">
          @if (canSend()) {
            <button matButton type="button" [disabled]="busy()" (click)="cancel(v)">
              Cancelar vale
            </button>
            <a matButton="tonal" routerLink="editar">
              <mat-icon>edit</mat-icon>
              Editar
            </a>
            <button matButton="filled" type="button" [disabled]="busy()" (click)="send(v)">
              Enviar
            </button>
          }
          @if (canReceive()) {
            <a matButton="filled" routerLink="recibir">Recibir</a>
          }
        </div>
      }
    } @else if (resource.isLoading()) {
      <p role="status">Cargando…</p>
    }
  `,
  styles: `
    .layout {
      display: flex;
      flex-direction: column;
      gap: 16px;
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

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .exit {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }
  `,
})
export class VoucherDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(InternalTransfersApi);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  /** Sub-warehouses of the active location where the user moves stock (RN-47: sending needs the origin's). */
  private readonly warehouses = stockWarehouses(inject(LocationContextService).active);
  protected readonly busy = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly voucher = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly received = computed(() => {
    const status = this.voucher()?.status;
    return status === 'Received' || status === 'ReceivedWithDiscrepancies';
  });
  protected readonly canSend = computed(() => {
    const v = this.voucher();
    return v?.status === 'Draft' && this.allowed() && this.mine(v.from.id);
  });
  protected readonly canReceive = computed(() => {
    const v = this.voucher();
    return v?.status === 'Dispatched' && this.allowed() && this.mine(v.to.id);
  });

  constructor() {
    effect(() => {
      const v = this.voucher();
      if (v) this.breadcrumbs.setCurrent(v.folio);
    });
  }

  protected async send(v: Transfer): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Enviar vale',
      message:
        'La mercancía sale del subalmacén origen (el lote planeado o el que caduca primero) y el vale queda en tránsito hasta que el destino lo reciba.',
      summary: [
        { label: 'Sale de', value: v.from.name },
        { label: 'Entra a', value: v.to.name },
        ...v.lines.map((l) => ({ label: l.sku, value: formatQty(l.shippedQty, l.baseUomCode) })),
      ],
      confirmLabel: 'Enviar',
    });
    if (confirmed)
      await this.run(
        this.api.dispatch(v.id, { version: v.version, lines: null }),
        `Vale ${v.folio} enviado.`,
      );
  }

  protected async cancel(v: Transfer): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar vale',
      message: 'El borrador queda cancelado y ya no se puede enviar.',
      confirmLabel: 'Cancelar vale',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed) await this.run(this.api.cancel(v.id, v.version), `Vale ${v.folio} cancelado.`);
  }

  private allowed(): boolean {
    return this.auth.can('inventory.internal_transfers');
  }

  private mine(warehouseId: string): boolean {
    return this.warehouses().some((w) => w.id === warehouseId);
  }

  /** Runs an action and shows the voucher it returns (a 409 opens its dialog from the error interceptor). */
  private async run(action: Observable<Transfer>, message: string): Promise<void> {
    this.busy.set(true);
    try {
      this.resource.set(await firstValueFrom(action));
      this.notifier.info(message);
    } catch {
      this.resource.reload();
    } finally {
      this.busy.set(false);
    }
  }
}
