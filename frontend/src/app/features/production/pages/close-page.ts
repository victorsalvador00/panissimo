import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, firstValueFrom, map, of, startWith } from 'rxjs';
import type { ApiEnum, Schemas } from '../../../core/api/api';
import { Notifier } from '../../../core/http/notifier';
import { BreadcrumbsService } from '../../../core/layout/breadcrumbs.service';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { FormErrors } from '../../../shared/forms/form-errors';
import { ENUM_LABELS, enumLabel } from '../../../shared/pipes/labels';
import { MxnPipe, QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { LotSplit, lotSplitValid } from '../../inventory/ui/lot-split';
import { stockWarehouses } from '../../inventory/ui/stock-warehouses';
import { ClosePreview, ProductionOrdersApi } from '../data-access/production-api';
import { checkClose, closeCosts, closeKindOf } from '../ui/close-rules';

type Shift = ApiEnum<'Shift'>;
type ShortfallReason = ApiEnum<'ShortfallReason'>;
type PreviewLine = ClosePreview['lines'][number];

/** Actual consumption of one component: what the user typed (or the theoretical) and the chosen lots. */
interface Consumption {
  actual: FormControl<number | null>;
  lots: ReturnType<typeof signal<Schemas['LotQuantity'][]>>;
  open: ReturnType<typeof signal<boolean>>;
}

/** Sub-warehouses chosen last time at each plant (per device). */
const WAREHOUSES_KEY = 'pan.close.warehouses';

function readWarehouses(plantId: string): { consumption?: string; output?: string } {
  try {
    return JSON.parse(localStorage.getItem(WAREHOUSES_KEY) ?? '{}')[plantId] ?? {};
  } catch {
    return {};
  }
}

function storeWarehouses(plantId: string, value: { consumption?: string; output?: string }): void {
  try {
    const all = JSON.parse(localStorage.getItem(WAREHOUSES_KEY) ?? '{}');
    localStorage.setItem(WAREHOUSES_KEY, JSON.stringify({ ...all, [plantId]: value }));
  } catch {
    // Without storage they are chosen again next time.
  }
}

/**
 * ★ /produccion/ordenes/:id/cerrar?tipo=parcial|final (frontend §7.4.3, RN-61..RN-66), for the tablet on the line
 * and 390 px: produced quantity, shift and notes; a card per component with the theoretical for that quantity
 * (close-preview, recalculated when typing stops), the actual consumption (filled with the theoretical until the user
 * changes it), stock and "Elegir lotes"; shortfall reason in a final close below the plan; over-plan and over-tolerance
 * warnings (D-03: they do not block); fixed bar with estimated cost, unit cost and waste; confirmation.
 */
@Component({
  selector: 'app-close-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    LotSplit,
    QtyPipe,
    MxnPipe,
  ],
  templateUrl: './close-page.html',
  styleUrl: './close-page.scss',
})
export class ClosePage {
  readonly id = input.required<string>();
  /** `?tipo=parcial|final`. */
  readonly tipo = input<string>();

  private readonly api = inject(ProductionOrdersApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly breadcrumbs = inject(BreadcrumbsService);
  protected readonly controlError = controlError;
  protected readonly shifts = Object.entries(ENUM_LABELS.Shift).map(([value, label]) => ({
    value: value as Shift,
    label,
  }));
  protected readonly reasons = Object.entries(ENUM_LABELS.ShortfallReason).map(
    ([value, label]) => ({ value: value as ShortfallReason, label }),
  );
  protected readonly kind = computed(() => closeKindOf(this.tipo()));
  protected readonly saving = signal(false);

  protected readonly resource = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly order = computed(() =>
    this.resource.hasValue() ? this.resource.value() : null,
  );
  protected readonly warehouses = stockWarehouses(
    computed(() => {
      const order = this.order();
      return order ? { id: order.locationId } : null;
    }),
  );

  protected readonly form = new FormGroup({
    producedQty: new FormControl<number | null>(null, Validators.required),
    shift: new FormControl<Shift | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    shortfallReason: new FormControl<ShortfallReason | null>(null),
    shortfallNotes: new FormControl('', {
      nonNullable: true,
      validators: Validators.maxLength(500),
    }),
    consumptionWarehouseId: new FormControl<string | null>(null),
    outputWarehouseId: new FormControl<string | null>(null),
  });
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );
  /** The quantity, once valid, 400 ms after typing stops. */
  private readonly settledQty = toSignal(
    this.form.controls.producedQty.valueChanges.pipe(
      debounceTime(400),
      map((qty) => (this.form.controls.producedQty.valid ? qty : null)),
    ),
    { initialValue: null },
  );
  protected readonly qty = computed(() => this.value().producedQty);
  protected readonly check = computed(() => {
    const order = this.order();
    return order ? checkClose(order, this.kind(), this.qty()) : null;
  });

