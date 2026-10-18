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
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { MxnPipe, QtyPipe, formatMxn, formatQty } from '../../../shared/pipes/pipes';
import { stockWarehouses } from '../../inventory/ui/stock-warehouses';
import {
  PurchaseOrderLine,
  PurchaseOrdersApi,
  GoodsReceiptsApi,
} from '../data-access/purchasing-api';
import { checkReceipt, receiptTotal, receivableNow } from '../ui/receipt-rules';

type LotEntry = FormGroup<{
  quantity: FormControl<number | null>;
  lotNumber: FormControl<string>;
  expirationDate: FormControl<Date | null>;
}>;

interface ReceiptLine {
  line: PurchaseOrderLine;
  entries: FormArray<LotEntry>;
}

/**
 * ★ /compras/recepciones/nueva?oc= (frontend §7.6, RN-32, RN-33), designed for the phone at the dock: a card per line
 * with its balance, filled with what is pending; lot and expiry for lot items and **"Otro lote"** to split the line;
 * the supplier's invoice; a warning when it goes over the pending (allowed up to the tolerance, never above); the
 * sub-warehouse it enters; fixed bar with the cost; confirmation.
 */
@Component({
  selector: 'app-goods-receipt-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    QtyInput,
    QtyPipe,
    MxnPipe,
  ],
  template: `
    @if (order(); as o) {
      <app-page-header [title]="'Recibir ' + o.folio" />
      <p class="context muted">
        {{ o.supplierName }} · entrega en {{ o.deliveryLocationName }}
        @if (o.receiptTolerancePct > 0) {
          · tolerancia {{ o.receiptTolerancePct }} %
        }
      </p>

      @if (o.status === 'Approved' || o.status === 'PartiallyReceived') {
        <form
          id="receipt-form"
          class="cards pan-capture pan-has-action-bar"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          <section class="pan-card fields">
            @if (warehouses().length > 0) {
              <mat-form-field>
                <mat-label>Entra al subalmacén</mat-label>
                <mat-select formControlName="warehouseId">
                  @for (warehouse of warehouses(); track warehouse.id) {
                    <mat-option [value]="warehouse.id">{{ warehouse.name }}</mat-option>
                  }
                </mat-select>
                <mat-error>{{ controlError(form.controls.warehouseId) }}</mat-error>
              </mat-form-field>
            }
            <mat-form-field>
              <mat-label>Factura del proveedor</mat-label>
              <input matInput class="pan-uppercase" formControlName="invoice" autocomplete="off" />
              <mat-error>{{ controlError(form.controls.invoice) }}</mat-error>
            </mat-form-field>
            <mat-form-field class="wide">
              <mat-label>Notas</mat-label>
              <input matInput formControlName="notes" />
            </mat-form-field>
          </section>

          @for (r of receiptLines(); track r.line.id) {
            @let check = checkOf(r);
            <article
              class="pan-card line"
              [class.over]="check === 'over'"
              [class.exceeds]="check === 'exceeds'"
            >
              <div class="item">
                <strong>{{ r.line.sku }}</strong>
                <span>{{ r.line.itemName }}</span>
                <span class="muted">
                  Pendiente {{ r.line.pendingQty | qty: r.line.uomCode }} de
                  {{ r.line.quantity | qty: r.line.uomCode }} · {{ r.line.unitPrice | mxn }} /
                  {{ r.line.uomCode }}
                </span>
              </div>
              @for (entry of r.entries.controls; track entry; let i = $index) {
                <div class="entry" [formGroup]="entry">
                  <app-qty-input
                    class="qty"
                    formControlName="quantity"
                    [label]="i === 0 ? 'Recibido' : 'Recibido (lote ' + (i + 1) + ')'"
                    [unit]="r.line.uomCode"
                    allowZero
                  />
                  @if (r.line.tracksLots) {
                    <mat-form-field class="lot">
                      <mat-label>Lote</mat-label>
                      <input matInput formControlName="lotNumber" autocomplete="off" />
                      <mat-hint>Vacío: el sistema le asigna uno.</mat-hint>
                    </mat-form-field>
                    <mat-form-field class="lot">
                      <mat-label>Caducidad</mat-label>
                      <input matInput [matDatepicker]="expiry" formControlName="expirationDate" />
                      <mat-datepicker-toggle matIconSuffix [for]="expiry" />
                      <mat-datepicker #expiry />
                    </mat-form-field>
                    @if (i > 0) {
                      <button
                        matIconButton
                        type="button"
                        [attr.aria-label]="'Quitar el lote ' + (i + 1) + ' de ' + r.line.sku"
                        (click)="removeLot(r, i)"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  }
                </div>
              }
              @if (r.line.tracksLots) {
                <button matButton type="button" class="other" (click)="addLot(r)">
                  <mat-icon>add</mat-icon>
                  Otro lote
                </button>
              }
              @switch (check) {
                @case ('over') {
                  <p class="warning" role="status">
                    Excede lo pendiente; se acepta hasta
                    {{ receivable(r) | qty: r.line.uomCode }} por la tolerancia.
                  </p>
                }
                @case ('exceeds') {
                  <p class="error" role="alert">
                    Máximo {{ receivable(r) | qty: r.line.uomCode }}: más de eso no se recibe.
                  </p>
                }
              }
            </article>
          }
        </form>

        <div class="pan-action-bar">
          <span class="cost">
            <span class="muted">Costo sin IVA</span>
            <strong>{{ cost() | mxn }}</strong>
          </span>
          <a matButton [routerLink]="['/compras/ordenes', o.id]">Volver</a>
          <button matButton="filled" type="submit" form="receipt-form" [disabled]="saving()">
            Registrar recepción
          </button>
        </div>
      } @else {
        <p class="pan-card">
          Esta orden no está aprobada ni parcialmente recibida: no se puede recibir.
          <a [routerLink]="['/compras/ordenes', o.id]">Ver la orden</a>
        </p>
      }
    } @else if (resource.isLoading()) {
      <p role="status">Cargando…</p>
    } @else if (!oc()) {
      <p class="pan-card">
        Elige la orden de compra a recibir en
        <a routerLink="/compras/ordenes" [queryParams]="{ tab: 'ToReceive' }">Por recibir</a>.
      </p>
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

    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 8px 16px;

      .wide {
        grid-column: 1 / -1;
      }
    }

    mat-form-field {
      width: 100%;
    }

    .line {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 16px;
      border-left: 4px solid transparent;

      &.over {
        border-left-color: var(--pan-status-orange-fg);
      }

      &.exceeds {
        border-left-color: var(--mat-sys-error);
      }

      .item {
        display: flex;
        flex-direction: column;
        padding-bottom: 8px;
      }
    }

    .entry {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 0 12px;

      .qty {
        flex: 1 1 160px;
      }

      .lot {
        flex: 1 1 180px;
      }

      button {
        margin-top: 8px;
      }
    }

    .other {
      align-self: flex-start;
    }

    .warning {
      margin: 0;
      color: var(--pan-status-orange-fg);
      font-weight: 600;
    }

    .error {
      margin: 0;
      color: var(--mat-sys-error);
      font-weight: 600;
    }

    .cost {
      display: flex;
      flex-direction: column;
      margin-right: auto;
      font: var(--mat-sys-body-small);

      strong {
        font: var(--mat-sys-title-medium);
      }
    }
  `,
})
export class GoodsReceiptPage {
  /** `?oc=`: the purchase order to receive. */
  readonly oc = input<string>();

