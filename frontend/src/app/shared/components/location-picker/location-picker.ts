import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { ApiEnum } from '../../../core/api/api';
import { AuthService } from '../../../core/auth/auth.service';
import {
  bindParentControl,
  parentErrorMatcher,
  repaintOnControlEvents,
} from '../../forms/control-binding';
import { controlError } from '../../forms/control-error';

/**
 * One of the user's allowed locations (frontend §8), filterable by type; plants and branches by default. The value is
 * the location id.
 */
@Component({
  selector: 'app-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field class="field">
      <mat-label>{{ label() }}</mat-label>
      <mat-select [formControl]="selected" [errorStateMatcher]="matcher" (closed)="onTouched()">
        @for (location of locations(); track location.id) {
          <mat-option [value]="location.id">{{ location.name }}</mat-option>
        }
      </mat-select>
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
export class LocationPicker implements ControlValueAccessor, OnInit {
  readonly label = input('Ubicación');
  readonly types = input<readonly ApiEnum<'LocationType'>[]>(['Plant', 'Branch']);
  /** Locations to exclude (the origin when choosing the destination). */
  readonly exclude = input<readonly string[]>([]);

  private readonly auth = inject(AuthService);
  private readonly ngControl = bindParentControl(this);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly matcher = parentErrorMatcher(this.ngControl);
  /** Its own control lets MatSelect track the error state of the parent control. */
  protected readonly selected = new FormControl<string | null>(null);
  protected readonly locations = computed(() =>
    (this.auth.user()?.locations ?? []).filter(
      (l) =>
        l.isActive &&
        (this.types() as readonly string[]).includes(l.type) &&
        !this.exclude().includes(l.id),
    ),
  );

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
