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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { enumLabel } from '../../../shared/pipes/labels';
import { MxnPipe, QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { StockApi } from '../../inventory/data-access/inventory-api';
import { Transfer, TransfersApi } from '../data-access/logistics-api';
import { DispatchDialog, DispatchDialogData, DispatchResult } from '../ui/dispatch-dialog';
import { TraceLink } from '../../inventory/ui/trace/trace-link';

/**
 * /logistica/traspasos/:id (frontend §7.5): the transfer by state. A draft is edited, cancelled (a branch order's
 * cancels the order too) or dispatched (RN-21, RN-23); one in transit is received at its destination (RN-22).
 */
@Component({
  selector: 'app-transfer-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TraceLink,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    StatusTag,
    Stamp,
    QtyPipe,
    MxnPipe,
  ],
  template: `
    @if (transfer(); as t) {
      <app-page-header [title]="'Traspaso ' + t.folio">
        <app-status-tag [value]="t.status" kind="TransferStatus" />
        <app-trace-link type="Transfer" [id]="t.id" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="hasActions()">
        <section class="pan-card">
          <dl class="data">
            <dt>Origen</dt>
            <dd>{{ t.from.name }}</dd>
            <dt>Destino</dt>
            <dd>{{ t.to.name }}</dd>
            @if (t.branchOrderId) {
              <dt>Pedido</dt>
              <dd>Surte un pedido de sucursal</dd>
            }
            @if (t.notes) {
              <dt>Notas</dt>
              <dd>{{ t.notes }}</dd>
            }
            <dt>Creado</dt>
            <dd><app-stamp [at]="t.createdAt" [by]="t.createdByName" /></dd>
            @if (t.dispatchedAt) {
              <dt>Despachado</dt>
              <dd><app-stamp [at]="t.dispatchedAt" [by]="t.dispatchedByName" /></dd>
              <dt>Vehículo y chofer</dt>
              <dd>{{ t.vehicleDescription }} · {{ t.driverName }}</dd>
              <dt>Valor enviado</dt>
              <dd>{{ t.shippedValue | mxn }}</dd>
            }
            @if (t.receivedAt) {
              <dt>Recibido</dt>
              <dd><app-stamp [at]="t.receivedAt" [by]="t.receivedByName" /></dd>
            }
            @if (t.transitLossValue > 0) {
              <dt>Pérdida en tránsito</dt>
              <dd class="exit">{{ t.transitLossValue | mxn }}</dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="transfer-lines">
          <h2 id="transfer-lines">Artículos</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Artículo</th>
                  <th scope="col">Lote</th>
                  <th scope="col" class="end">{{ t.dispatchedAt ? 'Enviado' : 'Cantidad' }}</th>
                  @if (received()) {
                    <th scope="col" class="end">Recibido</th>
                    <th scope="col" class="end">Faltante</th>
                    <th scope="col">Motivo</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (line of t.lines; track line.id) {
                  <tr>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                      @if (line.fromStockLocationCode || line.toStockLocationCode) {
                        <span class="muted">
                          · {{ line.fromStockLocationCode ?? t.from.code }} →
                          {{ line.toStockLocationCode ?? t.to.code }}
                        </span>
                      }
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
                          t.status === 'Draft' ? 'El que caduca primero' : '—'
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
                          {{ reasonLabel(line.discrepancyReason) }}
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

      @if (hasActions()) {
        <div class="pan-action-bar">
          @if (canDispatch()) {
            <button matButton type="button" [disabled]="busy()" (click)="cancel(t)">
              Cancelar traspaso
            </button>
            <a matButton="tonal" [routerLink]="['editar']">
              <mat-icon>edit</mat-icon>
              Editar
            </a>
            <button matButton="filled" type="button" [disabled]="busy()" (click)="dispatch(t)">
              <mat-icon>local_shipping</mat-icon>
              Despachar
            </button>
          }
          @if (canReceive()) {
            <a matButton="filled" [routerLink]="['recibir']">Recibir</a>
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
export class TransferDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(TransfersApi);
  private readonly stockApi = inject(StockApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmService = inject(ConfirmService);
  private readonly notifier = inject(Notifier);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly myLocations = inject(LocationContextService).locations;
  protected readonly busy = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly transfer = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly received = computed(() => {
    const status = this.transfer()?.status;
    return status === 'Received' || status === 'ReceivedWithDiscrepancies';
  });

  /** A draft whose origin is one of the user's locations (RN-23: only drafts change). */
  protected readonly canDispatch = computed(() => {
    const t = this.transfer();
    return (
      t?.status === 'Draft' &&
      this.auth.can('logistics.transfers.dispatch') &&
      this.isMine(t.from.id)
    );
  });
  protected readonly canReceive = computed(() => {
    const t = this.transfer();
    return (
      t?.status === 'Dispatched' &&
      this.auth.can('logistics.transfers.receive') &&
      this.isMine(t.to.id)
    );
  });
  protected readonly hasActions = computed(() => this.canDispatch() || this.canReceive());

  constructor() {
    effect(() => {
      const t = this.transfer();
      if (t) this.breadcrumbs.setCurrent(t.folio);
    });
  }

  protected reasonLabel(reason: Transfer['lines'][number]['discrepancyReason']): string {
    return reason ? enumLabel('DiscrepancyReason', reason) : '';
  }

  protected async cancel(t: Transfer): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar traspaso',
      message: t.branchOrderId
        ? 'Este traspaso surte un pedido de sucursal: al cancelarlo también se cancela el pedido.'
        : 'El borrador queda cancelado y ya no se puede despachar.',
      confirmLabel: 'Cancelar traspaso',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (!confirmed) return;
    await this.run(this.api.cancel(t.id, t.version), `Traspaso ${t.folio} cancelado.`);
  }

  protected async dispatch(t: Transfer): Promise<void> {
    const warehouses = (await firstValueFrom(this.stockApi.warehouses(t.from.id))).filter(
      (w) => w.isActive && w.canMoveStock,
    );
    const result = await firstValueFrom(
      this.dialog
        .open<DispatchDialog, DispatchDialogData, DispatchResult>(DispatchDialog, {
          data: { transfer: t, warehouses },
          width: '640px',
          maxWidth: '95vw',
          autoFocus: 'first-tabbable',
        })
        .afterClosed(),
    );
    if (!result) return;

    const warehouse = warehouses.find((w) => w.id === result.fromWarehouseId);
    const confirmed = await this.confirmService.confirm({
      title: 'Despachar traspaso',
      message:
        'La mercancía sale de la existencia del origen y el traspaso queda en tránsito; ya no se puede editar ni cancelar.',
      summary: [
        {
          label: 'Origen',
          value: warehouse ? `${t.from.name} · ${warehouse.name}` : t.from.name,
        },
        { label: 'Destino', value: t.to.name },
        { label: 'Vehículo', value: result.vehicleDescription },
        { label: 'Chofer', value: result.driverName },
        ...t.lines.map((l) => ({ label: l.sku, value: formatQty(l.shippedQty, l.baseUomCode) })),
      ],
      confirmLabel: 'Despachar',
    });
    if (!confirmed) return;
    await this.run(
      this.api.dispatch(t.id, { version: t.version, ...result }),
      `Traspaso ${t.folio} despachado.`,
    );
  }

  /** Runs an action and shows the transfer it returns (a 409 opens its dialog from the error interceptor). */
  private async run(action: ReturnType<TransfersApi['get']>, message: string): Promise<void> {
    this.busy.set(true);
    try {
      const transfer = await firstValueFrom(action);
      this.resource.set(transfer);
      this.notifier.info(message);
    } catch {
      this.resource.reload();
    } finally {
      this.busy.set(false);
    }
  }

  private isMine(locationId: string): boolean {
    return this.myLocations().some((l) => l.id === locationId);
  }
}