  private readonly ordersApi = inject(PurchaseOrdersApi);
  private readonly api = inject(GoodsReceiptsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);

  protected readonly resource = rxResource({
    params: () => this.oc(),
    stream: ({ params }) => (params ? this.ordersApi.get(params) : of(null)),
  });
  protected readonly order = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  /** Sub-warehouses of the delivery plant; with them, the goods enter one (RN-45). */
  protected readonly warehouses = stockWarehouses(
    computed(() => {
      const o = this.order();
      return o ? { id: o.deliveryLocationId } : null;
    }),
  );

  protected readonly form = new FormGroup({
    warehouseId: new FormControl<string | null>(null),
    invoice: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });
  protected readonly receiptLines = signal<ReceiptLine[]>([]);
  /** Bumps on every edit of the quantities, for the checks and the cost. */
  private readonly edits = signal(0);
  protected readonly cost = computed(() => {
    this.edits();
    return this.receiptLines().reduce((sum, r) => sum + this.totalOf(r) * r.line.unitPrice, 0);
  });

  constructor() {
    effect(() => {
      const o = this.order();
      if (!o) return;
      this.breadcrumbs.setCurrent(`Recibir ${o.folio}`);
      this.receiptLines.set(
        o.lines
          .filter((line) => receivableNow(line) > 0)
          .map((line) => ({ line, entries: new FormArray([this.entry(line.pendingQty)]) })),
      );
      this.edits.update((n) => n + 1);
    });
    effect(() => {
      const control = this.form.controls.warehouseId;
      const warehouses = this.warehouses();
      control.setValidators(warehouses.length > 0 ? Validators.required : null);
      if (warehouses.length === 1 && !control.value) control.setValue(warehouses[0].id);
      control.updateValueAndValidity();
    });
  }

