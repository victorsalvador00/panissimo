import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NgControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput, MatInputModule } from '@angular/material/input';
import { outerControlErrorState } from '../../forms/control-error';
import { QTY_MAX_DECIMALS } from '../../pipes/qty.pipe';

/** Convierte lo capturado a número; acepta coma decimal por comodidad. `null` si está vacío. */
export function parseQty(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') {
    return null;
  }
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/**
 * Valida una cantidad: número válido, hasta 4 decimales, y > 0 (o ≠ 0 si `allowNegative`,
 * para ajustes con signo; o ≥ 0 si `allowZero`, para conteos). Vacío no es error aquí: usa
 * `Validators.required` si aplica.
 */
export function qtyValidator(
  allowNegative: boolean | (() => boolean) = false,
  allowZero: boolean | (() => boolean) = false,
): ValidatorFn {
  const negativeAllowed = typeof allowNegative === 'function' ? allowNegative : () => allowNegative;
  const zeroAllowed = typeof allowZero === 'function' ? allowZero : () => allowZero;
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as number | null;
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { qtyInvalid: true };
    }
    const decimals = (String(value).split('.')[1] ?? '').length;
    if (decimals > QTY_MAX_DECIMALS) {
      return { qtyDecimals: true };
    }
    if (value === 0 && zeroAllowed()) {
      return null;
    }
    if (negativeAllowed() ? value === 0 : value <= 0) {
      return { qtyPositive: true };
    }
    return null;
  };
}

/** Tope opcional y menos decimales que el estándar (ej. % de merma: 0 a 100 con 2 decimales). */
export function qtyLimitsValidator(max: () => number | null, decimals: () => number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as number | null;
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    const limit = max();
    if (limit !== null && value > limit) {
      return { qtyMax: { max: limit } };
    }
    const places = decimals();
    if (places < QTY_MAX_DECIMALS && (String(value).split('.')[1] ?? '').length > places) {
      return { qtyDecimals: { max: places } };
    }
    return null;
  };
}

/** Mensaje en español del primer error de una cantidad. */
export function qtyErrorMessage(
  errors: ValidationErrors | null,
  allowNegative = false,
  allowZero = false,
): string {
  if (!errors) {
    return '';
  }
  if (errors['required']) {
    return 'Captura la cantidad.';
  }
  if (errors['qtyInvalid']) {
    return 'Escribe un número válido.';
  }
  if (errors['qtyDecimals']) {
    const limits = errors['qtyDecimals'] as { max?: number } | true;
    return `Máximo ${(limits !== true && limits.max) || QTY_MAX_DECIMALS} decimales.`;
  }
  if (errors['qtyMax']) {
    return `El máximo es ${(errors['qtyMax'] as { max: number }).max}.`;
  }
  if (errors['qtyPositive']) {
    if (allowZero) {
      return 'La cantidad no puede ser negativa.';
    }
    return allowNegative ? 'La cantidad no puede ser cero.' : 'La cantidad debe ser mayor a cero.';
  }
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  return 'Cantidad no válida.';
}

/**
 * Captura de cantidad (spec frontend §8): teclado numérico en celular, unidad al lado,
 * validación > 0 y hasta 4 decimales. Enter pasa a la siguiente cantidad de la pantalla.
 * `<app-qty-input formControlName="quantity" label="Cantidad" unit="kg" />`
 */
@Component({
  selector: 'app-qty-input',
  imports: [MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field [appearance]="appearance()" [subscriptSizing]="subscriptSizing()">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <input
        #field
        matInput
        type="text"
        inputmode="decimal"
        autocomplete="off"
        data-qty-input
        [value]="text()"
        [disabled]="disabled()"
        [errorStateMatcher]="errorMatcher"
        [attr.aria-label]="ariaLabel() ?? (label() ? null : 'Cantidad')"
        (input)="onInput(field.value)"
        (blur)="onBlur()"
        (keydown.enter)="focusNext($event)"
      />
      @if (unit()) {
        <span matTextSuffix class="unit">{{ unit() }}</span>
      }
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
      <mat-error>{{ errorMessage() }}</mat-error>
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
    input {
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .unit {
      padding-inline-start: var(--sgo-space-1);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class QtyInput implements ControlValueAccessor, OnInit {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly errorState = outerControlErrorState(this.ngControl);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly matInput = viewChild(MatInput);

  readonly label = input<string>();
  /** Nombre accesible; si se da, gana sobre la etiqueta visible (ej. "Recibido de HAR-001"). */
  readonly ariaLabel = input<string>();
  readonly unit = input<string | null>();
  readonly hint = input<string>();
  readonly allowNegative = input(false);
  /** Acepta 0 (ej. conteo físico: no hay nada en anaquel). */
  readonly allowZero = input(false);
  /** Valor máximo permitido (ej. 100 para porcentajes). */
  readonly max = input<number | null>(null);
  /** Decimales permitidos; por defecto los de cantidades (4). */
  readonly decimals = input(QTY_MAX_DECIMALS);
  readonly appearance = input<'outline' | 'fill'>('outline');
  readonly subscriptSizing = input<'fixed' | 'dynamic'>('fixed');
  /** Enter en el campo (después de pasar el foco a la siguiente cantidad). */
  readonly entered = output<void>();

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** El estado de error lo decide el control del formulario del padre, no el input interno. */
  protected readonly errorMatcher = this.errorState.matcher;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
    effect(() => {
      this.allowNegative();
      this.allowZero();
      this.max();
      this.decimals();
      this.ngControl?.control?.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    const control = this.ngControl?.control;
    if (control) {
      // Lee `allowNegative` en cada validación: puede cambiar (ej. el motivo de un ajuste).
      control.addValidators([
        qtyValidator(
          () => this.allowNegative(),
          () => this.allowZero(),
        ),
        qtyLimitsValidator(
          () => this.max(),
          () => this.decimals(),
        ),
      ]);
      control.updateValueAndValidity({ emitEvent: false });
      this.errorState.connect(() => this.matInput());
    }
  }

  protected errorMessage(): string {
    return qtyErrorMessage(
      this.ngControl?.control?.errors ?? null,
      this.allowNegative(),
      this.allowZero(),
    );
  }

  writeValue(value: number | null): void {
    this.text.set(value === null || value === undefined ? '' : String(value));
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.onChange(parseQty(value));
  }

  protected onBlur(): void {
    this.onTouched();
  }

  /** Enter: siguiente cantidad en el orden de la página (navegación con teclado en capturas). */
  protected focusNext(event: Event): void {
    event.preventDefault();
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[data-qty-input]:not([disabled])'),
    );
    const index = inputs.indexOf(this.field().nativeElement);
    const next = inputs[index + 1];
    if (next) {
      next.focus();
      next.select();
    }
    this.entered.emit();
  }
}
