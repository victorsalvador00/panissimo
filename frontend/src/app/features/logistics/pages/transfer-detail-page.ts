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
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { AuditPanel } from '../../../shared/components/audit-panel/audit-panel';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { StatusLabelPipe } from '../../../shared/pipes/status-label.pipe';
import { TransferDto, TransfersApi } from '../data-access/transfers.api';
import { DispatchDialog, DispatchDialogResult } from '../ui/dispatch-dialog';
import { Stamp } from '../../../shared/components/stamp/stamp';

/** Detalle de un traspaso: editar, despachar o cancelar el borrador; ver envío y recepción. */
@Component({
  selector: 'app-transfer-detail-page',
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
    StatusLabelPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-detail-page.html',
  styleUrl: './transfer-detail-page.scss',
})
export class TransferDetailPage {
  private readonly api = inject(TransfersApi);
  private readonly dialog = inject(MatDialog);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);
  private readonly locale = inject(LOCALE_ID);
  private readonly auth = inject(AuthService);
  private readonly myLocations = inject(LocationContextService).locations;

  readonly id = input.required<string>();

  protected readonly transfer = signal<TransferDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  private readonly atOrigin = computed(() =>
    this.myLocations().some((location) => location.id === this.transfer()?.from.id),
  );
  protected readonly canPlan = computed(
    () =>
      this.auth.can('logistics.transfers.dispatch') &&
      this.atOrigin() &&
      this.transfer()?.status === 'Draft',
  );
  protected readonly canReceive = computed(
    () =>
      this.auth.can('logistics.transfers.receive') &&
      this.transfer()?.status === 'Dispatched' &&
      this.myLocations().some((location) => location.id === this.transfer()?.to.id),
  );
  protected readonly received = computed(() => {
    const status = this.transfer()?.status;
    return status === 'Received' || status === 'ReceivedWithDiscrepancies';
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected dispatch(): void {
    const transfer = this.transfer();
    if (!transfer) {
      return;
    }
    this.dialog
      .open<DispatchDialog, TransferDto, DispatchDialogResult>(DispatchDialog, {
        data: transfer,
        width: '640px',
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter(Boolean))
      .subscribe((result) => this.confirmDispatch(transfer, result));
  }

  private confirmDispatch(
    transfer: TransferDto,
    { request, lotLabels }: DispatchDialogResult,
  ): void {
    const manual = new Map((request.lines ?? []).map((line) => [line.lineId, line.lots]));
    this.confirmService
      .confirm({
        title: `¿Despachar ${transfer.folio}?`,
        message:
          'Se descontará la existencia del origen y el traspaso quedará en tránsito. Un traspaso despachado no se edita ni se cancela.',
        items: [
          { label: 'Ruta', value: `${transfer.from.code} → ${transfer.to.code}` },
          { label: 'Vehículo', value: request.vehicleDescription },
          { label: 'Chofer', value: request.driverName },
        ],
        lines: {
          headers: ['Artículo', 'Lote', 'Cantidad'],
          rows: transfer.lines.map((line) => [
            `${line.sku} · ${line.itemName}`,
            manual.has(line.id)
              ? manual
                  .get(line.id)!
                  .map(
                    (lot) =>
                      `${lotLabels[lot.lotId] ?? 'Lote'} (${formatQty(lot.quantity, this.locale)})`,
                  )
                  .join(', ')
              : (line.lotNumber ?? 'Automático'),
            formatQty(line.shippedQty, this.locale, line.baseUomCode),
          ]),
          alignEnd: [2],
        },
        confirmLabel: 'Despachar',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.dispatch(transfer.id, request);
        }),
      )
      .subscribe({
        next: (dispatched) => {
          this.busy.set(false);
          this.transfer.set(dispatched);
          this.notifier.success(`Traspaso ${dispatched.folio} despachado.`);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.conflicts.handle(error, {
            reload: () => this.load(transfer.id),
            lotLabels,
            units: Object.fromEntries(transfer.lines.map((l) => [l.itemId, l.baseUomCode])),
          });
        },
      });
  }

  protected cancel(): void {
    const transfer = this.transfer();
    if (!transfer) {
      return;
    }
    this.confirmService
      .confirm({
        title: `¿Cancelar el traspaso ${transfer.folio}?`,
        message: transfer.branchOrderId
          ? `También se cancelará el pedido ${transfer.branchOrderFolio}. El borrador ya no se podrá despachar. No se mueve inventario.`
          : 'El borrador ya no se podrá despachar. No se mueve inventario.',
        confirmLabel: 'Cancelar traspaso',
        cancelLabel: 'Volver',
        tone: 'warn',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.busy.set(true);
          return this.api.cancel(transfer.id, transfer.version);
        }),
      )
      .subscribe({
        next: (cancelled) => {
          this.busy.set(false);
          this.transfer.set(cancelled);
          this.notifier.success(`Traspaso ${cancelled.folio} cancelado.`);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.conflicts.handle(error, { reload: () => this.load(transfer.id) });
        },
      });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (transfer) => this.transfer.set(transfer),
      error: () => this.loadError.set(true),
    });
  }
}
