import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { FormErrors } from '../../../shared/forms/form-errors';
import { ItemLocationSetting, ItemsApi } from '../data-access/catalog-api';

type SettingRow = FormGroup<{
  min: FormControl<number | null>;
  max: FormControl<number | null>;
}>;

/**
 * Min/max of an item per location (frontend §7.2, RN-07), with its own save. Empty means no alert at that location.
 */
@Component({
  selector: 'app-item-location-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, QtyInput],
  template: `
    <form class="pan-card card" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <p class="intro">
        Existencia mínima y máxima por ubicación. Debajo del mínimo aparece en alertas y en el
        sugerido de pedido; vacío, no se vigila en esa ubicación.
      </p>
      @if (settings.isLoading() && rows().length === 0) {
        <p role="status">Cargando…</p>
      }
      <div class="grid pan-capture" role="table" aria-label="Mínimo y máximo por ubicación">
        <div class="head" role="row">
          <span role="columnheader">Ubicación</span>
          <span role="columnheader">Mínimo</span>
          <span role="columnheader">Máximo</span>
        </div>
        @for (setting of rows(); track setting.locationId; let i = $index) {
          <div class="row" role="row" [formGroup]="lines.at(i)">
            <span role="cell" class="location">
              <strong>{{ setting.locationCode }}</strong> {{ setting.locationName }}
            </span>
            <span role="cell">
              <app-qty-input
                formControlName="min"
                [unit]="unit()"
                allowZero
                [ariaLabel]="'Mínimo en ' + setting.locationName"
              />
            </span>
            <span role="cell">
              <app-qty-input
                formControlName="max"
                [unit]="unit()"
                allowZero
                [ariaLabel]="'Máximo en ' + setting.locationName"
              />
              @if (lines.at(i).errors?.['message']; as message) {
                <span class="error" role="alert">{{ message }}</span>
              }
            </span>
          </div>
        }
      </div>
      @if (!readonly()) {
        <div class="actions">
          <button matButton="filled" type="submit" [disabled]="saving()">Guardar mín/máx</button>
        </div>
      }
    </form>
  `,
  styles: `
    .card {
      margin-top: 16px;
    }

    .intro {
      margin: 0 0 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .head,
    .row {
      display: grid;
      grid-template-columns: minmax(160px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr);
      gap: 12px;
      align-items: start;
    }

    .head {
      padding: 8px 0;
      border-bottom: 1px solid var(--pan-row-divider);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-large);
    }

    .row {
      padding-top: 8px;
      border-bottom: 1px solid var(--pan-row-divider);
    }

    .location {
      padding-top: 16px;
    }

    .error {
      display: block;
      margin: 0 0 8px 16px;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
    }

    @media (max-width: 599.98px) {
      .head {
        display: none;
      }

      .row {
        grid-template-columns: 1fr 1fr;
      }

      .location {
        grid-column: 1 / -1;
        padding-top: 0;
      }
    }
  `,
})
export class ItemLocationSettings {
  readonly itemId = input.required<string>();
  readonly unit = input<string | null>(null);
  readonly readonly = input(false, { transform: booleanAttribute });

  private readonly api = inject(ItemsApi);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);

  protected readonly settings = rxResource({
    params: () => this.itemId(),
    stream: ({ params }) => this.api.locationSettings(params),
  });
  protected readonly rows = signal<ItemLocationSetting[]>([]);
  protected readonly lines = new FormArray<SettingRow>([]);
  protected readonly form = new FormGroup({ settings: this.lines });
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      if (this.settings.hasValue()) this.show(this.settings.value());
    });
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.updateLocationSettings(
          this.itemId(),
          this.rows().map((row, i) => ({
            locationId: row.locationId,
            minQty: this.lines.at(i).controls.min.value,
            maxQty: this.lines.at(i).controls.max.value,
          })),
        ),
      );
      this.show(saved);
      this.notifier.info('Mínimos y máximos guardados.');
    } catch (error) {
      this.formErrors.apply(this.form, error);
    } finally {
      this.saving.set(false);
    }
  }

  private show(settings: ItemLocationSetting[]): void {
    this.rows.set(settings);
    this.lines.clear({ emitEvent: false });
    for (const setting of settings) {
      this.lines.push(
        new FormGroup(
          {
            min: new FormControl<number | null>(setting.minQty),
            max: new FormControl<number | null>(setting.maxQty),
          },
          { validators: maxNotBelowMin },
        ),
        { emitEvent: false },
      );
    }
    if (this.readonly()) this.form.disable({ emitEvent: false });
  }
}

/** RN-07: the maximum is not below the minimum. */
function maxNotBelowMin(group: AbstractControl): ValidationErrors | null {
  const { min, max } = group.value as { min: number | null; max: number | null };
  return min !== null && max !== null && max < min
    ? { message: 'El máximo no puede ser menor que el mínimo.' }
    : null;
}
