import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  LOCALE_ID,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { filter, startWith, switchMap } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { Notifier } from '../../../core/http/notifier.service';
import { ConfirmService } from '../../../shared/components/dialogs.service';
import { ItemPicker } from '../../../shared/components/item-picker/item-picker';
import { LineColumnDef, LinesEditor } from '../../../shared/components/lines-editor/lines-editor';
import {
  minLinesValidator,
  uniqueLinesValidator,
} from '../../../shared/components/lines-editor/lines-validators';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { formatQty } from '../../../shared/pipes/qty.pipe';
import { ENUM_LABELS } from '../../../shared/pipes/status-label.pipe';
import { AdjustmentReason, AdjustmentsApi } from '../data-access/adjustments.api';
import { LotStock } from '../data-access/stock.api';
import {
  AdjustmentLine,
  createAdjustmentLine,
  isEntry,
  isExitOnly,
  signedQuantity,
  toAdjustmentRequest,
} from '../ui/adjustment-lines';
import { LotSelect } from '../ui/lot-select';

export const REASON_HINTS: Record<AdjustmentReason, string> = {
  Correction:
    'Corrige diferencias: captura en positivo lo que falta en el sistema (entrada) y en negativo lo que sobra (salida).',
  Waste: 'Merma: se da de baja la cantidad capturada.',
  Expired: 'Producto caducado: se da de baja la cantidad capturada (permite lotes vencidos).',
  Damaged: 'Producto dañado: se da de baja la cantidad capturada.',
  InternalUse: 'Uso interno: se da de baja la cantidad capturada.',
};

/** Nuevo ajuste de inventario (spec frontend §7.3); se registra de inmediato al confirmar. */
@Component({
  selector: 'app-adjustment-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    PageHeader,
    LocationPicker,
    ItemPicker,
    QtyInput,
    LinesEditor,
    LineColumnDef,
    LotSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './adjustment-form-page.html',
  styles: `
    .header {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--sgo-space-2) var(--sgo-space-4);
    }
    .hint {
      margin: 0 0 var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .entry-lot {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--sgo-space-2);
    }
    .none {
      display: inline-block;
      padding-top: var(--sgo-space-4);
      color: var(--mat-sys-on-surface-variant);
    }
    h2 {
      margin: 0 0 var(--sgo-space-3);
      font: var(--mat-sys-title-medium);
    }
  `,
})
export class AdjustmentFormPage {
  private readonly api = inject(AdjustmentsApi);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly confirmService = inject(ConfirmService);
  private readonly formErrors = inject(FormErrors);
  private readonly locale = inject(LOCALE_ID);

  protected readonly reasons = Object.keys(ENUM_LABELS.AdjustmentReason) as AdjustmentReason[];
  protected readonly reasonLabels = ENUM_LABELS.AdjustmentReason;
  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(
      inject(LocationContextService).activeLocationId(),
      Validators.required,
    ),
    reason: new FormControl<AdjustmentReason>('Waste', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
    lines: new FormArray<AdjustmentLine>([], {
      validators: [minLinesValidator(1), uniqueLinesValidator('item', 'lotId', 'lotNumber')],
    }),
  });

  protected readonly reason = toSignal(this.form.controls.reason.valueChanges, {
    initialValue: this.form.controls.reason.value,
  });
  protected readonly locationId = toSignal(
    this.form.controls.locationId.valueChanges.pipe(startWith(this.form.controls.locationId.value)),
    { initialValue: this.form.controls.locationId.value },
  );
  protected readonly exitOnly = computed(() => isExitOnly(this.reason()));
  protected readonly reasonHint = computed(() => REASON_HINTS[this.reason()]);

  /** Números de lote conocidos, para nombrarlos en el diálogo de faltantes. */
  private readonly lotLabels = new Map<string, string>();

  protected readonly newLine = () => createAdjustmentLine(() => this.form.controls.reason.value);

  constructor() {
    this.form.controls.lines.push(this.newLine());
    // El motivo cambia qué líneas son entradas: revalidar todas.
    this.form.controls.reason.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.lines.controls.forEach((line) => line.updateValueAndValidity());
    });
    // Otra ubicación: los lotes elegidos ya no aplican.
    this.form.controls.locationId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.form.controls.lines.controls.forEach((line) => line.controls.lotId.setValue(null));
    });
  }

  protected isEntryLine(line: AdjustmentLine): boolean {
    return isEntry(this.reason(), line.controls.quantity.value);
  }

  protected rememberLots(lots: LotStock[]): void {
    lots.forEach(
      (lot) => lot.lotId && lot.lotNumber && this.lotLabels.set(lot.lotId, lot.lotNumber),
    );
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const lines = value.lines;
    const reason = value.reason;

    this.confirmService
      .confirm({
        title: `¿Registrar ajuste por ${this.reasonLabels[reason].toLowerCase()}?`,
        message:
          'Se moverá la existencia de inmediato. Un ajuste registrado no se cancela; se corrige con otro ajuste.',
        items: [{ label: 'Líneas', value: String(lines.length) }],
        lines: {
          headers: ['Artículo', 'Lote', 'Cantidad'],
          rows: lines.map((line) => {
            const quantity = signedQuantity(reason, line.quantity ?? 0);
            const lot = line.item?.tracksLots
              ? quantity > 0
                ? line.lotNumber || '—'
                : line.lotId
                  ? (this.lotLabels.get(line.lotId) ?? 'Elegido')
                  : 'Automático'
              : '—';
            return [
              `${line.item?.sku} · ${line.item?.name}`,
              lot,
              `${quantity > 0 ? '+' : ''}${formatQty(quantity, this.locale, line.item?.baseUomCode)}`,
            ];
          }),
          alignEnd: [2],
        },
        confirmLabel: 'Registrar ajuste',
        tone: isExitOnly(reason) ? 'warn' : 'primary',
      })
      .pipe(
        filter(Boolean),
        switchMap(() => {
          this.saving.set(true);
          return this.api.create(toAdjustmentRequest({ ...value, locationId: value.locationId! }));
        }),
      )
      .subscribe({
        next: (adjustment) => {
          this.saving.set(false);
          this.notifier.success(`Ajuste ${adjustment.folio} registrado.`);
          void this.router.navigate(['/inventario/ajustes', adjustment.id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const units = Object.fromEntries(
            lines.filter((l) => l.item).map((l) => [l.item!.id, l.item!.baseUomCode]),
          );
          this.formErrors.handle(error, this.form, {
            units,
            lotLabels: Object.fromEntries(this.lotLabels),
          });
        },
      });
  }
}
