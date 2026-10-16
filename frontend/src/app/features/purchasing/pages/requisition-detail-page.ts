import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
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
import { QtyPipe } from '../../../shared/pipes/qty.pipe';
import { RequisitionDto, RequisitionsApi } from '../data-access/requisitions.api';
import { ReasonDialog, ReasonDialogData } from '../ui/reason-dialog';
import { RequisitionConversion } from '../ui/requisition-conversion';
import { requisitionActions } from '../ui/requisition-lines';
import { Stamp } from '../../../shared/components/stamp/stamp';

/**
 * Detalle de una requisición: líneas con proveedor y precio estimados, fechas de cada paso y las
 * acciones que permiten su estado y los permisos del usuario (editar, enviar, aprobar, rechazar,
 * convertir a OC, cancelar).
 */
@Component({
  selector: 'app-requisition-detail-page',
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
  templateUrl: './requisition-detail-page.html',
  styleUrl: './purchasing-detail.scss',
})
export class RequisitionDetailPage {
  private readonly api = inject(RequisitionsApi);
  private readonly conversion = inject(RequisitionConversion);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly requisition = signal<RequisitionDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly busy = signal(false);

  private readonly permissions = {
    manage: this.auth.can('purchasing.requisitions.manage'),
    approve: this.auth.can('purchasing.po.approve'),
    convert: this.auth.can('purchasing.po.manage'),
  };
  protected readonly actions = computed(() => {
    const status = this.requisition()?.status;
    return status ? requisitionActions(status, this.permissions) : null;
  });
  protected readonly hasActions = computed(() => {
    const actions = this.actions();
    return !!actions && Object.values(actions).some(Boolean);
  });

  /** Total estimado sin IVA de las líneas con precio. */
  protected readonly estimatedTotal = computed(() =>
    (this.requisition()?.lines ?? []).reduce(
      (sum, line) => sum + (line.estimatedPrice ?? 0) * line.quantity,
      0,
    ),
  );
  protected readonly missingSupplier = computed(() =>
    (this.requisition()?.lines ?? []).some((line) => !line.suggestedSupplier),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected submit(): void {
    const r = this.requisition()!;
    this.act(
      {
        title: `¿Enviar ${r.folio} a aprobación?`,
        message: 'Ya no se podrá editar. Quien aprueba compras la verá como pendiente.',
        confirmLabel: 'Enviar',
      },
      () => this.api.submit(r.id, r.version),
      (sent) => `Requisición ${sent.folio} enviada a aprobación.`,
    );
  }

  protected approve(): void {
    const r = this.requisition()!;
    this.act(
      {
        title: `¿Aprobar ${r.folio}?`,
        message: 'Quedará lista para convertirse en orden de compra.',
        confirmLabel: 'Aprobar',
      },
      () => this.api.approve(r.id, r.version),
      (approved) => `Requisición ${approved.folio} aprobada.`,
    );
  }

  protected reject(): void {
    const r = this.requisition()!;
    this.dialog
      .open<ReasonDialog, ReasonDialogData, string>(ReasonDialog, {
        data: {
          title: `Rechazar ${r.folio}`,
          message: 'Quien la hizo verá el motivo. Una requisición rechazada ya no cambia.',
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
          return this.api.reject(r.id, r.version, reason);
        }),
      )
      .subscribe({
        next: (rejected) => this.done(rejected, `Requisición ${rejected.folio} rechazada.`),
        error: (error: unknown) => this.failed(error),
      });
  }

  protected cancel(): void {
    const r = this.requisition()!;
    this.act(
      {
        title: `¿Cancelar ${r.folio}?`,
        message: 'La requisición ya no se podrá enviar ni convertir en orden de compra.',
        confirmLabel: 'Cancelar requisición',
        cancelLabel: 'Volver',
        tone: 'warn',
      },
      () => this.api.cancel(r.id, r.version),
      (cancelled) => `Requisición ${cancelled.folio} cancelada.`,
    );
  }

  protected convert(): void {
    const r = this.requisition()!;
    this.busy.set(true);
    this.conversion
      .convert([r], () => this.load(r.id))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.load(r.id);
        },
        error: () => this.busy.set(false),
        complete: () => this.busy.set(false),
      });
  }

  private act(
    confirm: Parameters<ConfirmService['confirm']>[0],
    request: () => Observable<RequisitionDto>,
    message: (requisition: RequisitionDto) => string,
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
        next: (requisition) => this.done(requisition, message(requisition)),
        error: (error: unknown) => this.failed(error),
      });
  }

  private done(requisition: RequisitionDto, message: string): void {
    this.busy.set(false);
    this.requisition.set(requisition);
    this.notifier.success(message);
  }

  private failed(error: unknown): void {
    this.busy.set(false);
    const id = this.requisition()!.id;
    this.conflicts.handle(error, { reload: () => this.load(id) });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (requisition) => this.requisition.set(requisition),
      error: () => this.loadError.set(true),
    });
  }
}
