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
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { enumLabel } from '../../../shared/pipes/labels';
import { QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { stockWarehouses } from '../../inventory/ui/stock-warehouses';
import {
  DiscrepancyReason,
  Transfer,
  TransferLine,
  InternalTransfersApi,
  TransfersApi,
} from '../data-access/logistics-api';
import { DISCREPANCY_REASONS, receiptNeedsReason } from '../ui/transfer-rules';

type ReceiptForm = FormGroup<{
  received: FormControl<number | null>;
  reason: FormControl<DiscrepancyReason | null>;
  notes: FormControl<string>;
}>;

/** RN-22: the reason is required only when less than shipped arrives. */
function reasonWhenShort(shipped: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const received = control.parent?.get('received')?.value as number | null | undefined;
    return receiptNeedsReason(received ?? null, shipped) && !control.value
      ? { message: 'Indica por qué llegó menos.' }
      : null;
  };
}

/**
 * ★ /logistica/traspasos/:id/recibir and /inventario/vales-internos/:id/recibir (frontend §7.3, §7.5, RN-22, RN-47),
 * designed for the phone (route data `voucher` for an internal voucher): a card per line filled with what
 * was shipped; if less arrives, reason and notes; never more than shipped; fixed bar and confirmation.
 */
@Component({
  selector: 'app-transfer-receive-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    QtyInput,
    QtyPipe,
  ],
  template: `
    @if (transfer(); as t) {
      <app-page-header [title]="'Recibir ' + t.folio" />
      <p class="context muted">
        De {{ t.from.name }}
        @if (t.vehicleDescription) {
          · {{ t.vehicleDescription }} · {{ t.driverName }}
        }
        @if (t.dispatchedAt) {
          · salió {{ t.dispatchedAt | date: 'dd/MM/yyyy HH:mm' }}
        }
      </p>

      @if (t.status === 'Dispatched') {
        <form
          id="receive-form"
          class="cards pan-capture pan-has-action-bar"
          [formGroup]="form"
          (ngSubmit)="save(t)"
          novalidate
        >
          @if (warehouses().length > 0) {
            <section class="pan-card">
              <mat-form-field>
                <mat-label>Entra al subalmacén</mat-label>
                <mat-select formControlName="toWarehouseId">
                  @for (warehouse of warehouses(); track warehouse.id) {
                    <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
                  }
                </mat-select>
                <mat-error>{{ controlError(form.controls.toWarehouseId) }}</mat-error>
              </mat-form-field>
            </section>
          }

          @for (line of t.lines; track line.id; let i = $index) {
            @let receipt = receipts.at(i);
            <article class="pan-card line" [class.short]="isShort(receipt, line)">
              <div class="item">
                <strong>{{ line.sku }}</strong>
                <span>{{ line.itemName }}</span>
                <span class="muted">
                  Enviado {{ line.shippedQty | qty: line.baseUomCode }}
                  @if (line.lotNumber) {
                    · lote {{ line.lotNumber }}
                  }
                  @if (line.expirationDate) {
                    · caduca {{ line.expirationDate | date: 'dd/MM/yyyy' }}
                  }
                </span>
              </div>
              <app-qty-input
                class="qty"
                [formControl]="receipt.controls.received"
                label="Recibido"
                [unit]="line.baseUomCode"
                [max]="line.shippedQty"
                allowZero
              />
              @if (isShort(receipt, line)) {
                <div class="discrepancy">
                  <mat-form-field>
                    <mat-label>Motivo del faltante</mat-label>
                    <mat-select [formControl]="receipt.controls.reason">
                      @for (option of reasons; track option.value) {
                        <mat-option [value]="option.value">{{ option.label }}</mat-option>
                      }
                    </mat-select>
                    <mat-error>{{ controlError(receipt.controls.reason) }}</mat-error>
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>Notas</mat-label>
                    <input matInput [formControl]="receipt.controls.notes" />
                  </mat-form-field>
                </div>
              }
            </article>
          }
        </form>

        <div class="pan-action-bar">
          @if (shortLines() > 0) {
            <span class="short-count">
              {{ shortLines() }} {{ shortLines() === 1 ? 'línea' : 'líneas' }} con faltante
            </span>
          }
          <a matButton [routerLink]="[basePath(), t.id]">Volver</a>
          <button matButton="filled" type="submit" form="receive-form" [disabled]="saving()">
            Confirmar recepción
          </button>
        </div>
      } @else {
        <p class="pan-card">
          {{ voucher() ? 'Este vale' : 'Este traspaso' }} no está en tránsito.
          <a [routerLink]="[basePath(), t.id]">{{
            voucher() ? 'Ver el vale' : 'Ver el traspaso'
          }}</a>
        </p>
      }
    } @else if (resource.isLoading()) {
      <p role="status">Cargando…</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .context {
      margin: -8px 0 12px;
    }

    .muted {
      color: var(--mat-sys-on-surface-variant);
    }

    .cards {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    mat-form-field {
      width: 100%;
    }

    .line {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      padding: 12px 16px 4px;
      border-left: 4px solid transparent;

      &.short {
        border-left-color: var(--pan-status-orange-fg);
      }

      .item {
        display: flex;
        flex: 1 1 200px;
        flex-direction: column;
        min-width: 0;
        padding-bottom: 8px;
      }

      .qty {
        flex: 0 1 180px;
      }
    }

    .discrepancy {
      display: grid;
      flex: 1 1 100%;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0 16px;
    }

    .short-count {
      margin-right: auto;
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }

    @media (max-width: 599.98px) {
      .line .qty {
        flex: 1 1 100%;
      }
    }
  `,
})
export class TransferReceivePage {
  readonly id = input.required<string>();
  /** Route data: an internal voucher instead of a transfer. */
  readonly voucher = input(false);

