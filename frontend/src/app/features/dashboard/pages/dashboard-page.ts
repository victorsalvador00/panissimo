import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { BarChart, BarSeries } from '../../../shared/components/bar-chart/bar-chart';
import { CountsApi } from '../../inventory/data-access/inventory-api';
import { DashboardApi } from '../data-access/dashboard-api';
import { QuickAction, dashboardCards, quickActions } from '../ui/dashboard-cards';

/**
 * / (frontend §7.9): the dashboard of the active location. Cards by permission and location type, each opening its list
 * filtered by URL; production of today per factory (planned vs produced) and orders in process; with `locations.all`, items
 * under minimum per location (touching a bar switches location and opens the stock). On a phone, up to four quick actions.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatIconModule, BarChart],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly api = inject(DashboardApi);
  private readonly countsApi = inject(CountsApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly context = inject(LocationContextService);
  protected readonly location = this.context.active;

  protected readonly dashboard = rxResource({
    params: () => this.location()?.id ?? null,
    stream: ({ params }) => (params ? this.api.get(params) : of(null)),
  });
  private readonly data = computed(() =>
    this.dashboard.hasValue() ? this.dashboard.value() : null,
  );

  protected readonly cards = computed(() => {
    const data = this.data();
    return data ? dashboardCards(data, this.location()?.type ?? null) : [];
  });
  protected readonly actions = computed(() =>
    quickActions(this.location()?.type ?? null, (p) => this.auth.can(p)),
  );

  /** Production of today: one bar pair per factory and unit (kg and pieces are never added). */
  protected readonly productionToday = computed(() => {
    const rows = this.location()?.type === 'Plant' ? (this.data()?.productionToday ?? null) : null;
    if (!rows) return null;
    return {
      categories: rows.map((r) => `${r.factoryName} (${r.baseUomCode})`),
      units: rows.map((r) => r.baseUomCode),
      series: [
        { label: 'Planeado', values: rows.map((r) => r.planned), color: '--pan-chart-planned' },
        { label: 'Producido', values: rows.map((r) => r.produced), color: '--pan-chart-produced' },
      ] satisfies BarSeries[],
      orders: rows.reduce((sum, r) => sum + r.orders, 0),
    };
  });

  protected readonly lowStockByLocation = computed(() => {
    const rows = this.data()?.lowStockByLocation ?? null;
    if (!rows) return null;
    return {
      rows,
      categories: rows.map((r) => r.code),
      series: [
        {
          label: 'Artículos bajo mínimo',
          values: rows.map((r) => r.count),
          color: '--pan-chart-alert',
        },
      ] satisfies BarSeries[],
    };
  });

  /** Touching a location's bar makes it the active one and opens its stock under minimum. */
  protected openLowStock(index: number): void {
    const row = this.lowStockByLocation()?.rows[index];
    if (!row) return;
    if (this.context.locations().some((l) => l.id === row.locationId))
      this.context.setActive(row.locationId);
    void this.router.navigate(['/inventario/existencias'], { queryParams: { bajoMinimo: '1' } });
  }

  protected async run(action: QuickAction): Promise<void> {
    const location = this.location();
    switch (action.key) {
      case 'receive': {
        const pending = this.data()?.transfersToReceive;
        if (pending?.count === 1 && pending.items[0])
          await this.router.navigate(['/logistica/traspasos', pending.items[0].id, 'recibir']);
        else
          await this.router.navigate(['/logistica/traspasos'], {
            queryParams: { tab: 'InTransit' },
          });
        return;
      }
      case 'count': {
        const open = location
          ? await firstValueFrom(
              this.countsApi.list(
                { page: 1, pageSize: 2 },
                { locationId: location.id, status: 'InProgress' },
              ),
            ).catch(() => null)
          : null;
        if (open?.total === 1)
          await this.router.navigate(['/inventario/conteos', open.items[0].id]);
        else await this.router.navigate(['/inventario/conteos']);
        return;
      }
      case 'close':
        await this.router.navigate(['/produccion/ordenes'], { queryParams: { tab: 'InProgress' } });
        return;
      case 'consumption':
        await this.router.navigate(['/inventario/consumos/nuevo']);
        return;
      case 'order':
        await this.router.navigate(['/logistica/pedidos/nuevo']);
        return;
      case 'dispatch':
        await this.router.navigate(['/logistica/traspasos'], {
          queryParams: { tab: 'ToDispatch' },
        });
        return;
      case 'receipt':
        await this.router.navigate(['/compras/ordenes'], { queryParams: { tab: 'ToReceive' } });
        return;
    }
  }
}
