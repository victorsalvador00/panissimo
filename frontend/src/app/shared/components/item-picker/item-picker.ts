import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
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
import {
  catchError,
  debounceTime,
  forkJoin,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { ItemLookupService, ItemOption, ItemType } from '../../data-access/item-lookup.service';
import { outerControlErrorState } from '../../forms/control-error';
import { QtyPipe } from '../../pipes/qty.pipe';

interface Suggestion {
  item: ItemOption;
  /** Existencia en la ubicación activa (solo con `showStock`). */
  onHand?: number;
}

export function itemDisplay(item: ItemOption | null | undefined): string {
  return item ? `${item.sku} · ${item.name}` : '';
}

/**
 * Autocompletado de artículos por SKU o nombre (spec frontend §8). El valor del control es el
 * artículo completo (`ItemOption`) o `null`; mientras se escribe sin elegir, el valor es `null`.
 * Con `showStock` muestra la existencia en la ubicación activa.
 */
@Component({
  selector: 'app-item-picker',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatProgressSpinnerModule,
    QtyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field [appearance]="appearance()" [subscriptSizing]="subscriptSizing()">
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
        (blur)="onTouched()"
      />
      @if (searching()) {
        <mat-spinner matSuffix diameter="18" aria-label="Buscando" />
      } @else {
        <mat-icon matSuffix aria-hidden="true">search</mat-icon>
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        [displayWith]="displayOption"
        (optionSelected)="onSelected($event)"
      >
        @for (suggestion of suggestions(); track suggestion.item.id) {
          <mat-option [value]="suggestion">
            <span class="name">{{ suggestion.item.sku }} · {{ suggestion.item.name }}</span>
            <span class="meta">
              {{ suggestion.item.baseUomCode }}
              @if (showStock()) {
                · Existencia: {{ suggestion.onHand ?? 0 | qty: suggestion.item.baseUomCode }}
              }
            </span>
          </mat-option>
        }
        @if (noResults()) {
          <mat-option disabled>Sin resultados para "{{ lastQuery() }}"</mat-option>
        }
      </mat-autocomplete>
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
export class ItemPicker implements ControlValueAccessor, OnInit {
  private readonly lookup = inject(ItemLookupService);
  private readonly locationContext = inject(LocationContextService);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly errorState = outerControlErrorState(this.ngControl);
  private readonly matInput = viewChild(MatInput);

  readonly label = input('Artículo');
  readonly type = input<ItemType>();
  /** Filtro adicional sobre los resultados (ej. excluir materia prima). */
  readonly filter = input<((item: ItemOption) => boolean) | null>(null);
  readonly showStock = input(false);
  /** Ubicación de la existencia mostrada; por defecto la activa. */
  readonly stockLocationId = input<string | null>();
  readonly appearance = input<'outline' | 'fill'>('outline');
  readonly subscriptSizing = input<'fixed' | 'dynamic'>('fixed');
  readonly selected = output<ItemOption | null>();

  protected readonly text = signal('');
  protected readonly disabled = signal(false);
  protected readonly searching = signal(false);
  protected readonly suggestions = signal<Suggestion[]>([]);
  protected readonly lastQuery = signal('');
  protected readonly noResults = signal(false);
  protected readonly errorMatcher = this.errorState.matcher;

  private readonly queries = new Subject<string>();
  private onChange: (value: ItemOption | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected readonly displayOption = (value: Suggestion | ItemOption | string | null): string =>
    typeof value === 'string' ? value : itemDisplay(value && 'item' in value ? value.item : value);

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
    const subscription = this.queries
      .pipe(
        map((q) => q.trim()),
        debounceTime(250),
        tap((q) => {
          this.lastQuery.set(q);
          this.searching.set(q.length > 0);
        }),
        switchMap((q) => (q ? this.search(q) : of([]))),
      )
      .subscribe((suggestions) => {
        this.searching.set(false);
        this.suggestions.set(suggestions);
        this.noResults.set(!!this.lastQuery() && suggestions.length === 0);
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
      return 'Elige un artículo de la lista.';
    }
    return typeof errors['server'] === 'string' ? errors['server'] : 'Artículo no válido.';
  }

  writeValue(value: ItemOption | null): void {
    this.text.set(itemDisplay(value));
    if (!value) {
      // Formulario reiniciado: que al volver al campo no aparezcan las sugerencias anteriores.
      this.suggestions.set([]);
      this.noResults.set(false);
    }
  }

  registerOnChange(fn: (value: ItemOption | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(value: string): void {
    this.text.set(value);
    // Escribir invalida la selección anterior: el valor solo existe al elegir una opción.
    this.onChange(null);
    this.selected.emit(null);
    this.queries.next(value);
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const { item } = event.option.value as Suggestion;
    this.text.set(itemDisplay(item));
    this.onChange(item);
    this.selected.emit(item);
  }

  private search(q: string): Observable<Suggestion[]> {
    const locationId = this.stockLocationId() ?? this.locationContext.activeLocationId();
    const items$ = this.lookup.search(q, this.type());
    const stock$ =
      this.showStock() && locationId
        ? this.lookup.stock(locationId, q).pipe(catchError(() => of(new Map<string, number>())))
        : of(new Map<string, number>());
    const filter = this.filter();
    return forkJoin([items$, stock$]).pipe(
      map(([items, stock]) =>
        (filter ? items.filter(filter) : items).map((item) => ({
          item,
          onHand: stock.get(item.id),
        })),
      ),
      catchError(() => of([])),
    );
  }
}
