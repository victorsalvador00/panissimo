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
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ReasonService } from '../../../shared/components/reason-dialog/reason-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe, formatMxn } from '../../../shared/pipes/pipes';
import { PurchaseOrder, PurchaseOrdersApi } from '../data-access/purchasing-api';
import { PurchaseOrderAction, purchaseOrderActions } from '../ui/purchase-order-actions';

/**
 * /compras/ordenes/:id (frontend §7.6, RN-31, RN-32): the purchase order with its lines (received and pending, the
 * requisition each came from), amounts and receipts; actions by state and permission.
 */
@Component({
  selector: 'app-purchase-order-detail-page',
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
      <app-page-header [title]="'Orden de compra ' + o.folio">
        <app-status-tag [value]="o.status" kind="PurchaseOrderStatus" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="actions().length > 0">
        <section class="pan-card">
          <dl class="data">
            <dt>Proveedor</dt>
            <dd>
              <a class="row-link" [routerLink]="['/compras/proveedores', o.supplierId]">
                {{ o.supplierName }}
              </a>
              <span class="muted">
                · {{ o.supplierTaxId }} ·
                {{ o.paymentTermsDays === 0 ? 'contado' : o.paymentTermsDays + ' días de crédito' }}
              </span>
            </dd>
            <dt>Entrega en</dt>
            <dd>{{ o.deliveryLocationName }}</dd>
            <dt>Fecha esperada</dt>
            <dd>{{ o.expectedDate | date: 'dd/MM/yyyy' }}</dd>
            @if (o.notes) {
              <dt>Notas</dt>
              <dd>{{ o.notes }}</dd>
            }
            <dt>Creada</dt>
            <dd><app-stamp [at]="o.createdAt" [by]="o.createdByName" /></dd>
            @if (o.submittedAt) {
              <dt>Enviada</dt>
              <dd><app-stamp [at]="o.submittedAt" [by]="o.submittedByName" /></dd>
            }
            @if (o.approvedAt) {
              <dt>Aprobada</dt>
              <dd>
                <app-stamp [at]="o.approvedAt" [by]="o.approvedByName" />
                @if (o.approvedAutomatically) {
                  <span class="muted">· automática (debajo del umbral)</span>
                }
              </dd>
            }
            @if (o.rejectedAt) {
              <dt>Rechazada</dt>
              <dd>
                <app-stamp [at]="o.rejectedAt" [by]="o.rejectedByName" /> · {{ o.rejectionReason }}
              </dd>
            }
            @if (o.closedAt) {
              <dt>Cerrada con saldo</dt>
              <dd><app-stamp [at]="o.closedAt" [by]="o.closedByName" /> · {{ o.closeReason }}</dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="po-lines">
          <h2 id="po-lines">Artículos</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Artículo</th>
                  <th scope="col" class="end">Cantidad</th>
                  <th scope="col" class="end">Precio</th>
                  <th scope="col" class="end">Importe</th>
                  <th scope="col" class="end">IVA</th>
                  <th scope="col" class="end">Recibido</th>
                  <th scope="col" class="end">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                @for (line of o.lines; track line.id) {
                  <tr>
                    <td>{{ line.lineNumber }}</td>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                      @if (line.requisitionId) {
                        <span class="muted">
                          ·
                          <a [routerLink]="['/compras/requisiciones', line.requisitionId]">
                            {{ line.requisitionFolio }}
                          </a>
                        </span>
                      }
                    </td>
                    <td class="end">{{ line.quantity | qty: line.uomCode }}</td>
                    <td class="end">{{ line.unitPrice | mxn }}</td>
                    <td class="end">{{ line.subtotal | mxn }}</td>
                    <td class="end">{{ line.taxAmount | mxn }}</td>
                    <td class="end">{{ line.receivedQty | qty: line.uomCode }}</td>
                    <td class="end">
                      {{ line.pendingQty > 0 ? (line.pendingQty | qty: line.uomCode) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <dl class="totals">
            <dt>Subtotal</dt>
            <dd>{{ o.subtotal | mxn }}</dd>
            <dt>IVA</dt>
            <dd>{{ o.taxTotal | mxn }}</dd>
            <dt>Total</dt>
            <dd class="total">{{ o.total | mxn }}</dd>
          </dl>
        </section>

        @if (o.receipts.length > 0) {
          <section class="pan-card" aria-labelledby="po-receipts">
            <h2 id="po-receipts">Recepciones</h2>
            <ul class="receipts">
              @for (receipt of o.receipts; track receipt.id) {
                <li>
                  <a class="row-link" [routerLink]="['/compras/recepciones', receipt.id]">
                    {{ receipt.folio }}
                  </a>
                  <span class="muted">
                    {{ receipt.receivedAt | date: 'dd/MM/yyyy HH:mm' }}
                    @if (receipt.supplierInvoiceNumber) {
                      · factura {{ receipt.supplierInvoiceNumber }}
                    }
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
              Cancelar orden
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
          @if (has('submit')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="submit(o)">
              Enviar
            </button>
          }
          @if (has('reject')) {
            <button matButton="tonal" type="button" [disabled]="busy()" (click)="reject(o)">
              Rechazar
            </button>
          }
          @if (has('approve')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="approve(o)">
              Aprobar
            </button>
          }
          @if (has('receive')) {
            <a
              matButton="filled"
              routerLink="/compras/recepciones/nueva"
              [queryParams]="{ oc: o.id }"
            >
              Recibir
            </a>
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

    .totals {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 4px 16px;
      max-width: 280px;
      margin: 12px 0 0 auto;

      dt {
        color: var(--mat-sys-on-surface-variant);
        text-align: right;
      }

      dd {
        margin: 0;
        text-align: right;
      }

      .total {
        font-weight: 700;
      }
    }

    .receipts {
      margin: 0;
      padding: 0;
      list-style: none;

      li {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        padding: 6px 0;
        border-bottom: 1px solid var(--pan-row-divider);
      }
    }
  `,
})
export class PurchaseOrderDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(PurchaseOrdersApi);
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
  protected readonly actions = computed(() => {
    const o = this.order();
    return o ? purchaseOrderActions(o.status, (p) => this.auth.can(p)) : [];
  });

  constructor() {
    effect(() => {
      const o = this.order();
      if (o) this.breadcrumbs.setCurrent(o.folio);
    });
  }

  protected has(action: PurchaseOrderAction): boolean {
    return this.actions().includes(action);
  }

  protected async submit(o: PurchaseOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Enviar orden de compra',
      message:
        'Si el subtotal alcanza el umbral de aprobación queda por aprobar; si no, se aprueba en este momento. Ya no se edita.',
      summary: [
        { label: 'Proveedor', value: o.supplierName },
        { label: 'Subtotal', value: formatMxn(o.subtotal) },
        { label: 'Total con IVA', value: formatMxn(o.total) },
      ],
      confirmLabel: 'Enviar',
    });
    if (confirmed) await this.run(this.api.submit(o.id, o.version), `Orden ${o.folio} enviada.`);
  }

  protected async approve(o: PurchaseOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Aprobar orden de compra',
      message: 'Queda lista para recibirse.',
      summary: [
        { label: 'Proveedor', value: o.supplierName },
        { label: 'Total con IVA', value: formatMxn(o.total) },
      ],
      confirmLabel: 'Aprobar',
    });
    if (confirmed) await this.run(this.api.approve(o.id, o.version), `Orden ${o.folio} aprobada.`);
  }

  protected async reject(o: PurchaseOrder): Promise<void> {
    const reason = await this.reasons.ask({
      title: `Rechazar ${o.folio}`,
      message: 'El rechazo es final.',
      confirmLabel: 'Rechazar',
    });
    if (reason)
      await this.run(this.api.reject(o.id, o.version, reason), `Orden ${o.folio} rechazada.`);
  }

  protected async cancel(o: PurchaseOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar orden de compra',
      message: `La orden ${o.folio} queda cancelada; no se puede deshacer.`,
      confirmLabel: 'Cancelar orden',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed) await this.run(this.api.cancel(o.id, o.version), `Orden ${o.folio} cancelada.`);
  }

  protected async close(o: PurchaseOrder): Promise<void> {
    const reason = await this.reasons.ask({
      title: `Cerrar ${o.folio} con saldo`,
      message: 'Lo pendiente ya no se recibirá en esta orden.',
      label: 'Motivo del cierre',
      confirmLabel: 'Cerrar con saldo',
    });
    if (reason)
      await this.run(
        this.api.close(o.id, o.version, reason),
        `Orden ${o.folio} cerrada con saldo.`,
      );
  }

  /** Runs an action and shows the order it returns (errors open their dialog from the interceptor). */
  private async run(action: Observable<PurchaseOrder>, message: string): Promise<void> {
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
