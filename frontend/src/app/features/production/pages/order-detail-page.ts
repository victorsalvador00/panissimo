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
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { ProgressMeter } from '../../../shared/components/progress-meter/progress-meter';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { documentLink } from '../../../shared/data-access/document-links';
import { MxnPipe, QtyPipe, StatusLabelPipe, formatQty } from '../../../shared/pipes/pipes';
import { ProductionOrder, ProductionOrdersApi } from '../data-access/production-api';
import { CloseTimeline } from '../ui/close-timeline';
import { componentWaste, productionOrderActions } from '../ui/order-actions';
import { TraceLink } from '../../inventory/ui/trace/trace-link';

/** Document type of each demand, for its link (the screens arrive with F-16 and F-17). */
const DEMAND_DOCS = {
  BranchOrderLine: 'BranchOrder',
  CustomerOrderLine: 'CustomerOrder',
  ParentOrder: 'ProductionOrder',
} as const;

/**
 * /produccion/ordenes/:id (frontend §7.4.2): header with product, recipe, factory (RN-49), shift, date, origin and progress;
 * actions by state and permission (RN-60); tabs Componentes, Cierres (timeline), Pedidos and Historial.
 */
@Component({
  selector: 'app-order-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TraceLink,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    PageHeader,
    StatusTag,
    Stamp,
    ProgressMeter,
    AuditPanel,
    CloseTimeline,
    QtyPipe,
    MxnPipe,
    StatusLabelPipe,
  ],
  templateUrl: './order-detail-page.html',
  styleUrl: './order-detail-page.scss',
})
export class OrderDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(ProductionOrdersApi);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
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
  protected readonly closes = rxResource({
    params: () => {
      const order = this.order();
      return order && order.closeCount > 0 ? { id: order.id, count: order.closeCount } : undefined;
    },
    stream: ({ params }) => this.api.closes(params.id),
    defaultValue: [],
  });
  protected readonly actions = computed(() => {
    const order = this.order();
    return order ? productionOrderActions(order, (p) => this.auth.can(p)) : [];
  });
  /** RN-111: the order's components come from sub-warehouses. */
  protected readonly hasSources = computed(
    () => !!this.order()?.lines.some((l) => l.sourceLocationId),
  );
  /** Availability is shown while the order is open. */
  protected readonly open = computed(() => {
    const status = this.order()?.status;
    return status === 'Draft' || status === 'Released' || status === 'InProgress';
  });

  constructor() {
    effect(() => {
      const order = this.order();
      if (order) this.breadcrumbs.setCurrent(order.folio);
    });
  }

  /** Production waste in pesos (RN-13): the sum of the closes. */
  protected readonly wasteTotal = computed(() =>
    this.closes.value().reduce((sum, close) => sum + close.wasteCost, 0),
  );

  protected waste(line: ProductionOrder['lines'][number]): number | null {
    const order = this.order();
    return order ? componentWaste(line, order) : null;
  }

  protected has(action: ReturnType<typeof productionOrderActions>[number]): boolean {
    return this.actions().includes(action);
  }

  protected demandLink(type: keyof typeof DEMAND_DOCS, id: string): string[] | null {
    return documentLink(DEMAND_DOCS[type], id);
  }

  protected async release(order: ProductionOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Liberar orden',
      message: order.factoryId
        ? `La orden queda lista para producir y ya no se edita. Se reserva cada componente en su origen y se genera un vale de ingredientes por origen hacia ${order.factoryCode}.`
        : 'La orden queda lista para producir y ya no se edita.',
      summary: [
        { label: 'Producto', value: `${order.sku} · ${order.itemName}` },
        { label: 'Cantidad', value: formatQty(order.plannedQty, order.baseUomCode) },
        ...(order.factoryId
          ? [
              {
                label: 'Orígenes',
                value: [
                  ...new Set(order.lines.map((l) => l.sourceLocationCode ?? 'sin origen')),
                ].join(', '),
              },
            ]
          : []),
      ],
      confirmLabel: 'Liberar',
    });
    if (confirmed)
      await this.run(this.api.release(order.id, order.version), `Orden ${order.folio} liberada.`);
  }

  protected async cancel(order: ProductionOrder): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar orden',
      message: order.vouchers?.some((v) => v.status === 'Draft')
        ? `La orden ${order.folio} queda cancelada; no se puede deshacer. Sus vales de ingredientes sin enviar se cancelan y liberan lo reservado.`
        : `La orden ${order.folio} queda cancelada; no se puede deshacer.`,
      confirmLabel: 'Cancelar orden',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (confirmed)
      await this.run(this.api.cancel(order.id, order.version), `Orden ${order.folio} cancelada.`);
  }

  /** Runs an action and shows the order it returns (errors open their dialog from the interceptor). */
  private async run(action: Observable<ProductionOrder>, message: string): Promise<void> {
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
