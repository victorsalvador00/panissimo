import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/auth/auth.service';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe, StatusLabelPipe } from '../../../shared/pipes/pipes';
import { AdjustmentsApi } from '../data-access/inventory-api';

/** /inventario/ajustes/:id: the adjustment, its lines and the movements it posted (lots taken and costs). */
@Component({
  selector: 'app-adjustment-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PageHeader, StatusTag, Stamp, AuditPanel, QtyPipe, MxnPipe, StatusLabelPipe],
  template: `
    @if (adjustment.hasValue()) {
      @let a = adjustment.value();
      <app-page-header [title]="'Ajuste ' + a.folio">
        <app-status-tag [value]="a.status" kind="AdjustmentStatus" />
      </app-page-header>

      <div class="layout">
        <div class="main">
          <section class="pan-card">
            <dl class="data">
              <dt>Ubicación</dt>
              <dd>{{ a.locationCode }}</dd>
              <dt>Motivo</dt>
              <dd>{{ a.reason | statusLabel: 'AdjustmentReason' }}</dd>
              <dt>Importe</dt>
              <dd>{{ a.totalCost | mxn }}</dd>
              <dt>Registró</dt>
              <dd><app-stamp [at]="a.createdAt" [by]="a.createdByName" /></dd>
              @if (a.notes) {
                <dt>Notas</dt>
                <dd>{{ a.notes }}</dd>
              }
            </dl>
          </section>

          <section class="pan-card" aria-labelledby="adjustment-lines">
            <h2 id="adjustment-lines">Líneas</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col">Lote</th>
                    <th scope="col" class="end">Cantidad</th>
                    <th scope="col" class="end">Costo capturado</th>
                    <th scope="col">Merma</th>
                    <th scope="col">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  @for (line of a.lines; track line.id) {
                    <tr>
                      <td>
                        <strong>{{ line.sku }}</strong> {{ line.itemName }}
                      </td>
                      <td>{{ line.lotNumber ?? (line.quantity < 0 ? 'Automático' : '—') }}</td>
                      <td
                        class="end"
                        [class.entry]="line.quantity > 0"
                        [class.exit]="line.quantity < 0"
                      >
                        {{ line.quantity > 0 ? '+' : '' }}{{ line.quantity | qty }}
                      </td>
                      <td class="end">
                        {{ line.unitCost === null ? '—' : (line.unitCost | mxn) }}
                      </td>
                      <td>
                        @if (line.wasteQty) {
                          {{ line.wasteQty | qty }} ·
                          {{ line.wasteReason | statusLabel: 'AdjustmentReason' }}
                        } @else {
                          —
                        }
                      </td>
                      <td>{{ line.notes ?? '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="pan-card" aria-labelledby="adjustment-movements">
            <h2 id="adjustment-movements">Movimientos registrados</h2>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col">Lote</th>
                    <th scope="col">Caducidad</th>
                    <th scope="col" class="end">Cantidad</th>
                    <th scope="col" class="end">Costo unitario</th>
                    <th scope="col" class="end">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  @for (movement of a.movements; track $index) {
                    <tr>
                      <td>{{ movement.sku }}</td>
                      <td>{{ movement.lotNumber ?? '—' }}</td>
                      <td>
                        {{
                          movement.expirationDate
                            ? (movement.expirationDate | date: 'dd/MM/yyyy')
                            : '—'
                        }}
                      </td>
                      <td
                        class="end"
                        [class.entry]="movement.quantity > 0"
                        [class.exit]="movement.quantity < 0"
                      >
                        {{ movement.quantity > 0 ? '+' : '' }}{{ movement.quantity | qty }}
                      </td>
                      <td class="end">{{ movement.unitCost | mxn }}</td>
                      <td class="end">{{ movement.totalCost | mxn }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>

        @if (canSeeAudit) {
          <aside class="pan-card side">
            <app-audit-panel [entityId]="a.id" />
          </aside>
        }
      </div>
    } @else if (adjustment.isLoading()) {
      <p role="status">Cargando…</p>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
      gap: 16px;
      align-items: start;
    }

    .main {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
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

    .entry {
      color: var(--pan-status-green-fg);
      font-weight: 600;
    }

    .exit {
      color: var(--pan-status-red-fg);
      font-weight: 600;
    }

    @media (max-width: 1023.98px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class AdjustmentDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(AdjustmentsApi);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly canSeeAudit = inject(AuthService).can('security.audit.view');

  protected readonly adjustment = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });

  constructor() {
    effect(() => {
      if (this.adjustment.hasValue()) this.breadcrumbs.setCurrent(this.adjustment.value().folio);
    });
  }
}