  protected readonly preview = rxResource({
    params: () => {
      const qty = this.settledQty();
      return qty && qty > 0 ? { id: this.id(), qty } : undefined;
    },
    stream: ({ params }) => (params ? this.api.closePreview(params.id, params.qty) : of(null)),
  });
  /** The last preview received: it stays on screen while the next one loads. */
  protected readonly lastPreview = linkedSignal<
    ClosePreview | null | undefined,
    ClosePreview | null
  >({
    source: () => (this.preview.hasValue() ? this.preview.value() : undefined),
    computation: (preview, previous) =>
      preview === undefined ? (previous?.value ?? null) : preview,
  });
  /** The preview lines, while the quantity is above 0 (a final close of 0 consumes nothing). */
  protected readonly lines = computed<PreviewLine[]>(() => {
    const qty = this.qty();
    const preview = this.lastPreview();
    return qty && qty > 0 && preview ? preview.lines : [];
  });
  private readonly consumptions = new Map<string, Consumption>();
  /** Bumps when an actual consumption or a lot split changes, for the totals. */
  private readonly edits = signal(0);

  protected readonly costs = computed(() => {
    this.edits();
    return closeCosts(
      this.lines().map((l) => ({
        theoreticalQty: l.theoreticalQty,
        actualQty: this.consumption(l).actual.value,
        averageCost: l.averageCost,
      })),
      this.qty(),
    );
  });
  /** The stock location the components leave: the chosen sub-warehouse or the plant. */
  protected readonly consumptionLocationId = computed(
    () => this.value().consumptionWarehouseId ?? this.order()?.locationId ?? null,
  );

  constructor() {
    effect(() => {
      const order = this.order();
      if (!order) return;
      this.breadcrumbs.setCurrent(this.kind() === 'Final' ? 'Cierre final' : 'Cierre parcial');
      const controls = this.form.controls;
      if (controls.shift.pristine) controls.shift.setValue(order.shift);
      // A final close starts with what is pending; a partial one, empty.
      if (
        this.kind() === 'Final' &&
        controls.producedQty.pristine &&
        controls.producedQty.value === null
      )
        controls.producedQty.setValue(order.pendingQty);
    });
    // Sub-warehouses: required where they exist; the last ones chosen at this plant come back.
    effect(() => {
      const order = this.order();
      const warehouses = this.warehouses();
      if (!order) return;
      const { consumptionWarehouseId: consumption, outputWarehouseId: output } = this.form.controls;
      consumption.setValidators(warehouses.length > 0 ? Validators.required : null);
      // The product enters a sub-warehouse only when something was produced.
      output.setValidators((control) =>
        warehouses.length > 0 && (this.form.controls.producedQty.value ?? 0) > 0 && !control.value
          ? { required: true }
          : null,
      );
      const stored = readWarehouses(order.locationId);
      const exists = (id?: string) => !!id && warehouses.some((w) => w.id === id);
      if (!consumption.value && exists(stored.consumption))
        consumption.setValue(stored.consumption!);
      if (!output.value && exists(stored.output)) output.setValue(stored.output!);
      consumption.updateValueAndValidity();
      output.updateValueAndValidity();
    });
    // Only the lines the user did not touch follow the theoretical of the new quantity.
    effect(() => {
      for (const line of this.lines()) {
        const consumption = this.consumption(line);
        if (consumption.actual.pristine) consumption.actual.setValue(line.theoreticalQty);
      }
      this.edits.update((n) => n + 1);
    });
    // RN-63: the reason (and its notes with "Otro") only when a final close stays below the plan.
    effect(() => {
      const needs = !!this.check()?.needsReason;
      const { shortfallReason, shortfallNotes } = this.form.controls;
      const other = this.value().shortfallReason === 'Other';
      shortfallReason.setValidators(needs ? Validators.required : null);
      shortfallNotes.setValidators(
        needs && other
          ? [Validators.required, Validators.maxLength(500)]
          : Validators.maxLength(500),
      );
      shortfallReason.updateValueAndValidity({ emitEvent: false });
      shortfallNotes.updateValueAndValidity({ emitEvent: false });
    });
  }

