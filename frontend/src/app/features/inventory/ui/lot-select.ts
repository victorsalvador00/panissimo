import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  bindParentControl,
  parentErrorMatcher,
  repaintOnControlEvents,
} from '../../../shared/forms/control-binding';
import { controlError } from '../../../shared/forms/control-error';
import { QtyPipe, formatQty } from '../../../shared/pipes/pipes';
import { StockApi } from '../data-access/inventory-api';

/** The stock of the chosen lot at the origin: a line may not ask for more. */
export interface LotLimit {
  lotNumber: string;
  quantity: number;
  unit: string | null;
}

/** The quantity of a line goes beyond the stock of its chosen lot. */
export function lotLimitError(
  quantity: number | null,
  limit: LotLimit | null,
): ValidationErrors | null {
  return limit && quantity !== null && quantity > limit.quantity
    ? {
        message: `El lote ${limit.lotNumber} solo tiene ${formatQty(limit.quantity, limit.unit)} en el origen.`,
      }
    : null;
}

/**
 * The lot limit of each line (a FormGroup with `quantity`): the quantity validator reads the limit of its parent line,
 * which app-lot-select reports through `(limit)`.
 */
export class LotLimits {
  private readonly limits = new WeakMap<AbstractControl, LotLimit | null>();

  /** Only while the line still has a lot chosen (the lot select may be gone with an item without lots). */
  readonly validator = (quantity: AbstractControl): ValidationErrors | null => {
    const line = quantity.parent;
    const limit = line?.get('lotId')?.value ? (this.limits.get(line) ?? null) : null;
    return lotLimitError(quantity.value as number | null, limit);
  };

  set(line: AbstractControl, limit: LotLimit | null): void {
    this.limits.set(line, limit);
    const quantity = line.get('quantity');
    quantity?.updateValueAndValidity();
    if (quantity?.invalid && quantity.value !== null) quantity.markAsTouched();
  }
}

/**
 * Lot to take an exit from, among those with stock at the location; empty = automatic, first to expire first (FEFO,
 * RN-05). The value is the lot id or null; `limit` reports the stock of the chosen lot (null when automatic).
 */
@Component({
  selector: 'app-lot-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, DatePipe, QtyPipe],
  template: `
    <mat-form-field class="field">
      <mat-label>Lote</mat-label>
      <mat-select [formControl]="selected" [errorStateMatcher]="matcher" (closed)="onTouched()">
        <mat-option [value]="null">Automático (el que caduca primero)</mat-option>
        @for (lot of lots.value() ?? []; track $index) {
          @if (lot.lotId) {
            <mat-option [value]="lot.lotId">
              {{ lot.lotNumber }} · {{ lot.quantity | qty: unit() }}
              @if (lot.expirationDate) {
                · {{ lot.isExpired ? 'vencido' : 'caduca' }}
                {{ lot.expirationDate | date: 'dd/MM/yyyy' }}
              }
            </mat-option>
          }
        }
      </mat-select>
      <mat-hint>Vacío: el que caduca primero.</mat-hint>
      <mat-error>{{ error() }}</mat-error>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }

    .field {
      width: 100%;
    }
  `,
})
export class LotSelect implements ControlValueAccessor, OnInit {
  readonly locationId = input.required<string>();
  readonly itemId = input.required<string>();
  readonly unit = input<string | null>(null);
  readonly limit = output<LotLimit | null>();

  private readonly api = inject(StockApi);
  private readonly ngControl = bindParentControl(this);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly matcher = parentErrorMatcher(this.ngControl);
  protected readonly selected = new FormControl<string | null>(null);
  protected readonly lots = rxResource({
    params: () => ({ locationId: this.locationId(), itemId: this.itemId() }),
    stream: ({ params }) => this.api.lots(params.locationId, params.itemId),
  });

  private readonly selectedId = signal<string | null>(null);

  private onChange: (value: string | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    this.selected.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.selectedId.set(id);
      this.onChange(id);
    });
    effect(() => {
      const id = this.selectedId();
      const lot = id ? (this.lots.value() ?? []).find((l) => l.lotId === id) : null;
      this.limit.emit(
        lot ? { lotNumber: lot.lotNumber ?? '', quantity: lot.quantity, unit: this.unit() } : null,
      );
    });
  }

  ngOnInit(): void {
    repaintOnControlEvents(this.ngControl?.control, this.changeDetector, this.destroyRef);
  }

  protected error(): string | null {
    return controlError(this.ngControl?.control ?? null);
  }

  writeValue(value: string | null | undefined): void {
    this.selected.setValue(value ?? null, { emitEvent: false });
    this.selectedId.set(value ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.selected.disable({ emitEvent: false });
    else this.selected.enable({ emitEvent: false });
  }
}
