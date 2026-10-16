import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { filter, Observable, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { ProductionOrderDto, ProductionOrdersApi } from '../data-access/production-orders.api';
import { RecipesApi } from '../data-access/recipes.api';
import { ExplosionList } from '../ui/explosion-list';
import { Stamp } from '../../../shared/components/stamp/stamp';

/**
 * Detalle de una orden de producción: editar, liberar o cancelar; completar (página propia); y, ya
 * completada, lo producido, el lote de salida, el costo y la merma por componente (RN-12, RN-13).
 */
@Component({
  selector: 'app-production-order-detail-page',
  imports: [
    Stamp,
    RouterLink,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    ExplosionList,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './production-order-detail-page.html',
  styleUrl: './production-order-detail-page.scss',
})
export class ProductionOrderDetailPage {
  private readonly api = inject(ProductionOrdersApi);
  private readonly recipes = inject(RecipesApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);
  private readonly locale = inject(LOCALE_ID);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly order = signal<ProductionOrderDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  protected readonly canManage = this.auth.can('production.orders.manage');
  protected readonly canComplete = this.auth.can('production.orders.complete');
  protected readonly open = computed(() => {
    const status = this.order()?.status;
    return status === 'Draft' || status === 'Released';
  });

  /** Mientras no se completa: consumo teórico con la disponibilidad actual en la ubicación. */
  protected readonly explosion = rxResource({
    params: () => {
      const order = this.order();
      return order && this.open()
        ? { recipeId: order.recipeId, qty: order.plannedQty, locationId: order.locationId }
        : undefined;
    },
    stream: ({ params }) => this.recipes.explode(params.recipeId, params.qty, params.locationId),
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected release(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.act(
      {
        title: `¿Liberar la orden ${order.folio}?`,
        message: 'Queda lista para producirse y ya no se puede editar. No se mueve inventario.',
        items: [
          { label: 'Producto', value: `${order.outputSku} · ${order.outputName}` },
          {
            label: 'Cantidad planeada',
            value: formatQty(order.plannedQty, this.locale, order.outputUomCode),
          },
        ],
        confirmLabel: 'Liberar',
      },
      () => this.api.release(order.id, order.version),
      (released) => `Orden ${released.folio} liberada.`,
    );
  }

  protected cancel(): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.act(
      {
        title: `¿Cancelar la orden ${order.folio}?`,
        message: 'La orden ya no se podrá completar. No se mueve inventario.',
        confirmLabel: 'Cancelar orden',
        cancelLabel: 'Volver',
        tone: 'warn',
      },
      () => this.api.cancel(order.id, order.version),
      (cancelled) => `Orden ${cancelled.folio} cancelada.`,
    );
  }

  private act(
    confirm: Parameters<ConfirmService['confirm']>[0],
    request: () => Observable<ProductionOrderDto>,
    done: (order: ProductionOrderDto) => string,
  ): void {
    const id = this.order()!.id;
    this.confirmService
      .confirm(confirm)
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return request();
        }),
      )
      .subscribe({
        next: (order) => {
          this.busy.set(false);
          this.order.set(order);
          this.notifier.success(done(order));
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.conflicts.handle(error, { reload: () => this.load(id) });
        },
      });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (order) => this.order.set(order),
      error: () => this.loadError.set(true),
    });
  }
}