  protected consumption(line: PreviewLine): Consumption {
    let consumption = this.consumptions.get(line.componentItemId);
    if (!consumption) {
      consumption = {
        actual: new FormControl<number | null>(line.theoreticalQty, Validators.required),
        lots: signal<Schemas['LotQuantity'][]>([]),
        open: signal(false),
      };
      consumption.actual.valueChanges.subscribe(() => this.edits.update((n) => n + 1));
      this.consumptions.set(line.componentItemId, consumption);
    }
    return consumption;
  }

  protected setLots(line: PreviewLine, lots: Schemas['LotQuantity'][]): void {
    this.consumption(line).lots.set(lots);
    this.edits.update((n) => n + 1);
  }

  protected lotsValid(line: PreviewLine): boolean {
    this.edits();
    const consumption = this.consumption(line);
    return lotSplitValid(consumption.lots(), consumption.actual.value);
  }

  protected async save(): Promise<void> {
    const order = this.order();
    const check = this.check();
    const qty = this.qty();
    const lines = this.lines();
    const linesInvalid = lines.some(
      (l) => this.consumption(l).actual.invalid || !this.lotsValid(l),
    );
    this.form.controls.outputWarehouseId.updateValueAndValidity();
    if (!order || !check || this.form.invalid || linesInvalid || qty === null) {
      this.form.markAllAsTouched();
      lines.forEach((l) => this.consumption(l).actual.markAsTouched());
      return;
    }
    if (qty > 0 && this.preview.isLoading()) return;
    const v = this.form.getRawValue();
    const preview = qty > 0 ? this.lastPreview() : null;
    const final = this.kind() === 'Final';
    const confirmed = await this.confirmService.confirm({
      title: final ? `Cerrar la orden ${order.folio}` : `Cierre parcial de ${order.folio}`,
      message: final
        ? 'La orden queda completada. Un cierre no se edita ni se cancela; se corrige con un ajuste.'
        : 'Un cierre no se edita ni se cancela; se corrige con un ajuste de inventario.',
      summary: [
        { label: 'Producido', value: formatQty(qty, order.baseUomCode) },
        ...(preview?.nextLotNumber
          ? [
              {
                label: 'Lote',
                value: preview.nextLotExpiration
                  ? `${preview.nextLotNumber} · caduca ${new Date(`${preview.nextLotExpiration}T00:00`).toLocaleDateString('es-MX')}`
                  : preview.nextLotNumber,
              },
            ]
          : []),
        ...(check.needsReason && v.shortfallReason
          ? [{ label: 'Faltante', value: enumLabel('ShortfallReason', v.shortfallReason) }]
          : []),
        ...lines.map((l) => ({
          label: l.sku,
          value: formatQty(this.consumption(l).actual.value, l.baseUomCode),
        })),
      ],
      confirmLabel: final ? 'Cerrar orden' : 'Registrar cierre parcial',
    });
    if (!confirmed) return;

    this.saving.set(true);
    try {
      const close = await firstValueFrom(
        this.api.close(order.id, {
          version: order.version,
          kind: this.kind(),
          producedQty: qty,
          shift: v.shift,
          notes: v.notes.trim() || null,
          shortfallReason: check.needsReason ? v.shortfallReason : null,
          shortfallNotes: check.needsReason ? v.shortfallNotes.trim() || null : null,
          lines:
            qty > 0
              ? lines.map((l) => {
                  const consumption = this.consumption(l);
                  const lots = consumption.lots();
                  return {
                    componentItemId: l.componentItemId,
                    actualQty: consumption.actual.value!,
                    lots: lots.length > 0 ? lots : null,
                  };
                })
              : null,
          consumptionWarehouseId: v.consumptionWarehouseId,
          outputWarehouseId: qty > 0 ? v.outputWarehouseId : null,
        }),
      );
      storeWarehouses(order.locationId, {
        consumption: v.consumptionWarehouseId ?? undefined,
        output: v.outputWarehouseId ?? undefined,
      });
      this.notifier.info(
        close.outputLotNumber
          ? `Cierre ${close.folio} registrado · lote ${close.outputLotNumber}.`
          : `Cierre ${close.folio} registrado.`,
      );
      await this.router.navigate(['/produccion/ordenes', order.id]);
    } catch (error) {
      // 409 (shortages or another close of this order) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
      this.resource.reload();
    } finally {
      this.saving.set(false);
    }
  }
}
