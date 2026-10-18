import { DatePipe, DOCUMENT } from '@angular/common';
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
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { MxnPipe, QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { LotSplit, lotSplitValid } from '../../inventory/ui/lot-split';
import { stockWarehouses } from '../../inventory/ui/stock-warehouses';
import {
  CustomerShipment,
  CustomerShipmentLine,
  CustomerShipmentsApi,
} from '../data-access/sales-api';
import { TraceLink } from '../../inventory/ui/trace/trace-link';

interface DraftLine {
  line: CustomerShipmentLine;
  quantity: FormControl<number | null>;
  lots: ReturnType<typeof signal<Schemas['LotQuantity'][]>>;
  open: ReturnType<typeof signal<boolean>>;
}

/**
 * ★ /ventas/remisiones/:id (frontend §7.7, RN-81..RN-83). A draft edits its quantities (up to the balance plus the
 * tolerance), vehicle, driver, who receives and "Elegir lotes" per line, and is **dispatched** with confirmation (it
 * posts the exit from the plant). A dispatched one is read-only and **prints** on a letter sheet (`@media print`):
 * a delivery document, not an invoice.
 */
@Component({
  selector: 'app-shipment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TraceLink,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    PageHeader,
    QtyInput,
    Stamp,
    StatusTag,
    LotSplit,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './shipment-page.html',
  styleUrl: './shipment-page.scss',
})
export class ShipmentPage {
  readonly id = input.required<string>();

  private readonly api = inject(CustomerShipmentsApi);
  private readonly auth = inject(AuthService);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  private readonly document = inject(DOCUMENT);
  protected readonly controlError = controlError;
  protected readonly canDispatch = this.auth.can('sales.shipments.dispatch');
  protected readonly busy = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly shipment = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly editable = computed(
    () => this.shipment()?.status === 'Draft' && this.canDispatch,
  );
  /** Sub-warehouses of the plant; with them, the goods leave one (RN-45). */
  protected readonly warehouses = stockWarehouses(
    computed(() => {
      const s = this.shipment();
      return s ? { id: s.fromLocationId } : null;
    }),
  );

  protected readonly form = new FormGroup({
    warehouseId: new FormControl<string | null>(null),
    vehicleDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    driverName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    receivedByName: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(200),
    }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });
  protected readonly lines = signal<DraftLine[]>([]);
  /** Bumps on every edit of a quantity or a lot split. */
  private readonly edits = signal(0);
  protected readonly totalQuantity = computed(() => {
    this.edits();
    return this.lines().reduce((sum, l) => sum + (l.quantity.value ?? 0), 0);
  });

  constructor() {
    effect(() => {
      const s = this.shipment();
      if (!s) return;
      this.breadcrumbs.setCurrent(s.folio);
      // fill() reads the current lines and writes new ones: outside this effect's tracking.
      untracked(() => this.fill(s));
    });
    effect(() => {
      const control = this.form.controls.warehouseId;
      const warehouses = this.warehouses();
      control.setValidators(warehouses.length > 0 ? Validators.required : null);
      if (warehouses.length === 1 && !control.value) control.setValue(warehouses[0].id);
      control.updateValueAndValidity();
    });
  }

  /** The stock location the lots are chosen from: the chosen sub-warehouse or the plant. */
  protected lotLocation(s: CustomerShipment): string {
    return this.form.controls.warehouseId.value ?? s.fromLocationId;
  }

  protected setLots(draft: DraftLine, lots: Schemas['LotQuantity'][]): void {
    draft.lots.set(lots);
    this.edits.update((n) => n + 1);
  }

  protected lotsValid(draft: DraftLine): boolean {
    this.edits();
    return lotSplitValid(draft.lots(), draft.quantity.value);
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  /** Saves the quantities of the draft; returns the shipment with its new version. */
  protected async saveQuantities(
    s: CustomerShipment,
    notify = true,
  ): Promise<CustomerShipment | null> {
    if (this.lines().some((l) => l.quantity.invalid)) {
      this.lines().forEach((l) => l.quantity.markAsTouched());
      return null;
    }
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.update(s.id, {
          version: s.version,
          notes: this.form.controls.notes.value.trim() || null,
          lines: this.lines().map((l) => ({ lineId: l.line.id, quantity: l.quantity.value ?? 0 })),
        }),
      );
      this.resource.set(saved);
      if (notify) this.notifier.info('Cantidades guardadas.');
      return saved;
    } catch (error) {
      this.formErrors.apply(this.form, error);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  protected async dispatch(s: CustomerShipment): Promise<void> {
    const drafts = this.lines();
    if (
      this.form.invalid ||
      drafts.some((l) => l.quantity.invalid || !this.lotsValid(l)) ||
      this.totalQuantity() <= 0
    ) {
      this.form.markAllAsTouched();
      drafts.forEach((l) => l.quantity.markAsTouched());
      if (this.totalQuantity() <= 0) this.notifier.error('La remisión no lleva ninguna cantidad.');
      return;
    }
    const v = this.form.getRawValue();
    const confirmed = await this.confirmService.confirm({
      title: 'Despachar remisión',
      message:
        'La mercancía sale de la existencia de la Planta (los lotes elegidos o los que caducan primero). Una remisión despachada no se edita ni se cancela.',
      summary: [
        { label: 'Cliente', value: `${s.customerCode} · ${s.customerName}` },
        ...(s.deliveryPointName ? [{ label: 'Entrega', value: s.deliveryPointName }] : []),
        { label: 'Vehículo y chofer', value: `${v.vehicleDescription} · ${v.driverName}` },
        ...drafts
          .filter((d) => (d.quantity.value ?? 0) > 0)
          .map((d) => ({
            label: d.line.sku,
            value: formatQty(d.quantity.value, d.line.uomCode),
          })),
      ],
      confirmLabel: 'Despachar',
    });
    if (!confirmed) return;

    // The quantities go first, if they changed.
    let current: CustomerShipment | null = s;
    if (drafts.some((d) => d.quantity.value !== d.line.quantity))
      current = await this.saveQuantities(s, false);
    if (!current) return;

    const lines = drafts
      .filter((d) => d.lots().length > 0)
      .map((d) => ({ lineId: d.line.id, lots: d.lots() }));
    this.busy.set(true);
    try {
      const dispatched = await firstValueFrom(
        this.api.dispatch(current.id, {
          version: current.version,
          vehicleDescription: v.vehicleDescription.trim(),
          driverName: v.driverName.trim(),
          receivedByName: v.receivedByName.trim() || null,
          fromWarehouseId: v.warehouseId,
          lines: lines.length > 0 ? lines : null,
        }),
      );
      this.resource.set(dispatched);
      this.notifier.info(`Remisión ${dispatched.folio} despachada.`);
    } catch (error) {
      // A 409 (shortage) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
      this.resource.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel(s: CustomerShipment): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Cancelar remisión',
      message: `La remisión ${s.folio} queda cancelada; el pedido conserva su saldo.`,
      confirmLabel: 'Cancelar remisión',
      cancelLabel: 'Volver',
      destructive: true,
    });
    if (!confirmed) return;
    this.busy.set(true);
    try {
      this.resource.set(await firstValueFrom(this.api.cancel(s.id, s.version)));
      this.notifier.info(`Remisión ${s.folio} cancelada.`);
    } catch {
      this.resource.reload();
    } finally {
      this.busy.set(false);
    }
  }

  /** One draft line per shipment line, with its quantity and the lots chosen so far. */
  private fill(s: CustomerShipment): void {
    const previous = new Map(this.lines().map((d) => [d.line.id, d]));
    this.lines.set(
      s.lines.map((line) => {
        const quantity = new FormControl<number | null>(line.quantity, Validators.required);
        quantity.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
        return {
          line,
          quantity,
          lots: signal<Schemas['LotQuantity'][]>(previous.get(line.id)?.lots() ?? []),
          open: signal(previous.get(line.id)?.open() ?? false),
        };
      }),
    );
    if (!this.form.dirty)
      this.form.patchValue({
        vehicleDescription: s.vehicleDescription ?? '',
        driverName: s.driverName ?? '',
        receivedByName: s.receivedByName ?? '',
        notes: s.notes ?? '',
      });
    this.edits.update((n) => n + 1);
  }
}
