import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ControlValueAccessor,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import {
  bindParentControl,
  parentErrorMatcher,
  repaintOnControlEvents,
} from '../../forms/control-binding';
import { controlError } from '../../forms/control-error';

/**
 * Autocomplete with server search (frontend §8): suppliers, customers or anything with a lookup. The value of the
 * parent control is the chosen object, or null; text typed without choosing an option is the `notFromList` error.
 * `app-item-picker` extends it for items.
 */
@Component({
  selector: 'app-lookup-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  templateUrl: './lookup-picker.html',
  styleUrl: './lookup-picker.scss',
})
export class LookupPicker<T> implements ControlValueAccessor, OnInit {
  readonly label = input.required<string>();
  readonly placeholder = input<string>('Buscar…');
  /** Server search; receives the typed text (empty when the field gets the focus). */
  readonly search = input<(q: string) => Observable<T[]>>();
  readonly displayWith = input<(option: T) => string>((option) => String(option));
  /** Second line of each option (type, RFC…). */
  readonly describeWith = input<(option: T) => string | null>();

  protected readonly ngControl = bindParentControl(this);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly matcher = parentErrorMatcher(this.ngControl);
  protected readonly text = new FormControl<string | T | null>(null);
  protected readonly options = signal<T[]>([]);
  protected readonly searched = signal(false);

  private readonly queries = new Subject<string>();
  private value: T | null = null;
  private onChange: (value: T | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    this.queries
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.runSearch(q).pipe(catchError(() => of([] as T[])))),
        takeUntilDestroyed(),
      )
      .subscribe((options) => {
        this.options.set(options);
        this.searched.set(true);
      });

    this.text.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (value === null || typeof value === 'string') {
        this.setValue(null);
        this.queries.next(((value as string | null) ?? '').trim());
        return;
      }
      this.setValue(value);
    });
  }

  ngOnInit(): void {
    const control = this.ngControl?.control;
    control?.addValidators(this.validate);
    control?.updateValueAndValidity({ emitEvent: false });
    repaintOnControlEvents(control, this.changeDetector, this.destroyRef);
  }

  /** Text of the chosen option in the input. */
  protected readonly displayFn = (value: string | T | null): string =>
    value === null || typeof value === 'string'
      ? ((value as string | null) ?? '')
      : this.display(value);

  protected display(option: T): string {
    return this.displayWith()(option);
  }

  protected describe(option: T): string | null {
    return this.describeWith()?.(option) ?? null;
  }

  protected runSearch(q: string): Observable<T[]> {
    return this.search()?.(q) ?? of([]);
  }

  protected onFocus(): void {
    if (!this.searched())
      this.queries.next(typeof this.text.value === 'string' ? this.text.value : '');
  }

  protected onBlur(): void {
    this.onTouched();
    this.ngControl?.control?.updateValueAndValidity();
  }

  protected error(): string | null {
    return controlError(this.ngControl?.control ?? null);
  }

  writeValue(value: T | null | undefined): void {
    this.value = value ?? null;
    this.text.setValue(this.value, { emitEvent: false });
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) this.text.disable({ emitEvent: false });
    else this.text.enable({ emitEvent: false });
  }

  private setValue(value: T | null): void {
    if (value === this.value) {
      // Same value, different text: the `notFromList` rule still has to see it.
      this.ngControl?.control?.updateValueAndValidity();
      return;
    }
    this.value = value;
    this.onChange(value);
  }

  /** Typed text that is not an option of the list. */
  private readonly validate = (): ValidationErrors | null =>
    typeof this.text.value === 'string' && this.text.value.trim() !== ''
      ? { notFromList: true }
      : null;
}
