import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Notifier } from '../../../core/http/notifier.service';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { ItemLocationSetting, ItemLocationSettingInput, ItemsApi } from '../data-access/items.api';
import { minMaxMessage, minMaxValidator } from './item-validators';

export type SettingRow = FormGroup<{
  locationId: FormControl<string>;
  minQty: FormControl<number | null>;
  maxQty: FormControl<number | null>;
}>;

export function settingRow(setting: ItemLocationSetting): SettingRow {
  return new FormGroup(
    {
      locationId: new FormControl(setting.locationId, { nonNullable: true }),
      minQty: new FormControl<number | null>(setting.minQty),
      maxQty: new FormControl<number | null>(setting.maxQty),
    },
    { validators: minMaxValidator },
  );
}

/** Filas del formulario → request; vacío en ambos quita la configuración de esa ubicación. */
export function toSettingInputs(rows: SettingRow[]): ItemLocationSettingInput[] {
  return rows.map((row) => {
    const { locationId, minQty, maxQty } = row.getRawValue();
    return { locationId, minQty: minQty ?? null, maxQty: maxQty ?? null };
  });
}

/** Pestaña "Mín/Máx por ubicación" del artículo (spec frontend §7.2). */
@Component({
  selector: 'app-item-location-settings',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="hint">
      Se usan para las alertas de bajo mínimo y para el pedido sugerido de sucursal. Deja ambos
      vacíos para no controlar el artículo en esa ubicación. Cantidades en {{ baseUomCode() }}.
    </p>
    @if (settings().length) {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="rows" formArrayName="settings">
          @for (row of form.controls.settings.controls; track row; let i = $index) {
            <div class="row" [formGroupName]="i">
              <span class="location"
                >{{ settings()[i].locationCode }} · {{ settings()[i].locationName }}</span
              >
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Mínimo</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  min="0"
                  formControlName="minQty"
                />
                <span matTextSuffix>{{ baseUomCode() }}</span>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Máximo</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  min="0"
                  formControlName="maxQty"
                />
                <span matTextSuffix>{{ baseUomCode() }}</span>
              </mat-form-field>
              @if (row.invalid && (row.touched || row.dirty)) {
                <p class="sgo-field-error message" role="alert">{{ message(row) }}</p>
              }
            </div>
          }
        </div>
        <button mat-flat-button type="submit" [disabled]="saving() || form.pristine">
          Guardar mín/máx
        </button>
      </form>
    } @else {
      <p class="hint">Cargando ubicaciones…</p>
    }
  `,
  styles: `
    .hint {
      margin-top: 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .rows {
      display: flex;
      flex-direction: column;
      margin-bottom: var(--sgo-space-4);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--sgo-radius);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) 180px 180px;
      align-items: center;
      gap: var(--sgo-space-3);
      padding: var(--sgo-space-2) var(--sgo-space-3);

      & + .row {
        border-top: 1px solid var(--mat-sys-outline-variant);
      }

      @media (max-width: 767.98px) {
        grid-template-columns: 1fr 1fr;

        .location {
          grid-column: 1 / -1;
        }
      }
    }
    .message {
      grid-column: 1 / -1;
      margin: 0;
    }
  `,
})
export class ItemLocationSettings {
  private readonly api = inject(ItemsApi);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);

  readonly itemId = input.required<string>();
  readonly baseUomCode = input('');

  protected readonly settings = signal<ItemLocationSetting[]>([]);
  protected readonly saving = signal(false);
  /** Se llama `settings` como en el request: los errores `settings[i].minQty` caen en su fila. */
  protected readonly form = new FormGroup({ settings: new FormArray<SettingRow>([]) });

  constructor() {
    effect(() => this.load(this.itemId()));
  }

  protected message(row: SettingRow): string {
    const server = row.controls.minQty.getError('server') ?? row.controls.maxQty.getError('server');
    return minMaxMessage(row.errors) || server || '';
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.api
      .updateLocationSettings(this.itemId(), toSettingInputs(this.form.controls.settings.controls))
      .subscribe({
        next: (settings) => {
          this.saving.set(false);
          this.setSettings(settings);
          this.notifier.success('Mín/máx guardados.');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formErrors.handle(error, this.form);
        },
      });
  }

  private load(itemId: string): void {
    this.api.locationSettings(itemId).subscribe((settings) => this.setSettings(settings));
  }

  private setSettings(settings: ItemLocationSetting[]): void {
    const rows = this.form.controls.settings;
    rows.clear({ emitEvent: false });
    settings.forEach((setting) => rows.push(settingRow(setting), { emitEvent: false }));
    this.form.markAsPristine();
    this.settings.set(settings);
  }
}
