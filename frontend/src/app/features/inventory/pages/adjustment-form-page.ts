import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom, startWith } from 'rxjs';
import type { Schemas } from '../../../core/api/api';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import {
  LineColumn,
  LinesEditor,
  minLinesValidator,
} from '../../../shared/components/lines-editor/lines-editor';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { enumLabel } from '../../../shared/pipes/labels';
import { formatQty } from '../../../shared/pipes/pipes';
import { AdjustmentsApi, StockApi } from '../data-access/inventory-api';
import { LotSelect } from '../ui/lot-select';
import {
  ADJUSTMENT_REASONS,
  AdjustmentReason,
  Direction,
  WASTE_REASONS,
  reasonDirection,
} from '../ui/adjustment-rules';

type AdjustmentLine = FormGroup<{
  itemId: FormControl<ItemOption | null>;
  direction: FormControl<Direction>;
  quantity: FormControl<number | null>;
  lotId: FormControl<string | null>;
  lotNumber: FormControl<string>;
  expirationDate: FormControl<Date | null>;
  unitCost: FormControl<number | null>;
  wasteQty: FormControl<number | null>;
  wasteReason: FormControl<AdjustmentReason | null>;
  notes: FormControl<string>;
}>;

/**
 * /inventario/ajustes/nuevo (frontend §7.3, RN-02, D-08): reason and lines. Exits are typed positive and sent
 * negative; a correction chooses entry or exit per line. Entries may bring lot, expiry and cost; exits take the
 * chosen lot or the first to expire. A customer return may send part to waste with its reason. It posts at once.
 */
@Component({
  selector: 'app-adjustment-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    LinesEditor,
    LineColumn,
    ItemPicker,
    QtyInput,
    LotSelect,
  ],
  templateUrl: './adjustment-form-page.html',
  styleUrl: './adjustment-form-page.scss',
})
export class AdjustmentFormPage {
  private readonly api = inject(AdjustmentsApi);
  private readonly stockApi = inject(StockApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  protected readonly location = inject(LocationContextService).active;

  protected readonly reasons = ADJUSTMENT_REASONS;
  protected readonly wasteReasons = WASTE_REASONS;
  protected readonly controlError = controlError;
  protected readonly saving = signal(false);

  /** Sub-warehouses where stock moves; with them, the adjustment goes to one (RN-45). */
  protected readonly warehouses = rxResource({
    params: () => this.location()?.id,
    stream: ({ params }) => this.stockApi.warehouses(params),
    defaultValue: [],
  });
  protected readonly stockWarehouses = computed(() =>
    this.warehouses.value().filter((w) => w.isActive && w.canMoveStock),
  );

  protected readonly lines = new FormArray<AdjustmentLine>([], minLinesValidator(1));
  protected readonly form = new FormGroup({
    warehouseId: new FormControl<string | null>(null),
    reason: new FormControl<AdjustmentReason>('Correction', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: this.lines,
  });
  protected readonly newLine = () => this.createLine();

  private readonly reason = toSignal(
    this.form.controls.reason.valueChanges.pipe(startWith(this.form.controls.reason.value)),
    { initialValue: this.form.controls.reason.value },
  );
  protected readonly direction = computed(() => reasonDirection(this.reason()));
  private readonly warehouseId = toSignal(this.form.controls.warehouseId.valueChanges, {
    initialValue: null,
  });
  /** The stock location: the chosen sub-warehouse, or the active location itself. */
  protected readonly stockLocationId = computed(() =>
    this.stockWarehouses().length > 0 ? this.warehouseId() : (this.location()?.id ?? null),
  );

  constructor() {
    this.lines.push(this.createLine());
    // The sub-warehouse is required only where they exist.
    effect(() => {
      const control = this.form.controls.warehouseId;
      control.setValidators(this.stockWarehouses().length > 0 ? Validators.required : null);
      control.updateValueAndValidity();
    });
    // A reason with one direction fixes it on every line; waste only exists in customer returns.
    effect(() => {
      const direction = this.direction();
      const reason = this.reason();
      for (const line of this.lines.controls) {
        if (direction !== 'both') line.controls.direction.setValue(direction);
        if (reason !== 'CustomerReturn') {
          line.controls.wasteQty.setValue(null);
          line.controls.wasteReason.setValue(null);
        }
      }
    });
  }

  protected isEntry(line: AdjustmentLine): boolean {
    return line.controls.direction.value === 'in';
  }

  protected tracksLots(line: AdjustmentLine): boolean {
    return !!line.controls.itemId.value?.tracksLots;
  }

  protected async save(): Promise<void> {
    const location = this.location();
    const stockLocationId = this.stockLocationId();
    if (this.form.invalid || !location || !stockLocationId) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const lines = this.lines.controls.map((line) => this.toRequest(line));
    const warehouse = this.stockWarehouses().find((w) => w.id === stockLocationId);
    const confirmed = await this.confirmService.confirm({
      title: 'Registrar ajuste',
      message:
        'El ajuste se aplica a la existencia en cuanto lo confirmes; no se puede editar después.',
      summary: [
        {
          label: 'Ubicación',
          value: warehouse ? `${location.name} · ${warehouse.name}` : location.name,
        },
        { label: 'Motivo', value: enumLabel('AdjustmentReason', value.reason) },
        ...this.lines.controls.map((line, i) => ({
          label: `Línea ${i + 1}`,
          value: `${line.controls.itemId.value?.sku} · ${this.isEntry(line) ? 'entrada' : 'salida'} de ${formatQty(
            line.controls.quantity.value,
            line.controls.itemId.value?.baseUomCode,
          )}`,
        })),
      ],
      confirmLabel: 'Registrar ajuste',
    });
    if (!confirmed) return;

    this.saving.set(true);
    try {
      const adjustment = await firstValueFrom(
        this.api.create({
          locationId: stockLocationId,
          reason: value.reason,
          notes: value.notes.trim() || null,
          lines,
        }),
      );
      this.notifier.info(`Ajuste ${adjustment.folio} registrado.`);
      await this.router.navigate(['/inventario/ajustes', adjustment.id]);
    } catch (error) {
      // A 409 (insufficient stock) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private toRequest(line: AdjustmentLine): Schemas['AdjustmentLineRequest'] {
    const v = line.getRawValue();
    const entry = v.direction === 'in';
    const lots = !!v.itemId?.tracksLots;
    return {
      itemId: v.itemId!.id,
      quantity: entry ? v.quantity! : -v.quantity!,
      lotId: !entry ? v.lotId : null,
      lotNumber: entry && lots ? v.lotNumber.trim() || null : null,
      expirationDate: entry && lots ? toIsoDate(v.expirationDate) : null,
      unitCost: entry ? v.unitCost : null,
      wasteQty: v.wasteQty,
      wasteReason: v.wasteQty ? v.wasteReason : null,
      notes: v.notes.trim() || null,
    };
  }

  private createLine(): AdjustmentLine {
    const direction = this.direction();
    return new FormGroup({
      itemId: new FormControl<ItemOption | null>(null, Validators.required),
      direction: new FormControl<Direction>(direction === 'out' ? 'out' : 'in', {
        nonNullable: true,
      }),
      quantity: new FormControl<number | null>(null, Validators.required),
      lotId: new FormControl<string | null>(null),
      lotNumber: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
      expirationDate: new FormControl<Date | null>(null),
      unitCost: new FormControl<number | null>(null),
      wasteQty: new FormControl<number | null>(null),
      wasteReason: new FormControl<AdjustmentReason | null>(null),
      notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    });
  }
}
