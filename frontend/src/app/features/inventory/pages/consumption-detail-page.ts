import { DatePipe } from '@angular/common';
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
import { ConsumptionsApi } from '../data-access/consumptions.api';
import { Stamp } from '../../../shared/components/stamp/stamp';

/** Detalle de un consumo registrado: salidas por lote con su costo e historial. */
@Component({
  selector: 'app-consumption-detail-page',
  imports: [
    Stamp,
    RouterLink,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      @if (entry.value(); as entry) {
        <app-page-header
          [title]="'Consumo ' + entry.folio"
          [subtitle]="entry.locationCode + ' · ' + (entry.businessDate | date: 'dd/MM/yyyy')"
          [crumbs]="[
            { label: 'Inventario' },
            { label: 'Consumos', url: '/inventario/consumos' },
            { label: entry.folio },
          ]"
        >
          <app-status-tag [status]="entry.status" kind="ConsumptionStatus" />
        </app-page-header>

        <mat-card appearance="outlined">
          <mat-card-content>
            <dl>
              <div>
                <dt>Registrado</dt>
                <dd><app-stamp [at]="entry.createdAt" [by]="entry.createdByName" /></dd>
              </div>
              <div>
                <dt>Costo total</dt>
                <dd>{{ entry.totalCost | mxn }}</dd>
              </div>
              @if (entry.notes) {
                <div>
                  <dt>Notas</dt>
                  <dd>{{ entry.notes }}</dd>
                </div>
              }
            </dl>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <h2>Salidas registradas</h2>
            <ul class="lines">
              @for (movement of entry.movements; track $index) {
                <li>
                  <div class="info">
                    <span class="name">{{ movement.sku }}</span>
                    <span class="meta">
                      @if (movement.lotNumber) {
                        Lote {{ movement.lotNumber }} ·
                      }
                      {{ movement.unitCost | mxn: '1.2-4' }} c/u · {{ movement.totalCost | mxn }}
                    </span>
                  </div>
                  <strong class="qty">{{ movement.quantity | qty }}</strong>
                </li>
              }
            </ul>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-content>
            <app-audit-panel [entityId]="entry.id" />
          </mat-card-content>
        </mat-card>
      } @else if (entry.error()) {
        <p class="notice notice-error">No se encontró el consumo.</p>
        <a mat-button routerLink="/inventario/consumos">Volver a consumos</a>
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
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
    .lines {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--sgo-space-3);
      padding: var(--sgo-space-2) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .info {
      display: grid;
      min-width: 0;
    }
    .name {
      font-weight: 500;
    }
    .meta,
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
    .meta {
      font: var(--mat-sys-body-small);
    }
    .qty {
      color: var(--sgo-status-red-fg);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class ConsumptionDetailPage {
  private readonly api = inject(ConsumptionsApi);

  readonly id = input.required<string>();

  protected readonly entry = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
}
