import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier';
import { ConfirmService } from '../../../shared/components/confirm-summary/confirm-summary';
import { ItemOption, ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { controlError } from '../../../shared/forms/control-error';
import { toIsoDate } from '../../../shared/forms/dates';
import { FormErrors } from '../../../shared/forms/form-errors';
import { formatQty } from '../../../shared/pipes/pipes';
import { ConsumptionsApi } from '../data-access/inventory-api';
import { LotSelect } from '../ui/lot-select';
import { stockWarehouses } from '../ui/stock-warehouses';

interface ConsumptionLine {
  item: ItemOption;
  quantity: FormControl<number | null>;
  lotId: FormControl<string | null>;
}

/**
 * /inventario/consumos/nuevo (frontend §7.3, RN-09): only branches. Day (today or earlier), quick capture item →
 * quantity → Enter (the same item adds up), optional lot (first to expire otherwise), confirmation. Posts at once.
 */
@Component({
  selector: 'app-consumption-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    ItemPicker,
    QtyInput,
    LotSelect,
  ],
  templateUrl: './consumption-form-page.html',
  styleUrl: './consumption-form-page.scss',
})
export class ConsumptionFormPage {
  private readonly api = inject(ConsumptionsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly location = inject(LocationContextService).active;
  protected readonly isBranch = computed(() => this.location()?.type === 'Branch');
  protected readonly warehouses = stockWarehouses(this.location);
  protected readonly controlError = controlError;
  protected readonly today = new Date();
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    warehouseId: new FormControl<string | null>(null),
    businessDate: new FormControl<Date | null>(new Date(), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });
  protected readonly quick = new FormGroup({
    item: new FormControl<ItemOption | null>(null, Validators.required),
    quantity: new FormControl<number | null>(null, Validators.required),
  });
  protected readonly lines = signal<ConsumptionLine[]>([]);

  private readonly warehouseId = toSignal(this.form.controls.warehouseId.valueChanges, {
    initialValue: null,
  });
  protected readonly stockLocationId = computed(() =>
    this.warehouses().length > 0 ? this.warehouseId() : (this.location()?.id ?? null),
  );

  constructor() {
    effect(() => {
      const control = this.form.controls.warehouseId;
      control.setValidators(this.warehouses().length > 0 ? Validators.required : null);
      control.updateValueAndValidity();
    });
  }

  /** Adds the quick line; the same item (without a chosen lot) adds up. */
  protected add(): void {
    if (this.quick.invalid) {
      this.quick.markAllAsTouched();
      return;
    }
    const { item, quantity } = this.quick.getRawValue();
    const existing = this.lines().find((l) => l.item.id === item!.id && !l.lotId.value);
    if (existing) existing.quantity.setValue((existing.quantity.value ?? 0) + quantity!);
    else
      this.lines.update((lines) => [
        ...lines,
        {
          item: item!,
          quantity: new FormControl<number | null>(quantity, Validators.required),
          lotId: new FormControl<string | null>(null),
        },
      ]);
    this.quick.reset();
    this.host.nativeElement
      .querySelector<HTMLInputElement>('.quick app-item-picker input')
      ?.focus();
  }

  protected remove(line: ConsumptionLine): void {
    this.lines.update((lines) => lines.filter((l) => l !== line));
  }

  protected async save(): Promise<void> {
    const location = this.location();
    const stockLocationId = this.stockLocationId();
    const lines = this.lines();
    const invalidLines = lines.some((l) => l.quantity.invalid);
    if (this.form.invalid || invalidLines || !location || !stockLocationId || lines.length === 0) {
      this.form.markAllAsTouched();
      lines.forEach((l) => l.quantity.markAsTouched());
      if (lines.length === 0) this.notifier.error('Agrega al menos un artículo.');
      return;
    }
    const { businessDate, notes } = this.form.getRawValue();
    const confirmed = await this.confirmService.confirm({
      title: 'Registrar consumo',
      message: 'Se descuenta de la existencia en cuanto lo confirmes.',
      summary: [
        { label: 'Ubicación', value: location.name },
        { label: 'Día', value: businessDate!.toLocaleDateString('es-MX') },
        ...lines.map((l) => ({
          label: l.item.sku,
          value: formatQty(l.quantity.value, l.item.baseUomCode),
        })),
      ],
      confirmLabel: 'Registrar consumo',
    });
    if (!confirmed) return;

    this.saving.set(true);
    try {
      const consumption = await firstValueFrom(
        this.api.create({
          locationId: stockLocationId,
          businessDate: toIsoDate(businessDate),
          notes: notes.trim() || null,
          lines: lines.map((l) => ({
            itemId: l.item.id,
            lotId: l.lotId.value,
            quantity: l.quantity.value!,
          })),
        }),
      );
      this.notifier.info(`Consumo ${consumption.folio} registrado.`);
      await this.router.navigate(['/inventario/consumos', consumption.id]);
    } catch (error) {
      // A 409 (insufficient stock) opens its dialog from the error interceptor.
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }
}
