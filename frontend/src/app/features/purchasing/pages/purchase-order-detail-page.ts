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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { filter, map, Observable, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { formatMxn, MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { GoodsReceiptsApi } from '../data-access/goods-receipts.api';
import { PurchaseOrderDto, PurchaseOrdersApi } from '../data-access/purchase-orders.api';
import { purchaseOrderActions, taxLabel } from '../ui/purchase-order-lines';
import { ReasonDialog, ReasonDialogData } from '../ui/reason-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';

/**
 * Detalle de una OC: líneas con lo pedido, recibido y pendiente, totales con IVA, recepciones y las
 * acciones que permiten su estado y los permisos (enviar, aprobar/rechazar, cancelar, cerrar, recibir).
 */
@Component({
  selector: 'app-purchase-order-detail-page',
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
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './purchase-order-detail-page.html',
  styleUrl: './purchasing-detail.scss',
})
export class PurchaseOrderDetailPage {
  private readonly api = inject(PurchaseOrdersApi);
  private readonly receiptsApi = inject(GoodsReceiptsApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly order = signal<PurchaseOrderDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  protected readonly tax = taxLabel;

  private readonly permissions = {
    manage: this.auth.can('purchasing.po.manage'),
    approve: this.auth.can('purchasing.po.approve'),
    receive: this.auth.can('purchasing.receive'),
  };
  protected readonly actions = computed(() => {
    const status = this.order()?.status;
    return status ? purchaseOrderActions(status, this.permissions) : null;
  });
  protected readonly hasActions = computed(() => {
    const actions = this.actions();
    return !!actions && Object.values(actions).some(Boolean);
  });
  /** Ya se recibió algo: muestra las columnas de recibido y pendiente. */
  protected readonly receiving = computed(() => {
    const status = this.order()?.status;
    return (
      status === 'Approved' ||
      status === 'PartiallyReceived' ||
      status === 'Received' ||
      status === 'Closed'
    );
  });

  protected readonly receipts = rxResource({
    params: () =>
      this.receiving() ? { id: this.order()!.id, version: this.order()!.version } : undefined,
    stream: ({ params }) =>
      this.receiptsApi
        .list({ page: 1, pageSize: 50, sort: 'receivedAt:asc' }, { purchaseOrderId: params.id })
        .pipe(map((page) => page.items)),
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected submit(): void {
    const o = this.order()!;
    this.act(
      {
        title: `¿Enviar la orden ${o.folio}?`,
        message:
          'Si su subtotal alcanza el monto que requiere aprobación queda por aprobar; si no, queda aprobada y lista para recibirse.',
        confirmLabel: 'Enviar',
      },
      () => this.api.submit(o.id, o.version),
      (sent) =>
        sent.status === 'PendingApproval'
          ? `Orden ${sent.folio} enviada a aprobación.`
          : `Orden ${sent.folio} aprobada (no requiere aprobación por su monto).`,
    );
  }

  protected approve(): void {
    const o = this.order()!;
    this.act(
      {
        title: `¿Aprobar la orden ${o.folio}?`,
        message: 'Quedará lista para recibirse.',
        items: [
          { label: 'Proveedor', value: o.supplier.name },
          { label: 'Total', value: formatMxn(o.total, this.locale) },
        ],
        confirmLabel: 'Aprobar',
      },
      () => this.api.approve(o.id, o.version),
      (approved) => `Orden ${approved.folio} aprobada.`,
    );
  }

  protected reject(): void {
    const o = this.order()!;
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, {
        data: {
          title: `Rechazar la orden ${o.folio}`,
          message: 'El rechazo es final: para reintentar se captura una orden nueva.',
          confirmLabel: 'Rechazar',
        },
        width: '480px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(
        filter((reason): reason is string => !!reason),
        switchMap((reason) => {
          this.busy.set(true);
          return this.api.reject(o.id, o.version, reason);
        }),
      )
      .subscribe({
        next: (rejected) => this.done(rejected, `Orden ${rejected.folio} rechazada.`),
        error: (error: unknown) => this.failed(error),
      });
  }

  protected cancel(): void {
    const o = this.order()!;
    this.act(
      {
        title: `¿Cancelar la orden ${o.folio}?`,
        message: 'Ya no se podrá enviar ni recibir.',
        confirmLabel: 'Cancelar orden',
        cancelLabel: 'Volver',
        tone: 'warn',
      },
      () => this.api.cancel(o.id, o.version),
      (cancelled) => `Orden ${cancelled.folio} cancelada.`,
    );
  }

  protected close(): void {
    const o = this.order()!;
    const pending = o.lines.filter((line) => line.pendingQty > 0);
    this.act(
      {
        title: `¿Cerrar la orden ${o.folio} con saldo pendiente?`,
        message: 'Lo pendiente ya no se recibirá. Lo recibido se conserva.',
        lines: {
          headers: ['Artículo', 'Pendiente'],
          rows: pending.map((line) => [
            `${line.sku} · ${line.itemName}`,
            formatQty(line.pendingQty, this.locale, line.purchaseUomCode),
          ]),
          alignEnd: [1],
        },
        confirmLabel: 'Cerrar orden',
        cancelLabel: 'Volver',
        tone: 'warn',
      },
      () => this.api.close(o.id, o.version),
      (closed) => `Orden ${closed.folio} cerrada.`,
    );
  }

  private act(
    confirm: Parameters<ConfirmService['confirm']>[0],
    request: () => Observable<PurchaseOrderDto>,
    message: (order: PurchaseOrderDto) => string,
  ): void {
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
        next: (order) => this.done(order, message(order)),
        error: (error: unknown) => this.failed(error),
      });
  }

  private done(order: PurchaseOrderDto, message: string): void {
    this.busy.set(false);
    this.order.set(order);
    this.notifier.success(message);
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    const id = this.order()!.id;
    this.conflicts.handle(error, { reload: () => this.load(id) });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (order) => this.order.set(order),
      error: () => this.loadError.set(true),
    });
  }
}