  protected receivable(r: ReceiptLine): number {
    return receivableNow(r.line);
  }

  protected checkOf(r: ReceiptLine): ReturnType<typeof checkReceipt> {
    this.edits();
    return checkReceipt(r.line, this.totalOf(r));
  }

  protected addLot(r: ReceiptLine): void {
    r.entries.push(this.entry(null));
    this.edits.update((n) => n + 1);
  }

  protected removeLot(r: ReceiptLine, index: number): void {
    r.entries.removeAt(index);
    this.edits.update((n) => n + 1);
  }

  protected async save(): Promise<void> {
    const o = this.order();
    const lines = this.receiptLines();
    const anyExceeds = lines.some((r) => this.checkOf(r) === 'exceeds');
    const received = lines.filter((r) => this.totalOf(r) > 0);
    if (!o || this.form.invalid || anyExceeds || lines.some((r) => r.entries.invalid)) {
      this.form.markAllAsTouched();
      lines.forEach((r) => r.entries.markAllAsTouched());
      return;
    }
    if (received.length === 0) {
      this.notifier.error('Captura lo recibido de al menos una línea.');
      return;
    }
    const { warehouseId, invoice, notes } = this.form.getRawValue();
    const confirmed = await this.confirmService.confirm({
      title: 'Registrar recepción',
      message:
        'Lo recibido entra a la existencia al costo de la orden (sin IVA); no se edita después.',
      summary: [
        { label: 'Orden', value: `${o.folio} · ${o.supplierName}` },
        ...(invoice.trim() ? [{ label: 'Factura', value: invoice.trim().toUpperCase() }] : []),
        ...received.map((r) => ({
          label: r.line.sku,
          value: formatQty(this.totalOf(r), r.line.uomCode),
        })),
        { label: 'Costo', value: formatMxn(this.cost()) },
      ],
      confirmLabel: 'Registrar',
    });
    if (!confirmed) return;

    const requestLines: Schemas['GoodsReceiptLineRequest'][] = received.flatMap((r) =>
      r.entries
        .getRawValue()
        .filter((e) => (e.quantity ?? 0) > 0)
        .map((e) => ({
          poLineId: r.line.id,
          quantity: e.quantity!,
          lotNumber: r.line.tracksLots ? e.lotNumber.trim() || null : null,
          expirationDate: r.line.tracksLots ? toIsoDate(e.expirationDate) : null,
        })),
    );
    this.saving.set(true);
    try {
      const receipt = await firstValueFrom(
        this.api.create({
          purchaseOrderId: o.id,
          poVersion: o.version,
          supplierInvoiceNumber: invoice.trim().toUpperCase() || null,
          notes: notes.trim() || null,
          warehouseId,
          lines: requestLines,
        }),
      );
      this.notifier.info(`Recepción ${receipt.folio} registrada.`);
      await this.router.navigate(['/compras/recepciones', receipt.id]);
    } catch (error) {
      // A 409 (another receipt of the same order) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
      this.resource.reload();
    } finally {
      this.saving.set(false);
    }
  }

  private totalOf(r: ReceiptLine): number {
    return receiptTotal(r.entries.controls.map((e) => e.controls.quantity.value));
  }

  private entry(quantity: number | null): LotEntry {
    const entry: LotEntry = new FormGroup({
      quantity: new FormControl<number | null>(quantity),
      lotNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
      expirationDate: new FormControl<Date | null>(null),
    });
    entry.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
    return entry;
  }
}
