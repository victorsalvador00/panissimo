import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { StatusLabelPipe } from '../../../shared/pipes/status-label.pipe';
import { AdjustmentsApi } from '../data-access/adjustments.api';
import { Stamp } from '../../../shared/components/stamp/stamp';

/** Detalle de un ajuste registrado: líneas, movimientos con su costo e historial. */
@Component({
  selector: 'app-adjustment-detail-page',
  imports: [
    Stamp,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      @if (adjustment.value(); as adj) {
        <app-page-header
          [title]="'Ajuste ' + adj.folio"
          [subtitle]="(adj.reason | statusLabel: 'AdjustmentReason') + ' · ' + adj.locationCode"
          [crumbs]="[
            { label: 'Inventario' },
            { label: 'Ajustes', url: '/inventario/ajustes' },
            { label: adj.folio },
          ]"
        >
          <app-status-tag [status]="adj.status" kind="AdjustmentStatus" />
        </app-page-header>

        <mat-card appearance="outlined">
          <mat-card-content>
            <dl>
              <div>
                <dt>Fecha</dt>
                <dd><app-stamp [at]="adj.createdAt" [by]="adj.createdByName" /></dd>
              </div>
              <div>
                <dt>Costo total</dt>
                <dd>{{ adj.totalCost | mxn }}</dd>
              </div>
              @if (adj.notes) {
                <div>
                  <dt>Notas</dt>
                  <dd>{{ adj.notes }}</dd>
                </div>
              }
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>Movimientos registrados</h2>
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col">Lote</th>
                    <th scope="col" class="end">Cantidad</th>
                    <th scope="col" class="end">Costo unitario</th>
                    <th scope="col" class="end">Costo total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (movement of adj.movements; track $index) {
                    <tr>
                      <td>{{ movement.sku }}</td>
                      <td>{{ movement.lotNumber ?? '—' }}</td>
                      <td
                        class="end"
                        [class.in]="movement.quantity > 0"
                        [class.out]="movement.quantity < 0"
                      >
                        {{ movement.quantity > 0 ? '+' : '' }}{{ movement.quantity | qty }}
                      </td>
                      <td class="end">{{ movement.unitCost | mxn: '1.2-4' }}</td>
                      <td class="end">{{ movement.totalCost | mxn }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <app-audit-panel [entityId]="adj.id" />
          </mat-card-content>
        </mat-card>
      } @else if (adjustment.error()) {
        <p class="notice notice-error">No se encontró el ajuste.</p>
        <a mat-button routerLink="/inventario/ajustes">Volver a ajustes</a>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </section>
  `,
  styles: `
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--sgo-space-3);
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    dd {
      margin: 0;
    }
    .scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: var(--sgo-space-2) var(--sgo-space-3);
      text-align: start;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    th {
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }
    .end {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .in {
      color: var(--sgo-status-green-fg);
    }
    .out {
      color: var(--sgo-status-red-fg);
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AdjustmentDetailPage {
  private readonly api = inject(AdjustmentsApi);

  readonly id = input.required<string>();

  protected readonly adjustment = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
}
