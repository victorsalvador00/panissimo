import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { LocationContextService } from '../../../core/context/location-context.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { DashboardApi, LocationCount } from '../data-access/dashboard.api';
import { dashboardCards } from '../ui/dashboard-cards';
import { LowStockChart } from '../ui/low-stock-chart';

/**
 * Tablero de la ubicación activa (spec frontend §7.8): una tarjeta por indicador que el usuario puede
 * ver, cada una enlazada a su lista filtrada. Con `locations.all` agrega la gráfica de artículos bajo
 * mínimo por ubicación. Se vuelve a consultar al cambiar de ubicación.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, PageHeader, LowStockChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page sgo-stack">
      <app-page-header
        title="Tablero"
        [subtitle]="location() ? location()!.code + ' · ' + location()!.name : ''"
      />

      @if (!location()) {
        <p class="notice notice-info">
          No tienes ubicaciones asignadas. Pide acceso al administrador.
        </p>
      } @else if (dashboard.error()) {
        <div class="notice notice-error sgo-row error" role="alert">
          <span>No se pudieron cargar los indicadores.</span>
          <button mat-stroked-button type="button" (click)="dashboard.reload()">Reintentar</button>
        </div>
      } @else if (!dashboard.hasValue()) {
        <div class="cards" aria-busy="true" aria-label="Cargando indicadores">
          @for (i of skeleton; track i) {
            <div class="card skeleton"></div>
          }
        </div>
      } @else {
        @if (cards().length) {
          <ul class="cards">
            @for (card of cards(); track card.id) {
              <li>
                <a
                  class="card"
                  [class.attention]="card.alert && card.count > 0"
                  [routerLink]="card.link"
                  [queryParams]="card.queryParams"
                >
                  <mat-icon aria-hidden="true">{{ card.icon }}</mat-icon>
                  <span class="count">{{ card.count }}</span>
                  <span class="label">{{ card.label }}</span>
                  @if (card.detail) {
                    <span class="detail">{{ card.detail }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        } @else {
          <mat-card appearance="outlined">
            <mat-card-content class="empty">
              <mat-icon aria-hidden="true">dashboard</mat-icon>
              <p>No hay indicadores para tu rol en esta ubicación.</p>
            </mat-card-content>
          </mat-card>
        }

        @if (lowStockByLocation(); as rows) {
          <mat-card appearance="outlined">
            <mat-card-content>
              <h2>Artículos bajo mínimo por ubicación</h2>
              @if (anyLowStock()) {
                <p class="hint">Toca una barra para ver los artículos de esa ubicación.</p>
                <app-low-stock-chart [data]="rows" (selected)="openLocation($event)" />
              } @else {
                <p class="hint">Ninguna ubicación tiene artículos bajo mínimo.</p>
              }
            </mat-card-content>
          </mat-card>
        }
      }
    </section>
  `,
  styles: `
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--sgo-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    @media (max-width: 599.98px) {
      .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .card {
      display: grid;
      grid-template-columns: auto 1fr;
      grid-template-areas:
        'icon count'
        'label label'
        'detail detail';
      align-items: center;
      align-content: start;
      gap: var(--sgo-space-1) var(--sgo-space-2);
      height: 100%;
      box-sizing: border-box;
      padding: var(--sgo-space-4);
      border: 1px solid var(--sgo-card-border);
      border-radius: var(--sgo-card-radius);
      background: var(--sgo-card-bg);
      box-shadow: var(--sgo-card-shadow);
      color: var(--mat-sys-on-surface);
      text-decoration: none;
    }
    a.card:hover {
      background: var(--sgo-row-hover);
    }
    a.card:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
    .card mat-icon {
      grid-area: icon;
      color: var(--mat-sys-on-surface-variant);
    }
    .count {
      grid-area: count;
      justify-self: end;
      font: var(--mat-sys-headline-medium);
      font-variant-numeric: tabular-nums;
    }
    .label {
      grid-area: label;
      font: var(--mat-sys-title-small);
    }
    .detail {
      grid-area: detail;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .card.attention {
      border-color: var(--sgo-status-orange-fg);
      border-inline-start-width: 4px;
    }
    .card.attention mat-icon,
    .card.attention .count {
      color: var(--sgo-status-orange-fg);
    }
    .skeleton {
      min-height: 120px;
      background: var(--mat-sys-surface-container);
    }
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .hint {
      margin: var(--sgo-space-1) 0 var(--sgo-space-3);
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .empty {
      display: flex;
      align-items: center;
      gap: var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      flex-wrap: wrap;
      justify-content: space-between;
    }
  `,
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly router = inject(Router);
  private readonly locationContext = inject(LocationContextService);

  protected readonly location = this.locationContext.activeLocation;
  protected readonly skeleton = [1, 2, 3, 4];

  protected readonly dashboard = rxResource({
    params: () => this.location()?.id,
    stream: ({ params }) => this.api.get(params),
  });

  protected readonly cards = computed(() => {
    const dashboard = this.dashboard.value();
    return dashboard ? dashboardCards(dashboard, this.location()?.type) : [];
  });
  protected readonly lowStockByLocation = computed(
    () => this.dashboard.value()?.lowStockByLocation ?? null,
  );
  protected readonly anyLowStock = computed(() =>
    (this.lowStockByLocation() ?? []).some((row) => row.count > 0),
  );

  /** Cambia a esa ubicación (si es del usuario) y abre sus artículos bajo mínimo. */
  protected openLocation(row: LocationCount): void {
    if (this.locationContext.locations().some((location) => location.id === row.locationId)) {
      this.locationContext.select(row.locationId);
    }
    void this.router.navigate(['/inventario/existencias'], { queryParams: { bajoMinimo: '1' } });
  }
}
