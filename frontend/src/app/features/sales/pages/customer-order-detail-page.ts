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
import { Router, RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ReasonService } from '../../../shared/components/reason-dialog/reason-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { documentLink } from '../../../shared/data-access/document-links';
import { MxnPipe, QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { CustomerOrder, CustomerOrdersApi, CustomerShipmentsApi } from '../data-access/sales-api';
import { CustomerOrderAction, customerOrderActions } from '../ui/customer-order-actions';

/**
 * /ventas/pedidos/:id (frontend §7.7, RN-80..RN-82): ordered / shipped / pending per line, its shipments and the
 * actions by state and permission (confirm, edit, cancel, close with balance, new shipment).
 */
@Component({
  selector: 'app-customer-order-detail-page',
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
  ],
  template: `
    @if (order(); as o) {
      <app-page-header [title]="'Pedido ' + o.folio">
        <app-status-tag [value]="o.status" kind="CustomerOrderStatus" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="actions().length > 0">
        <section class="pan-card">
          <dl class="data">
            <dt>Cliente</dt>
            <dd>
              <a class="row-link" [routerLink]="['/ventas/clientes', o.customerId]">
                {{ o.customerCode }}
              </a>
              {{ o.customerName }}
            </dd>
            <dt>Entrega</dt>
            <dd>
              @if (o.deliveryPointName) {
                {{ o.deliveryPointName }}
                @if (o.deliveryPointAddress) {
                  <span class="muted">· {{ o.deliveryPointAddress }}</span>
                }
              } @else {
                Sin punto de entrega
              }
            </dd>
            <dt>Surte</dt>
            <dd>{{ o.supplyingLocationCode }}</dd>
            <dt>Se necesita</dt>
            <dd>{{ o.requiredDate | date: 'dd/MM/yyyy' }}</dd>
            @if (o.customerReference) {
              <dt>Referencia</dt>
              <dd>{{ o.customerReference }}</dd>
            }
            @if (o.notes) {
              <dt>Notas</dt>
              <dd>{{ o.notes }}</dd>
            }
            <dt>Creado</dt>
            <dd><app-stamp [at]="o.createdAt" [by]="o.createdByName" /></dd>
            @if (o.confirmedAt) {
              <dt>Confirmado</dt>
              <dd><app-stamp [at]="o.confirmedAt" [by]="o.confirmedByName" /></dd>
            }
            @if (o.closedAt) {
              <dt>Cerrado con saldo</dt>
              <dd><app-stamp [at]="o.closedAt" [by]="o.closedByName" /> · {{ o.closeReason }}</dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="order-lines">
          <h2 id="order-lines">Productos</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col" class="end">Pedido</th>
                  <th scope="col" class="end">Remisionado</th>
                  <th scope="col" class="end">Pendiente</th>
                  <th scope="col" class="end">Precio</th>
                  <th scope="col" class="end">Importe</th>
                </tr>
              </thead>
              <tbody>
                @for (line of o.lines; track line.id) {
                  <tr>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                      @if (line.customerSku) {
                        <span class="muted">· clave {{ line.customerSku }}</span>
                      }
                    </td>
                    <td class="end">{{ line.quantity | qty: line.uomCode }}</td>
                    <td class="end">{{ line.shippedQty | qty: line.uomCode }}</td>
                    <td class="end">
                      {{ line.pendingQty > 0 ? (line.pendingQty | qty: line.uomCode) : '—' }}
                    </td>
                    <td class="end">
                      {{ line.unitPrice === null ? '—' : (line.unitPrice | mxn) }}
                    </td>
                    <td class="end">{{ line.amount === null ? '—' : (line.amount | mxn) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="subtotal">
            Importe informativo: <strong>{{ o.estimatedSubtotal | mxn }}</strong> (sin IVA)
          </p>
        </section>

        @if (o.shipments.length > 0) {
          <section class="pan-card" aria-labelledby="order-shipments">
            <h2 id="order-shipments">Remisiones</h2>
            <ul class="shipments">
              @for (shipment of o.shipments; track shipment.id) {
                <li>
                  @if (shipmentLink(shipment.id); as link) {
                    <a class="row-link" [routerLink]="link">{{ shipment.folio }}</a>
                  } @else {
                    <strong>{{ shipment.folio }}</strong>
                  }
                  <app-status-tag [value]="shipment.status" kind="CustomerShipmentStatus" />
                  <span class="muted">
                    {{ shipment.dispatchedAt ?? shipment.createdAt | date: 'dd/MM/yyyy HH:mm' }}
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      </div>

      @if (actions().length > 0) {
        <div class="pan-action-bar">
          @if (has('cancel')) {
            <button matButton type="button" [disabled]="busy()" (click)="cancel(o)">
              Cancelar pedido
            </button>
          }
          @if (has('close')) {
            <button matButton type="button" [disabled]="busy()" (click)="close(o)">
              Cerrar con saldo
            </button>
          }
          @if (has('edit')) {
            <a matButton="tonal" routerLink="editar">
              <mat-icon>edit</mat-icon>
              Editar
            </a>
          }
          @if (has('confirm')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="confirm(o)">
              Confirmar
            </button>
          }
          @if (has('ship')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="newShipment(o)">
              <mat-icon>local_shipping</mat-icon>
              Nueva remisión
            </button>
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

    .subtotal {
      margin: 12px 0 0;
      text-align: right;
    }

    .shipments {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 12px;
        padding: 6px 0;
        border-bottom: 1px solid var(--pan-row-divider);
      }
    }
  `,
})
export class CustomerOrderDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerOrdersApi);
  private readonly shipments = inject(CustomerShipmentsApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly reasons = inject(ReasonService);
  private readonly notifier = inject(Notifier);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly busy = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly order = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly actions = computed<CustomerOrderAction[]>(() => {
    const o = this.order();
    if (!o) return [];
    const shippedAny = o.lines.some((l) => l.shippedQty > 0);
    return customerOrderActions({ status: o.status, shippedAny }, (p) => this.auth.can(p));
  });

  constructor() {
    effect(() => {
      const o = this.order();
      if (o) this.breadcrumbs.setCurrent(o.folio);
    });
  }

  protected has(action: CustomerOrderAction): boolean {
    return this.actions().includes(action);
  }

  protected shipmentLink(id: string): string[] | null {
    return documentLink('CustomerShipment', id);
  }

  /** RN-81: a draft shipment filled with the balance of each line; it is completed and dispatched on its screen. */
  protected async newShipment(o: CustomerOrder): Promise<void> {
    this.busy.set(true);
    try {
      const shipment = await firstValueFrom(this.shipments.createFromOrder(o.id));
      await this.router.navigate(['/ventas/remisiones', shipment.id]);
    } catch {
      // The error interceptor shows why.
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirm(o: CustomerOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Confirmar pedido',
      message:
        'El pedido confirmado entra al plan de producción y ya no se edita; si cambia, se cancela y se captura otro.',
      summary: o.lines.map((line) => ({
        label: line.sku,
        value: formatQty(line.quantity, line.uomCode),
      })),
      confirmLabel: 'Confirmar pedido',
    });
    if (confirmed)
      await this.run(this.api.confirm(o.id, o.version), `Pedido ${o.folio} confirmado.`);
  }

  protected async cancel(o: CustomerOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar pedido',
      message: `El pedido ${o.folio} queda cancelado; no se puede deshacer.`,
      confirmLabel: 'Cancelar pedido',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed) await this.run(this.api.cancel(o.id, o.version), `Pedido ${o.folio} cancelado.`);
  }

  protected async close(o: CustomerOrder): Promise<void> {
    const reason = await this.reasons.ask({
      title: `Cerrar ${o.folio} con saldo`,
      message: 'Lo pendiente ya no se remisionará en este pedido.',
      label: 'Motivo del cierre',
      confirmLabel: 'Cerrar con saldo',
    });
    if (reason)
      await this.run(
        this.api.close(o.id, o.version, reason),
        `Pedido ${o.folio} cerrado con saldo.`,
      );
  }

  /** Runs an action and shows the order it returns (errors open their dialog from the interceptor). */
  private async run(action: Observable<CustomerOrder>, message: string): Promise<void> {
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
