import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  DIRECTION_SEGMENTS,
  SOURCE_SEGMENTS,
  TraceSourceType,
  defaultDirection,
} from '../../data-access/traceability-api';

/**
 * "Rastrear" shortcut (trazabilidad §6.2): opens the traceability of a lot or a document with the direction of RN-100.
 * Only with [inventory.traceability]; `compact` shows the icon alone (rows of tables).
 */
@Component({
  selector: 'app-trace-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (allowed && id()) {
      @if (compact()) {
        <a
          matIconButton
          class="compact"
          [routerLink]="route()"
          [queryParams]="query()"
          [attr.aria-label]="'Rastrear ' + (label() ?? '')"
          [matTooltip]="'Rastrear ' + (label() ?? '')"
        >
          <mat-icon>account_tree</mat-icon>
        </a>
      } @else {
        <a matButton [routerLink]="route()" [queryParams]="query()">
          <mat-icon>account_tree</mat-icon>
          Rastrear
        </a>
      }
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .compact {
      --mat-icon-button-state-layer-size: 32px;
      width: 32px;
      height: 32px;
      padding: 4px;
    }

    .compact mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  `,
})
export class TraceLink {
  readonly type = input.required<TraceSourceType>();
  readonly id = input<string | null | undefined>();
  /** What is traced, for the accessible name of the icon ("lote HT-2609-C"). */
  readonly label = input<string | null>(null);
  readonly compact = input(false);
  protected readonly allowed = inject(AuthService).can('inventory.traceability');
  protected readonly route = computed(() => [
    '/inventario/trazabilidad',
    SOURCE_SEGMENTS[this.type()],
    this.id(),
  ]);
  protected readonly query = computed(() => ({
    direccion: DIRECTION_SEGMENTS[defaultDirection(this.type())],
  }));
}
