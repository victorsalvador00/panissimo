import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  LOCALE_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { ConfirmService } from '../../../shared/components/dialogs.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import type { ItemOption } from '../../../shared/data-access/item-lookup.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatQty } from '../../../shared/pipes/qty.pipe';
import { ConsumptionsApi } from '../data-access/consumptions.api';
import { LotStock } from '../data-access/stock.api';
import {
  addQty,
  ConsumptionLine,
  createConsumptionLine,
  mergeTarget,
  toConsumptionRequest,
} from '../ui/consumption-lines';
import { LotSelect } from '../ui/lot-select';

/**
 * Consumo del día de la sucursal activa (spec frontend §7.3): captura rápida artículo → cantidad →
 * Enter, y se descuenta de inmediato al confirmar (FEFO si no se elige lote).
 */
@Component({
  selector: 'app-consumption-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeader,
    ItemPicker,
    QtyInput,
    LotSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './consumption-form-page.html',
  styleUrl: './consumption-form-page.scss',
})
export class ConsumptionFormPage {
  private readonly api = inject(ConsumptionsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly locale = inject(LOCALE_ID);
  private readonly quickItem = viewChild('quickItem', { read: ElementRef });

  protected readonly location = inject(LocationContextService).activeLocation;
  protected readonly isBranch = computed(() => this.location()?.type === 'Branch');
  protected readonly today = new Date();
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    businessDate: new FormControl<Date | null>(new Date(), Validators.required),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<ConsumptionLine>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item', 'lotId')],
    }),
  });

  /** Captura rápida: se agrega a la lista con el botón o con Enter en la cantidad. */
  protected readonly quick = new FormGroup({
    item: new FormControl<ItemOption | null>(null, Validators.required),
    quantity: new FormControl<number | null>(null, Validators.required),
  });

  /** Números de lote conocidos, para el resumen y el diálogo de faltantes. */
  private readonly lotLabels = new Map<string, string>();

  constructor() {
    // Otra sucursal activa: los lotes elegidos ya no aplican.
    effect(() => {
      this.location();
      untracked(() =>
        this.form.controls.lines.controls.forEach((line) => line.controls.lotId.setValue(null)),
      );
    });
  }

  protected get lines(): FormArray<ConsumptionLine> {
    return this.form.controls.lines;
  }

  protected addQuick(): void {
    if (this.quick.invalid) {
      this.quick.markAllAsTouched();
      return;
    }
    const { item, quantity } = this.quick.getRawValue();
    const index = mergeTarget(this.lines.getRawValue(), item!);
    if (index >= 0) {
      const control = this.lines.at(index).controls.quantity;
      control.setValue(addQty(control.value, quantity!));
    } else {
      this.lines.push(createConsumptionLine(item!, quantity!));
    }
    this.quick.reset();
    this.quickItem()?.nativeElement.querySelector('input')?.focus();
  }

  protected remove(index: number): void {
    this.lines.removeAt(index);
  }

  protected rememberLots(lots: LotStock[]): void {
    lots.forEach(
      (lot) => lot.lotId && lot.lotNumber && this.lotLabels.set(lot.lotId, lot.lotNumber),
    );
  }

  protected submit(): void {
    const location = this.location();
    if (!location || !this.isBranch() || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.confirmService
      .confirm({
        title: '¿Registrar consumo?',
        message:
          'Se descontará la existencia de inmediato. Un consumo registrado no se cancela; se corrige con un ajuste.',
        items: [
          { label: 'Sucursal', value: `${location.code} · ${location.name}` },
          {
            label: 'Día',
            value: value.businessDate?.toLocaleDateString(this.locale) ?? '',
          },
          { label: 'Líneas', value: String(value.lines.length) },
        ],
        lines: {
          headers: ['Artículo', 'Lote', 'Cantidad'],
          rows: value.lines.map((line) => [
            `${line.item.sku} · ${line.item.name}`,
            line.item.tracksLots
              ? line.lotId
                ? (this.lotLabels.get(line.lotId) ?? 'Elegido')
                : 'Automático'
              : '—',
            formatQty(line.quantity, this.locale, line.item.baseUomCode),
          ]),
          alignEnd: [2],
        },
        confirmLabel: 'Registrar consumo',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.api.create(toConsumptionRequest({ ...value, locationId: location.id }));
        }),
      )
      .subscribe({
        next: (entry) => {
          this.saving.set(false);
          this.notifier.success(`Consumo ${entry.folio} registrado.`);
          void this.router.navigate(['/inventario/consumos', entry.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formErrors.handle(error, this.form, {
            units: Object.fromEntries(value.lines.map((l) => [l.item.id, l.item.baseUomCode])),
            lotLabels: Object.fromEntries(this.lotLabels),
          });
        },
      });
  }
}
