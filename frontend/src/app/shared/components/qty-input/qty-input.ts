import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  ControlValueAccessor,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  bindParentControl,
  parentErrorMatcher,
  repaintOnControlEvents,
} from '../../forms/control-binding';
import { controlError } from '../../forms/control-error';

let nextId = 0;

/**
 * Decimal quantity with its unit (frontend §8). The value is a number or null. Validates on the parent control: a
 * number, greater than 0 (or not negative with `allowZero`), up to `max`, and up to `decimals` decimals (0 by default
 * when the unit is `pza`, RN-03b). Enter emits `entered`; inside `app-lines-editor` it also jumps to the next quantity.
 */
@Component({
  selector: 'app-qty-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-form-field class="field">
      @if (label()) {
        <mat-label>{{ label() }}</mat-label>
      }
      <input
        #input
        matInput
        class="pan-qty-input"
        [id]="inputId"
        autocomplete="off"
        [attr.inputmode]="digits() === 0 ? 'numeric' : 'decimal'"
        [attr.aria-label]="label() ? null : ariaLabel()"
        [formControl]="text"
        [errorStateMatcher]="matcher"
        (blur)="onTouched()"
        (keydown.enter)="onEnter($event)"
      />
      @if (unit()) {
        <span matTextSuffix class="unit">{{ unit() }}</span>
      }
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

    input {
      text-align: right;
    }

    .unit {
      padding-left: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class QtyInput implements ControlValueAccessor, OnInit {
  readonly label = input<string>();
  /** Accessible name when there is no visible label (repeated cards, capture tables). */
  readonly ariaLabel = input<string>();
  readonly unit = input<string | null>();
  /** Decimals allowed; by default 0 for `pza` and 4 for the rest. */
  readonly decimals = input<number | null>(null);
  readonly max = input<number | null>(null);
  readonly allowZero = input(false, { transform: booleanAttribute });
  readonly entered = output<void>();

  private readonly ngControl = bindParentControl(this);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly inputId = `pan-qty-${nextId++}`;
  protected readonly matcher = parentErrorMatcher(this.ngControl);
  /** The typed text; its own control lets MatInput track the error state of the parent control. */
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly digits = computed(() => this.decimals() ?? (this.unit() === 'pza' ? 0 : 4));

  private invalidText = false;
  private onChange: (value: number | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    this.text.valueChanges.pipe(takeUntilDestroyed()).subscribe((raw) => this.onInput(raw));
    // The rules depend on the inputs: validate again when they change.
    effect(() => {
      this.digits();
      this.max();
      this.allowZero();
      this.ngControl?.control?.updateValueAndValidity({ emitEvent: false });
    });
  }

  ngOnInit(): void {
    const control = this.ngControl?.control;
    control?.addValidators(this.validate);
    control?.updateValueAndValidity({ emitEvent: false });
    repaintOnControlEvents(control, this.changeDetector, this.destroyRef);
  }

  focus(): void {
    this.inputElement().nativeElement.focus();
  }

  protected error(): string | null {
    return controlError(this.ngControl?.control ?? null);
  }

  private onInput(raw: string): void {
    const value = parseQty(raw);
    this.invalidText = Number.isNaN(value);
    this.onChange(this.invalidText ? null : value);
  }

  protected onEnter(event: Event): void {
    event.preventDefault();
    this.entered.emit();
  }

  writeValue(value: number | null | undefined): void {
    this.invalidText = false;
    this.text.setValue(value === null || value === undefined ? '' : String(value), {
      emitEvent: false,
    });
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.text.disable({ emitEvent: false });
    else this.text.enable({ emitEvent: false });
  }

  private readonly validate = (
    control: AbstractControl<number | null>,
  ): ValidationErrors | null => {
    if (this.invalidText) return { number: true };
    const value = control.value;
    if (value === null || value === undefined) return null;
    if (this.allowZero() ? value < 0 : value <= 0)
      return this.allowZero() ? { nonNegative: true } : { positive: true };
    const max = this.max();
    if (max !== null && value > max) return { maxQty: { max } };
    if (decimalCount(value) > this.digits()) return { decimals: { digits: this.digits() } };
    return null;
  };
}

/** `1,234.5` → 1234.5; empty → null; anything else → NaN. */
export function parseQty(raw: string): number | null {
  const clean = raw.replace(/[\s,]/g, '');
  if (clean === '') return null;
  return /^-?\d*\.?\d+$|^-?\d+\.$/.test(clean) ? Number(clean) : NaN;
}

function decimalCount(value: number): number {
  const text = String(value);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? text.split('.')[1].length : 0;
}
