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
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { filter, map, startWith, switchMap } from 'rxjs';
import { Notifier } from '../../../core/http/notifier.service';
import { ConfirmService } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatMxn, MxnPipe } from '../../../shared/pipes/mxn.pipe';
import { formatQty, QtyPipe } from '../../../shared/pipes/qty.pipe';
import { GoodsReceiptsApi } from '../data-access/goods-receipts.api';
import {
  PurchaseOrderDto,
  PurchaseOrderLine,
  PurchaseOrdersApi,
} from '../data-access/purchase-orders.api';
import {
  anyReceivedValidator,
  createReceiptLine,
  createReceiptLot,
  exceedsPending,
  pendingLines,
  receiptAmount,
  ReceiptLineForm,
  receivedQty,
  toReceiptRequest,
} from '../ui/receipt-lines';

/**
 * Recepción de una OC (`/compras/recepciones/nueva?oc=:id`, `purchasing.receive`): por línea con
 * saldo, la cantidad a recibir (prellenada con lo pendiente), y lote y caducidad si el artículo los
 * maneja; una línea puede repartirse en varios lotes. Entra al inventario al costo de la OC (RN-33).
 */
@Component({
  selector: 'app-goods-receipt-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    PageHeader,
    QtyInput,
    QtyPipe,
    MxnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './goods-receipt-form-page.html',
  styleUrl: './goods-receipt-form-page.scss',
})
export class GoodsReceiptFormPage {
  private readonly ordersApi = inject(PurchaseOrdersApi);
  private readonly api = inject(GoodsReceiptsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);
  private readonly confirmService = inject(ConfirmService);
  private readonly locale = inject(LOCALE_ID);

  /** Id de la OC (query param `oc`). */
  readonly oc = input<string>();

  protected readonly order = signal<PurchaseOrderDto | null>(null);
  protected readonly loadError = signal(false);
  protected readonly saving = signal(false);
  protected readonly lines = signal<PurchaseOrderLine[]>([]);
  protected readonly receivable = computed(() => {
    const status = this.order()?.status;
    return status === 'Approved' || status === 'PartiallyReceived';
  });

  protected readonly form = new FormGroup({
    supplierInvoiceNumber: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(50),
    }),
    lines: new FormArray<ReceiptLineForm>([], { validators: anyReceivedValidator }),
  });

  private readonly values = toSignal(
    this.form.controls.lines.valueChanges.pipe(
      startWith(null),
      map(() => this.form.controls.lines.getRawValue()),
    ),
    { initialValue: [] },
  );
  protected readonly amount = computed(() => receiptAmount(this.lines(), this.values()));
  protected readonly nothingReceived = computed(() => {
    this.values();
    return this.form.controls.lines.hasError('nothingReceived');
  });

  constructor() {
    effect(() => {
      const id = this.oc();
      untracked(() => (id ? this.load(id) : this.loadError.set(true)));
    });
  }

  protected received(index: number): number {
    return receivedQty(this.values()[index]?.lots ?? []);
  }

  protected exceeds(index: number): boolean {
    return exceedsPending(this.lines()[index], this.values()[index]?.lots ?? []);
  }

  protected addLot(index: number): void {
    const line = this.lines()[index];
    this.form.controls.lines.at(index).controls.lots.push(createReceiptLot(line.tracksLots));
  }

  protected removeLot(index: number, lot: number): void {
    const lots = this.form.controls.lines.at(index).controls.lots;
    if (lots.length > 1) {
      lots.removeAt(lot);
    }
  }

  private load(id: string): void {
    this.loadError.set(false);
    this.ordersApi.get(id).subscribe({
      next: (order) => {
        const lines = pendingLines(order);
        this.form.controls.lines.clear();
        lines.forEach((line) => this.form.controls.lines.push(createReceiptLine(line)));
        this.lines.set(lines);
        this.order.set(order);
      },
      error: () => this.loadError.set(true),
    });
  }

  protected save(): void {
    const order = this.order();
    if (!order || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.controls.lines.getRawValue();
    const request = toReceiptRequest(
      order,
      this.lines(),
      values,
      this.form.controls.supplierInvoiceNumber.value,
    );
    const byId = new Map(this.lines().map((line) => [line.id, line]));

    this.confirmService
      .confirm({
        title: `¿Registrar la recepción de ${order.folio}?`,
        message: `Entra al inventario de ${order.deliveryLocation.code} al costo de la orden de compra (sin IVA).`,
        items: [
          { label: 'Proveedor', value: order.supplier.name },
          { label: 'Factura', value: request.supplierInvoiceNumber ?? '—' },
          { label: 'Costo', value: formatMxn(this.amount(), this.locale) },
        ],
        lines: {
          headers: ['Artículo', 'Cantidad', 'Lote'],
          rows: request.lines.map((line) => {
            const poLine = byId.get(line.poLineId)!;
            return [
              `${poLine.sku} · ${poLine.itemName}`,
              formatQty(line.quantity, this.locale, poLine.purchaseUomCode),
              line.lotNumber ?? '—',
            ];
          }),
          alignEnd: [1],
        },
        confirmLabel: 'Registrar recepción',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.api.create(request);
        }),
      )
      .subscribe({
        next: (receipt) => {
          this.saving.set(false);
          this.notifier.success(`Recepción ${receipt.folio} registrada.`);
          void this.router.navigate(['/compras/recepciones', receipt.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formErrors.handle(error, this.form, { reload: () => this.load(order.id) });
        },
      });
  }
}
