import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelect, MatSelectModule } from '@angular/material/select';
import type { ApiEnum } from '../../../core/api/api-types';
import { LocationContextService } from '../../../core/context/location-context.service';
import { outerControlErrorState } from '../../forms/control-error';
import { StatusLabelPipe } from '../../pipes/status-label.pipe';

export type LocationType = ApiEnum<'LocationType'>;

/**
 * Selector de ubicaciones permitidas al usuario, filtrable por tipo (spec frontend §8).
 * El valor es el id de la ubicación. `exclude` quita una (ej. el destino no puede ser el origen).
 */
@Component({
  selector: 'app-location-picker',
  imports: [MatFormFieldModule, MatSelectModule, StatusLabelPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field [appearance]="appearance()" [subscriptSizing]="subscriptSizing()">
      <mat-label>{{ label() }}</mat-label>
      <mat-select
        [value]="value()"
        [disabled]="disabled()"
        [errorStateMatcher]="errorMatcher"
        (selectionChange)="onSelect($event.value)"
        (openedChange)="$event || onTouched()"
      >
        @for (location of options(); track location.id) {
          <mat-option [value]="location.id">
            {{ location.code }} · {{ location.name }}
            <small>({{ location.type | statusLabel: 'LocationType' }})</small>
          </mat-option>
        } @empty {
          <mat-option disabled>No hay ubicaciones disponibles</mat-option>
        }
      </mat-select>
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
    small {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LocationPicker implements ControlValueAccessor, OnInit {
  private readonly locationContext = inject(LocationContextService);
  private readonly ngControl = inject(NgControl, { self: true, optional: true });
  private readonly errorState = outerControlErrorState(this.ngControl);
  private readonly matSelect = viewChild(MatSelect);

  readonly label = input('Ubicación');
  readonly types = input<LocationType[]>();
  readonly exclude = input<string | null>();
  readonly appearance = input<'outline' | 'fill'>('outline');
  readonly subscriptSizing = input<'fixed' | 'dynamic'>('fixed');

  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly errorMatcher = this.errorState.matcher;

  protected readonly options = computed(() => {
    const types = this.types();
    return this.locationContext
      .locations()
      .filter((location) => !types?.length || types.includes(location.type as LocationType))
      .filter((location) => location.id !== this.exclude());
  });

  private onChange: (value: string | null) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  ngOnInit(): void {
    this.errorState.connect(() => this.matSelect());
  }

  protected errorMessage(): string {
    const errors = this.ngControl?.control?.errors;
    if (!errors) {
      return '';
    }
    if (errors['required']) {
      return 'Elige una ubicación.';
    }
    return typeof errors['server'] === 'string' ? errors['server'] : 'Ubicación no válida.';
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onSelect(id: string): void {
    this.value.set(id);
    this.onChange(id);
  }
}
