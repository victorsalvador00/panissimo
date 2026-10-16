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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormRecord, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { filter, startWith, switchMap } from 'rxjs';
import { Notifier } from '../../../core/http/notifier.service';
import { ConfirmService, ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { ENUM_LABELS } from '../../../shared/pipes/status-label.pipe';
import { DiscrepancyReason, TransferDto, TransfersApi } from '../data-access/transfers.api';
import {
  createReceiveLine,
  isShort,
  ReceiveLine,
  receiveSummary,
  ReceiveValue,
  toReceiveRequest,
} from '../ui/transfer-lines';

/**
 * ★ Recepción en sucursal (spec frontend §7.4, RN-22): tarjeta por línea con lo enviado y lo recibido
 * (prellenado igual). Si llega menos, se pide el motivo. Diseñada primero para celular.
 */
@Component({
  selector: 'app-transfer-receive-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    QtyInput,
    QtyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfer-receive-page.html',
  styleUrl: './transfer-receive-page.scss',
})
export class TransferReceivePage {
  private readonly api = inject(TransfersApi);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly conflicts = inject(ConflictHandler);
  private readonly notifier = inject(Notifier);
  private readonly locale = inject(LOCALE_ID);

  readonly id = input.required<string>();

  protected readonly transfer = signal<TransferDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly reasons = Object.keys(ENUM_LABELS.DiscrepancyReason) as DiscrepancyReason[];
  protected readonly reasonLabels = ENUM_LABELS.DiscrepancyReason;

  protected readonly form = new FormRecord<ReceiveLine>({});
  private readonly values = toSignal(this.form.valueChanges.pipe(startWith(null)));

  protected readonly summary = computed(() => {
    this.values();
    const transfer = this.transfer();
    return transfer
      ? receiveSummary(transfer.lines, this.form.getRawValue())
      : { complete: 0, short: 0 };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  protected lineForm(lineId: string): ReceiveLine {
    return this.form.controls[lineId];
  }

  protected short(lineId: string): boolean {
    this.values();
    const line = this.transfer()?.lines.find((l) => l.id === lineId);
    return !!line && isShort(line, this.form.controls[lineId].getRawValue());
  }

  protected submit(): void {
    const transfer = this.transfer();
    if (!transfer || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifier.error('Revisa las líneas marcadas antes de recibir.');
      return;
    }
    const values: Record<string, ReceiveValue> = this.form.getRawValue();
    const shortLines = transfer.lines.filter((line) => isShort(line, values[line.id]));
    this.confirmService
      .confirm({
        title: `¿Recibir ${transfer.folio}?`,
        message: shortLines.length
          ? 'Se sumará a la existencia lo recibido. Lo que falta queda como pérdida en tránsito.'
          : 'Se sumará a la existencia todo lo enviado.',
        items: [
          { label: 'Origen', value: `${transfer.from.code} · ${transfer.from.name}` },
          { label: 'Líneas completas', value: String(transfer.lines.length - shortLines.length) },
          { label: 'Con faltante', value: String(shortLines.length) },
        ],
        lines: shortLines.length
          ? {
              headers: ['Artículo', 'Enviado', 'Recibido', 'Motivo'],
              rows: shortLines.map((line) => [
                `${line.sku} · ${line.itemName}`,
                formatQty(line.shippedQty, this.locale, line.baseUomCode),
                formatQty(values[line.id].receivedQty, this.locale, line.baseUomCode),
                this.reasonLabels[values[line.id].reason!],
              ]),
              alignEnd: [1, 2],
            }
          : undefined,
        confirmLabel: 'Recibir',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.api.receive(
            transfer.id,
            toReceiveRequest(transfer.version, transfer.lines, values),
          );
        }),
      )
      .subscribe({
        next: (received) => {
          this.saving.set(false);
          this.notifier.success(
            received.status === 'ReceivedWithDiscrepancies'
              ? `Traspaso ${received.folio} recibido con diferencias.`
              : `Traspaso ${received.folio} recibido.`,
          );
          void this.router.navigate(['/logistica/traspasos', received.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.conflicts.handle(error, { reload: () => this.load(transfer.id) });
        },
      });
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.api.get(id).subscribe({
      next: (transfer) => {
        Object.keys(this.form.controls).forEach((key) => this.form.removeControl(key));
        transfer.lines.forEach((line) => this.form.addControl(line.id, createReceiveLine(line)));
        this.transfer.set(transfer);
      },
      error: () => this.loadError.set(true),
    });
  }
}
