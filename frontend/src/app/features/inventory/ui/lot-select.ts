import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import {
  bindParentControl,
  parentErrorMatcher,
  repaintOnControlEvents,
} from '../../../shared/forms/control-binding';
import { controlError } from '../../../shared/forms/control-error';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { StockApi } from '../data-access/inventory-api';

/**
 * Lot to take an exit from, among those with stock at the location; empty = automatic, first to expire first (FEFO,
 * RN-05). The value is the lot id or null.
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

  private onChange: (value: string | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    this.selected.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => this.onChange(id));
  }

  ngOnInit(): void {
    repaintOnControlEvents(this.ngControl?.control, this.changeDetector, this.destroyRef);
  }

  protected error(): string | null {
    return controlError(this.ngControl?.control ?? null);
  }

  writeValue(value: string | null | undefined): void {
    this.selected.setValue(value ?? null, { emitEvent: false });
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
