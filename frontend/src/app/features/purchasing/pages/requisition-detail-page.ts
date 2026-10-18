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
import { documentLink } from '../../../shared/data-access/document-links';
import { MxnPipe, QtyPipe, formatMxn } from '../../../shared/pipes/pipes';
import { Requisition, RequisitionsApi } from '../data-access/purchasing-api';
import { RequisitionAction, requisitionActions } from '../ui/requisition-actions';

/**
 * /compras/requisiciones/:id (frontend §7.6, RN-34): the requisition with its lines, suppliers and estimated amounts;
 * actions by state and permission (send, approve, reject with a reason, cancel, convert to a purchase order).
 */
@Component({
  selector: 'app-requisition-detail-page',
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
    @if (requisition(); as r) {
      <app-page-header [title]="'Requisición ' + r.folio">
        <app-status-tag [value]="r.status" kind="RequisitionStatus" />
      </app-page-header>

      <div class="layout" [class.pan-has-action-bar]="actions().length > 0">
        <section class="pan-card">
          <dl class="data">
            <dt>Ubicación</dt>
            <dd>{{ r.locationName }}</dd>
            <dt>Se necesita</dt>
            <dd>{{ r.neededBy | date: 'dd/MM/yyyy' }}</dd>
            <dt>Estimado</dt>
            <dd>{{ r.estimatedSubtotal | mxn }} <span class="muted">sin IVA</span></dd>
            @if (r.notes) {
              <dt>Notas</dt>
              <dd>{{ r.notes }}</dd>
            }
            <dt>Creada</dt>
            <dd><app-stamp [at]="r.createdAt" [by]="r.createdByName" /></dd>
            @if (r.submittedAt) {
              <dt>Enviada</dt>
              <dd><app-stamp [at]="r.submittedAt" [by]="r.submittedByName" /></dd>
            }
            @if (r.approvedAt) {
              <dt>Aprobada</dt>
              <dd><app-stamp [at]="r.approvedAt" [by]="r.approvedByName" /></dd>
            }
            @if (r.rejectedAt) {
              <dt>Rechazada</dt>
              <dd>
                <app-stamp [at]="r.rejectedAt" [by]="r.rejectedByName" />
                · {{ r.rejectionReason }}
              </dd>
            }
          </dl>
        </section>

        <section class="pan-card" aria-labelledby="requisition-lines">
          <h2 id="requisition-lines">Artículos</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Artículo</th>
                  <th scope="col" class="end">Cantidad</th>
                  <th scope="col">Proveedor</th>
                  <th scope="col" class="end">Precio</th>
                  <th scope="col" class="end">Importe</th>
                  <th scope="col">OC</th>
                </tr>
              </thead>
              <tbody>
                @for (line of r.lines; track line.id) {
                  <tr>
                    <td>{{ line.lineNumber }}</td>
                    <td>
                      <strong>{{ line.sku }}</strong> {{ line.itemName }}
                      @if (line.notes) {
                        <span class="muted">· {{ line.notes }}</span>
                      }
                    </td>
                    <td class="end">{{ line.quantity | qty: line.uomCode }}</td>
                    <td>
                      @if (line.suggestedSupplierName) {
                        {{ line.suggestedSupplierName }}
                      } @else {
                        <span class="exit">Sin proveedor</span>
                      }
                    </td>
                    <td class="end">{{ line.estimatedUnitPrice | mxn }}</td>
                    <td class="end">{{ line.estimatedAmount | mxn }}</td>
                    <td>
                      @if (line.purchaseOrderId) {
                        @if (orderLink(line.purchaseOrderId); as link) {
                          <a class="row-link" [routerLink]="link">{{ line.purchaseOrderFolio }}</a>
                        } @else {
                          {{ line.purchaseOrderFolio }}
                        }
                      } @else {
                        —
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>

      @if (actions().length > 0) {
        <div class="pan-action-bar">
          @if (has('cancel')) {
            <button matButton type="button" [disabled]="busy()" (click)="cancel(r)">
              Cancelar requisición
            </button>
          }
          @if (has('edit')) {
            <a matButton="tonal" routerLink="editar">
              <mat-icon>edit</mat-icon>
              Editar
            </a>
          }
          @if (has('submit')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="submit(r)">
              Enviar a aprobación
            </button>
          }
          @if (has('reject')) {
            <button matButton="tonal" type="button" [disabled]="busy()" (click)="reject(r)">
              Rechazar
            </button>
          }
          @if (has('approve')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="approve(r)">
              Aprobar
            </button>
          }
          @if (has('convert')) {
            <button matButton="filled" type="button" [disabled]="busy()" (click)="convert(r)">
              Convertir a OC
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

    .exit {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }
  `,
})
export class RequisitionDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(RequisitionsApi);
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
  protected readonly requisition = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly actions = computed(() => {
    const r = this.requisition();
    return r ? requisitionActions(r.status, (p) => this.auth.can(p)) : [];
  });

  constructor() {
    effect(() => {
      const r = this.requisition();
      if (r) this.breadcrumbs.setCurrent(r.folio);
    });
  }

  protected has(action: RequisitionAction): boolean {
    return this.actions().includes(action);
  }

  protected orderLink(id: string): string[] | null {
    return documentLink('PurchaseOrder', id);
  }

  protected async submit(r: Requisition): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Enviar a aprobación',
      message: 'Ya no se edita; quien aprueba compras la aprueba o la rechaza.',
      summary: [
        { label: 'Líneas', value: String(r.lines.length) },
        { label: 'Estimado', value: formatMxn(r.estimatedSubtotal) },
      ],
      confirmLabel: 'Enviar',
    });
    if (confirmed)
      await this.run(this.api.submit(r.id, r.version), `Requisición ${r.folio} enviada.`);
  }

  protected async approve(r: Requisition): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Aprobar requisición',
      message: 'Queda lista para convertirse en orden de compra.',
      summary: [{ label: 'Estimado', value: formatMxn(r.estimatedSubtotal) }],
      confirmLabel: 'Aprobar',
    });
    if (confirmed)
      await this.run(this.api.approve(r.id, r.version), `Requisición ${r.folio} aprobada.`);
  }

  protected async reject(r: Requisition): Promise<void> {
    const reason = await this.reasons.ask({
      title: `Rechazar ${r.folio}`,
      message: 'El rechazo es final; quien la pidió verá el motivo.',
      confirmLabel: 'Rechazar',
    });
    if (reason)
      await this.run(this.api.reject(r.id, r.version, reason), `Requisición ${r.folio} rechazada.`);
  }

  protected async cancel(r: Requisition): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar requisición',
      message: `La requisición ${r.folio} queda cancelada; no se puede deshacer.`,
      confirmLabel: 'Cancelar requisición',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed)
      await this.run(this.api.cancel(r.id, r.version), `Requisición ${r.folio} cancelada.`);
  }

  protected async convert(r: Requisition): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Convertir a orden de compra',
      message:
        'Se crea una orden de compra en borrador por proveedor, con el precio del catálogo y el IVA de cada artículo.',
      summary: [{ label: 'Estimado', value: formatMxn(r.estimatedSubtotal) }],
      confirmLabel: 'Convertir',
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      const orders = await firstValueFrom(this.api.convert([r.id]));
      this.notifier.info(`Órdenes de compra generadas: ${orders.map((o) => o.folio).join(', ')}.`);
    } catch {
      // The error interceptor shows why.
    } finally {
      this.busy.set(false);
      this.resource.reload();
    }
  }

  /** Runs an action and shows the requisition it returns (errors open their dialog from the interceptor). */
  private async run(action: Observable<Requisition>, message: string): Promise<void> {
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
