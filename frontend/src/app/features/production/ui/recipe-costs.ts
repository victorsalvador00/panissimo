import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe, QtyPipe } from '../../../shared/pipes/pipes';
import { RecipesApi } from '../data-access/production-api';
import { unitCostChangePct } from './recipe-cost-rules';

/**
 * Costos tab of a recipe (frontend §7.4, RN-51): every version of the product costed at today's average costs of the
 * plant, newest first, with the change of unit cost against the previous version and the components whose purchase
 * cost rose recently. Read only.
 */
@Component({
  selector: 'app-recipe-costs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, MatButtonModule, MatIconModule, StatusTag, MxnPipe, QtyPipe],
  template: `
    @if (costs.error()) {
      <section class="pan-card state" role="alert">
        <p>No se pudieron calcular los costos.</p>
        <button matButton="tonal" type="button" (click)="costs.reload()">Reintentar</button>
      </section>
    } @else if (data(); as data) {
      <p class="muted">
        Costo teórico con el costo promedio vigente de la Planta (con sus subalmacenes): cantidad ×
        (1 + merma) × costo, entre el rendimiento. Se marcan los componentes cuyo último costo de
        compra subió {{ data.alertPct }} % o más en los últimos 30 días.
      </p>
      @for (version of data.versions; track version.recipeId; let i = $index) {
        <section
          class="pan-card version"
          [class.current]="version.recipeId === recipeId()"
          [attr.aria-labelledby]="'cost-v' + version.recipeVersion"
        >
          <header>
            <h2 [id]="'cost-v' + version.recipeVersion">
              @if (version.recipeId === recipeId()) {
                Versión {{ version.recipeVersion }}
              } @else {
                <a
                  class="row-link"
                  [routerLink]="['/produccion/recetas', version.recipeId]"
                  [queryParams]="{ tab: 'costos' }"
                >
                  Versión {{ version.recipeVersion }}
                </a>
              }
            </h2>
            <app-status-tag
              [text]="version.isActive ? 'Activa' : 'Inactiva'"
              [color]="version.isActive ? 'green' : 'grey'"
            />
            @if (version.increaseCount > 0) {
              <app-status-tag
                [text]="
                  version.increaseCount +
                  (version.increaseCount === 1 ? ' insumo subió' : ' insumos subieron')
                "
                color="orange"
              />
            }
          </header>
          <dl class="totals">
            <div>
              <dt>Costo por {{ data.baseUomCode }}</dt>
              <dd class="strong">{{ version.unitCost | mxn: 4 }}</dd>
            </div>
            <div>
              <dt>Costo de {{ version.yieldQty | qty: data.baseUomCode }}</dt>
              <dd>{{ version.totalCost | mxn }}</dd>
            </div>
            @if (change(i); as pct) {
              <div>
                <dt>Contra la versión {{ data.versions[i + 1].recipeVersion }}</dt>
                <dd [class.up]="pct > 0" [class.down]="pct < 0">
                  {{ pct > 0 ? '+' : '' }}{{ pct | number: '1.1-1' }} %
                </dd>
              </div>
            }
          </dl>
          <div class="table-wrap">
            <table [attr.aria-label]="'Costo de la versión ' + version.recipeVersion">
              <thead>
                <tr>
                  <th scope="col">Componente</th>
                  <th scope="col" class="end">Cantidad</th>
                  <th scope="col" class="end">Merma</th>
                  <th scope="col" class="end">Costo promedio</th>
                  <th scope="col" class="end">Costo</th>
                  <th scope="col">Alza</th>
                </tr>
              </thead>
              <tbody>
                @for (line of version.lines; track line.componentItemId) {
                  <tr>
                    <th scope="row">
                      <strong>{{ line.sku }}</strong> {{ line.name }}
                    </th>
                    <td class="end">{{ line.quantity | qty: line.baseUomCode }}</td>
                    <td class="end">{{ line.wastePct | number: '1.0-2' }} %</td>
                    <td class="end">
                      @if (line.averageCost > 0) {
                        {{ line.averageCost | mxn: 4 }}
                      } @else {
                        <span class="missing">Sin costo</span>
                      }
                    </td>
                    <td class="end">{{ line.lineCost | mxn }}</td>
                    <td>
                      @if (line.increase; as up) {
                        <span class="up">
                          +{{ up.increasePct | number: '1.0-2' }} % ({{
                            up.previousCost | mxn: 4
                          }}
                          → {{ up.lastCost | mxn: 4 }}, {{ dateText(up.receivedOn) }})
                        </span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else {
      <p class="muted" role="status">Calculando los costos…</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }
    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .version {
      display: grid;
      gap: 12px;
      margin: 0;

      &.current {
        outline: 2px solid var(--mat-sys-primary);
      }
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;

      h2 {
        margin: 0;
        font: var(--mat-sys-title-medium);
      }
    }
    .totals {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 32px;
      margin: 0;

      dt {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
      }
      dd {
        margin: 0;
        font: var(--mat-sys-title-medium);
      }
      .strong {
        font-weight: 700;
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
        padding: 6px 8px;
        border-bottom: 1px solid var(--pan-row-divider);
        text-align: left;
      }
      thead th {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-medium);
        white-space: nowrap;
      }
      tbody th {
        font-weight: 400;
      }
    }
    .end {
      text-align: right !important;
      white-space: nowrap;
    }
    .up,
    .missing {
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }
    .down {
      color: var(--pan-status-green-fg);
      font-weight: 600;
    }
    .state {
      display: flex;
      align-items: center;
      gap: 12px;

      p {
        flex: 1;
        margin: 0;
      }
    }
  `,
})
export class RecipeCosts {
  readonly recipeId = input.required<string>();
  /** The plant whose average costs are used. */
  readonly locationId = input.required<string>();

  private readonly api = inject(RecipesApi);
  protected readonly costs = rxResource({
    params: () => ({ id: this.recipeId(), locationId: this.locationId() }),
    stream: ({ params }) => (params.id ? this.api.costs(params.id, params.locationId) : of(null)),
  });
  protected readonly data = computed(() => (this.costs.hasValue() ? this.costs.value() : null));

  protected change(index: number): number | null {
    const data = this.data();
    return data ? unitCostChangePct(data.versions, index) : null;
  }

  protected dateText(iso: string): string {
    return iso.split('-').reverse().join('/');
  }
}
