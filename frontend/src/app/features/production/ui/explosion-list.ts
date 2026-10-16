import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import type { Explosion } from '../data-access/recipes.api';

/**
 * Explosión teórica de una receta (RN-11): consumo por componente y, con ubicación, disponible,
 * faltante (en rojo) y costo estimado. Lista en vez de tabla para que quepa en celular.
 */
@Component({
  selector: 'app-explosion-list',
  imports: [QtyPipe, MxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = explosion();
    <ul class="lines">
      @for (line of e.lines; track line.componentItemId) {
        <li [class.short]="(line.shortage ?? 0) > 0">
          <div class="info">
            <span class="name">{{ line.name }}</span>
            <span class="meta">
              {{ line.sku }} · {{ line.quantityPerYield | qty: line.baseUomCode }} por
              {{ e.yieldQty | qty: outputUom() }}
              @if (line.wastePct > 0) {
                · merma {{ line.wastePct }} %
              }
            </span>
          </div>
          <div class="qty">
            <span>{{ line.theoreticalQty | qty: line.baseUomCode }}</span>
            @if (line.available !== null) {
              @if ((line.shortage ?? 0) > 0) {
                <span class="meta out">
                  Faltan {{ line.shortage | qty: line.baseUomCode }} · disp.
                  {{ line.available | qty: line.baseUomCode }}
                </span>
              } @else {
                <span class="meta">Disp. {{ line.available | qty: line.baseUomCode }}</span>
              }
            }
            @if (line.estimatedCost !== null) {
              <span class="meta">{{ line.estimatedCost | mxn }}</span>
            }
          </div>
        </li>
      }
    </ul>
    @if (e.estimatedTotalCost !== null) {
      <dl class="totals">
        <div>
          <dt>Costo estimado</dt>
          <dd>{{ e.estimatedTotalCost | mxn }}</dd>
        </div>
        <div>
          <dt>Costo unitario estimado</dt>
          <dd>{{ e.estimatedUnitCost | mxn }} / {{ outputUom() }}</dd>
        </div>
      </dl>
    }
  `,
  styles: `
    :host {
      display: block;
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
    li.short {
      border-inline-start: 4px solid var(--sgo-status-red-fg);
      padding-inline-start: var(--sgo-space-2);
    }
    .info,
    .qty {
      display: grid;
      min-width: 0;
    }
    .qty {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .name {
      font-weight: 500;
      overflow-wrap: anywhere;
    }
    .meta {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .meta.out {
      color: var(--sgo-status-red-fg);
    }
    .totals {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--sgo-space-2) var(--sgo-space-6);
      margin: var(--sgo-space-3) 0 0;
      text-align: end;
    }
    dt {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class ExplosionList {
  readonly explosion = input.required<Explosion>();
  /** Unidad base del producto (la explosión no la trae). */
  readonly outputUom = input<string | null>(null);
}