  private readonly transfers = inject(TransfersApi);
  private readonly vouchers = inject(InternalTransfersApi);
  private get api(): TransfersApi | InternalTransfersApi {
    return this.voucher() ? this.vouchers : this.transfers;
  }
  protected readonly basePath = computed(() =>
    this.voucher() ? '/inventario/vales-internos' : '/logistica/traspasos',
  );
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly controlError = controlError;
  protected readonly reasons = DISCREPANCY_REASONS;
  protected readonly saving = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly transfer = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  /** Sub-warehouses of the destination; with them, the goods enter one (RN-45). */
  protected readonly warehouses = stockWarehouses(computed(() => this.transfer()?.to ?? null));

  protected readonly receipts = new FormArray<ReceiptForm>([]);
  protected readonly form = new FormGroup({
    toWarehouseId: new FormControl<string | null>(null),
    lines: this.receipts,
  });
  /** Bumps on every edit, so the counters follow the form. */
  private readonly edits = signal(0);
  protected readonly shortLines = computed(() => {
    this.edits();
    const t = this.transfer();
    return t ? t.lines.filter((l, i) => this.isShort(this.receipts.at(i), l)).length : 0;
  });

  constructor() {
    this.form.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
    effect(() => {
      const t = this.transfer();
      if (!t) return;
      this.breadcrumbs.setCurrent(`Recibir ${t.folio}`);
      this.fill(t);
    });
    effect(() => {
      const control = this.form.controls.toWarehouseId;
      const warehouses = this.warehouses();
      control.setValidators(warehouses.length > 0 ? Validators.required : null);
      if (warehouses.length === 1 && !control.value) control.setValue(warehouses[0].id);
      control.updateValueAndValidity();
    });
  }

  protected isShort(receipt: ReceiptForm | undefined, line: TransferLine): boolean {
    return !!receipt && receiptNeedsReason(receipt.controls.received.value, line.shippedQty);
  }

  protected async save(t: Transfer): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.receipts.getRawValue();
    const short = t.lines
      .map((line, i) => ({ line, value: values[i] }))
      .filter(({ line, value }) => receiptNeedsReason(value.received, line.shippedQty));
    const confirmed = await this.confirmService.confirm({
      title: 'Confirmar recepción',
      message: short.length
        ? 'Lo recibido entra a la existencia; el faltante queda como pérdida en tránsito.'
        : 'Lo recibido entra a la existencia del destino.',
      summary: [
        { label: 'Destino', value: t.to.name },
        { label: 'Líneas', value: `${t.lines.length}` },
        ...short.map(({ line, value }) => ({
          label: line.sku,
          value: `llegan ${formatQty(value.received, line.baseUomCode)} de ${formatQty(
            line.shippedQty,
            line.baseUomCode,
          )} · ${enumLabel('DiscrepancyReason', value.reason!)}`,
        })),
      ],
      confirmLabel: 'Recibir',
    });
    if (!confirmed) return;

    this.saving.set(true);
    try {
      const received = await firstValueFrom(
        this.api.receive(t.id, {
          version: t.version,
          toWarehouseId: this.form.controls.toWarehouseId.value,
          lines: t.lines.map((line, i) => {
            const v = values[i];
            const isShort = receiptNeedsReason(v.received, line.shippedQty);
            return {
              lineId: line.id,
              receivedQty: v.received!,
              discrepancyReason: isShort ? v.reason : null,
              discrepancyNotes: isShort ? v.notes.trim() || null : null,
            };
          }),
        }),
      );
      this.notifier.info(`${this.voucher() ? 'Vale' : 'Traspaso'} ${received.folio} recibido.`);
      await this.router.navigate([this.basePath(), received.id]);
    } catch (error) {
      // A 409 (another user changed it) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  /** One receipt per line, filled with what was shipped. */
  private fill(t: Transfer): void {
    this.receipts.clear({ emitEvent: false });
    for (const line of t.lines) {
      const reason = new FormControl<DiscrepancyReason | null>(
        null,
        reasonWhenShort(line.shippedQty),
      );
      const received = new FormControl<number | null>(line.shippedQty, Validators.required);
      received.valueChanges.subscribe(() => reason.updateValueAndValidity({ emitEvent: false }));
      this.receipts.push(
        new FormGroup({
          received,
          reason,
          notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
        }),
        { emitEvent: false },
      );
    }
    this.edits.update((n) => n + 1);
  }
}
