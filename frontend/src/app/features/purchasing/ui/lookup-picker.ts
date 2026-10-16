import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { catchError, debounceTime, map, Observable, of, Subject, switchMap, tap } from 'rxjs';
import { outerControlErrorState } from '../../../shared/forms/control-error';

/**
 * Autocompletado genérico con búsqueda en el servidor: el valor del control es la opción elegida o
 * `null` mientras se escribe. Lo usan el proveedor de la OC y los artículos de su catálogo.
 */
@Component({
  selector: 'app-lookup-picker',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" [subscriptSizing]="subscriptSizing()">
      <mat-label>{{ label() }}</mat-label>
      <input
        matInput
        type="text"
        autocomplete="off"
        [value]="text()"
        [disabled]="disabled()"
        [matAutocomplete]="auto"
        [errorStateMatcher]="errorMatcher"
        (input)="onInput($any($event.target).value)"
        (focus)="onFocus()"
        (blur)="onTouched()"
      />
      @if (searching()) {
        <mat-spinner matSuffix diameter="18" aria-label="Buscando" />
      } @else {
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="displayFn"
        (optionSelected)="onSelected($event)"
      >
        @for (option of options(); track $index) {
          <mat-option [value]="option">
            <span class="name">{{ display()(option) }}</span>
            @if (meta(); as metaFn) {
              <span class="meta">{{ metaFn(option) }}</span>
            }
          </mat-option>
        }
        @if (noResults()) {
          <mat-option disabled>{{ emptyText() }}</mat-option>
        }
      </mat-autocomplete>
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
    .name {
      display: block;
    }
    .meta {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LookupPicker<T> implements ControlValueAccessor, OnInit {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly errorState = outerControlErrorState(this.ngControl);
  private readonly matInput = viewChild(MatInput);

  readonly label = input.required<string>();
  readonly search = input.required<(q: string) => Observable<T[]>>();
  readonly display = input.required<(option: T) => string>();
  readonly meta = input<((option: T) => string) | null>(null);
  readonly hint = input<string>();
  readonly requiredMessage = input('Elige una opción de la lista.');
  readonly emptyText = input('Sin resultados.');
  readonly subscriptSizing = input<'fixed' | 'dynamic'>('fixed');

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  protected readonly searching = signal(false);
  protected readonly options = signal<T[]>([]);
  protected readonly noResults = signal(false);
  protected readonly errorMatcher = this.errorState.matcher;

  protected readonly displayFn = (value: T | string | null): string =>
    typeof value === 'string' ? value : value ? this.display()(value) : '';

  private readonly queries = new Subject<string>();
  private onChange: (value: T | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
    const subscription = this.queries
      .pipe(
        map((q) => q.trim()),
        debounceTime(250),
        tap(() => this.searching.set(true)),
        switchMap((q) => this.search()(q).pipe(catchError(() => of([] as T[])))),
      )
      .subscribe((options) => {
        this.searching.set(false);
        this.options.set(options);
        this.noResults.set(options.length === 0);
      });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  ngOnInit(): void {
    this.errorState.connect(() => this.matInput());
  }

  protected errorMessage(): string {
    const errors = this.ngControl?.control?.errors;
    if (!errors) {
      return '';
    }
    if (errors['required']) {
      return this.requiredMessage();
    }
    return typeof errors['server'] === 'string' ? errors['server'] : 'Opción no válida.';
  }

  writeValue(value: T | null): void {
    this.text.set(value ? this.display()(value) : '');
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  /** Al entrar sin texto muestra las primeras opciones (catálogos cortos, como el de un proveedor). */
  protected onFocus(): void {
    if (!this.text()) {
      this.queries.next('');
    }
  }

  protected onInput(value: string): void {
    this.text.set(value);
    this.onChange(null);
    this.queries.next(value);
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as T;
    this.text.set(this.display()(option));
    this.onChange(option);
  }
}
