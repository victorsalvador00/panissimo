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
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { filter, Observable, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { ReasonDialog, ReasonDialogData } from '../../purchasing/ui/reason-dialog';
import { BranchOrderDto, BranchOrdersApi } from '../data-access/branch-orders.api';
import {
  ApproveLineForm,
  approvesSomething,
  branchOrderActions,
  createApproveLine,
  exceedsStock,
  toApproveRequest,
} from '../ui/branch-order-lines';
import { Stamp } from '../../../shared/components/stamp/stamp';

/**
 * Detalle de un pedido de sucursal: lo solicitado, aprobado y despachado por artículo, sus traspasos
 * y las acciones de la sucursal (editar, enviar, cancelar) y del origen (aprobar con cantidades
 * editables, rechazar). Aprobar crea el traspaso en borrador (RN-20).
 */
@Component({
  selector: 'app-branch-order-detail-page',
  imports: [
    Stamp,
    RouterLink,
    DatePipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    PageHeader,
    StatusTag,
    AuditPanel,
    QtyInput,
    QtyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './branch-order-detail-page.html',
  styleUrl: './branch-order-detail-page.scss',
})
export class BranchOrderDetailPage {
  private readonly api = inject(BranchOrdersApi);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);
  private readonly myLocations = inject(LocationContextService).locations;

  readonly id = input.required<string>();

  protected readonly order = signal<BranchOrderDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);
  /** Captura de cantidades aprobadas abierta. */
  protected readonly approving = signal(false);
  protected readonly approveForm = signal(new FormGroup<Record<string, ApproveLineForm>>({}));
  protected readonly approveError = signal(false);

  private readonly permissions = {
    create: this.auth.can('logistics.orders.create'),
    approve: this.auth.can('logistics.orders.approve'),
  };
  protected readonly canDispatch = this.auth.can('logistics.transfers.dispatch');

  private readonly mine = (id: string | undefined) =>
    this.myLocations().some((location) => location.id === id);
  protected readonly actions = computed(() => {
    const o = this.order();
    return o
      ? branchOrderActions(o.status, this.permissions, {
          requesting: this.mine(o.requestingLocation.id),
          supplying: this.mine(o.supplyingLocation.id),
        })
      : null;
  });
  protected readonly hasActions = computed(() => {
    const actions = this.actions();
    return !!actions && Object.values(actions).some(Boolean);
  });
  protected readonly atOrigin = computed(() => this.mine(this.order()?.supplyingLocation.id));
  /** Ya se aprobó: se muestran las columnas de aprobado y despachado. */
  protected readonly approved = computed(() => {
    const status = this.order()?.status;
    return status === 'Approved' || status === 'PartiallyFulfilled' || status === 'Fulfilled';
  });

  private readonly approveValues = toSignal(
    toObservable(this.approveForm).pipe(
      switchMap((form) => form.valueChanges.pipe(startWith(form.getRawValue()))),
    ),
    { initialValue: {} as Record<string, number | null> },
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected approvedQty(lineId: string): number | null {
    return this.approveValues()[lineId] ?? null;
  }

  protected overStock(lineId: string): boolean {
    const line = this.order()?.lines.find((l) => l.id === lineId);
    return !!line && exceedsStock(line, this.approvedQty(lineId));
  }

  protected submit(): void {
    const o = this.order()!;
    this.act(
      {
        title: `¿Enviar el pedido ${o.folio}?`,
        message: `${o.supplyingLocation.code} lo revisará y aprobará. Ya no se podrá editar.`,
        confirmLabel: 'Enviar',
      },
      () => this.api.submit(o.id, o.version),
      (sent) => `Pedido ${sent.folio} enviado a ${sent.supplyingLocation.code}.`,
    );
  }

  protected cancel(): void {
    const o = this.order()!;
    this.act(
      {
        title: `¿Cancelar el pedido ${o.folio}?`,
        message: 'Ya no se podrá enviar ni aprobar.',
        confirmLabel: 'Cancelar pedido',
        cancelLabel: 'Volver',
        tone: 'warn',
      },
      () => this.api.cancel(o.id, o.version),
      (cancelled) => `Pedido ${cancelled.folio} cancelado.`,
    );
  }

  protected startApprove(): void {
    const o = this.order()!;
    this.approveForm.set(
      new FormGroup(Object.fromEntries(o.lines.map((line) => [line.id, createApproveLine(line)]))),
    );
    this.approveError.set(false);
    this.approving.set(true);
  }

  protected stopApprove(): void {
    this.approving.set(false);
  }

  protected confirmApprove(): void {
    const o = this.order()!;
    const form = this.approveForm();
    const values = form.getRawValue();
    const nothing = !approvesSomething(values);
    this.approveError.set(nothing);
    if (form.invalid || nothing || this.busy()) {
      form.markAllAsTouched();
      return;
    }
    const request = toApproveRequest(o.version, o.lines, values);
    const qty = (value: number, uom: string) => formatQty(value, this.locale, uom);
    this.act(
      {
        title: `¿Aprobar el pedido ${o.folio}?`,
        message: `Se creará un traspaso en borrador de ${o.supplyingLocation.code} a ${o.requestingLocation.code} con lo aprobado. No se reserva existencia.`,
        lines: {
          headers: ['Artículo', 'Solicitado', 'Aprobado'],
          rows: o.lines.map((line) => [
            `${line.sku} · ${line.itemName}`,
            qty(line.requestedQty, line.baseUomCode),
            qty(values[line.id] ?? 0, line.baseUomCode),
          ]),
          alignEnd: [1, 2],
        },
        confirmLabel: 'Aprobar',
      },
      () => this.api.approve(o.id, request),
      (approved) => {
        const transfer = approved.transfers.at(-1);
        return transfer
          ? `Pedido ${approved.folio} aprobado. Se creó el traspaso ${transfer.folio}.`
          : `Pedido ${approved.folio} aprobado.`;
      },
    );
  }

  protected reject(): void {
    const o = this.order()!;
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, {
        data: {
          title: `Rechazar el pedido ${o.folio}`,
          message: 'La sucursal verá el motivo; para reintentar captura un pedido nuevo.',
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
        next: (rejected) => this.done(rejected, `Pedido ${rejected.folio} rechazado.`),
        error: (error: unknown) => this.failed(error),
      });
  }

  private act(
    confirm: Parameters<ConfirmService['confirm']>[0],
    request: () => Observable<BranchOrderDto>,
    message: (order: BranchOrderDto) => string,
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

  private done(order: BranchOrderDto, message: string): void {
    this.busy.set(false);
    this.approving.set(false);
    this.order.set(order);
    this.notifier.success(message);
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    const id = this.order()!.id;
    this.conflicts.handle(error, {
      reload: () => {
        this.approving.set(false);
        this.load(id);
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
