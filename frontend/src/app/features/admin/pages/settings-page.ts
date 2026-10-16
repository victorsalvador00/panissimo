import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Notifier } from '../../../core/http/notifier.service';
import { toProblem } from '../../../core/http/problem-details';
import { ConflictHandler } from '../../../shared/components/dialogs.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { AppSetting, SettingsApi } from '../data-access/settings.api';

/** No más de `decimals` decimales (0 = entero). */
export function maxDecimals(decimals: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as number | null;
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    const actual = (String(value).split('.')[1] ?? '').length;
    return actual > decimals ? { maxDecimals: { decimals } } : null;
  };
}

/** Control con las reglas que el backend declara para cada ajuste (mín, máx, decimales). */
export function settingControl(setting: AppSetting): FormControl<number | null> {
  return new FormControl<number | null>(setting.value, [
    Validators.required,
    Validators.min(setting.min),
    Validators.max(setting.max),
    maxDecimals(setting.decimals),
  ]);
}

export function settingError(control: AbstractControl, setting: AppSetting): string {
  if (control.hasError('required')) {
    return 'Escribe un valor.';
  }
  if (control.hasError('min') || control.hasError('max')) {
    return `Debe estar entre ${setting.min} y ${setting.max}.`;
  }
  if (control.hasError('maxDecimals')) {
    return setting.decimals === 0
      ? 'Debe ser un número entero.'
      : `Máximo ${setting.decimals} decimales.`;
  }
  return typeof control.getError('server') === 'string'
    ? control.getError('server')
    : 'Valor no válido.';
}

/** Parámetros del sistema (spec frontend §7.7): umbral de OC, tolerancia de recepción, alerta de caducidad. */
@Component({
  selector: 'app-settings-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Configuración" subtitle="Parámetros generales del sistema." />

      @if (settings().length) {
        <form [formGroup]="form" (ngSubmit)="save()" novalidate class="sgo-stack">
          @for (setting of settings(); track setting.key) {
            <mat-card appearance="outlined">
              <mat-card-content>
                <h2>{{ setting.label }}</h2>
                <p class="description">{{ setting.description }}</p>
                <mat-form-field appearance="outline">
                  <mat-label>{{ setting.label }}</mat-label>
                  <input
                    matInput
                    type="number"
                    inputmode="decimal"
                    [formControl]="form.controls[setting.key]"
                    [min]="setting.min"
                    [max]="setting.max"
                    [step]="setting.decimals === 0 ? 1 : 0.01"
                  />
                  <mat-hint>Entre {{ setting.min }} y {{ setting.max }}.</mat-hint>
                  <mat-error>{{ errorFor(setting) }}</mat-error>
                </mat-form-field>
                @if (setting.updatedAt) {
                  <p class="meta">
                    Última modificación: {{ setting.updatedAt | date: 'dd/MM/yyyy HH:mm'
                    }}{{ setting.updatedByName ? ' por ' + setting.updatedByName : '' }}
                  </p>
                }
              </mat-card-content>
            </mat-card>
          }
          <div class="sgo-row">
            <button mat-flat-button type="submit" [disabled]="saving() || form.pristine">
              Guardar cambios
            </button>
          </div>
        </form>
      } @else {
        <p class="description">Cargando configuración…</p>
      }
    </section>
  `,
  styles: `
    h2 {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }
    .description,
    .meta {
      margin: var(--sgo-space-1) 0 var(--sgo-space-3);
      color: var(--mat-sys-on-surface-variant);
    }
    .meta {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    mat-form-field {
      width: min(280px, 100%);
    }
  `,
})
export class SettingsPage {
  private readonly api = inject(SettingsApi);
  private readonly notifier = inject(Notifier);
  private readonly conflicts = inject(ConflictHandler);

  protected readonly settings = signal<AppSetting[]>([]);
  protected readonly saving = signal(false);
  protected form = new FormGroup<Record<string, FormControl<number | null>>>({});

  constructor() {
    this.load();
  }

  protected errorFor(setting: AppSetting): string {
    return settingError(this.form.controls[setting.key], setting);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const changed = this.settings()
      .filter((setting) => this.form.controls[setting.key].dirty)
      .map((setting) => ({
        key: setting.key,
        value: this.form.controls[setting.key].value ?? 0,
        version: setting.version,
      }));

    this.api.update(changed).subscribe({
      next: (settings) => {
        this.saving.set(false);
        this.setSettings(settings);
        this.notifier.success('Configuración guardada.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (this.conflicts.handle(error, { reload: () => this.load() })) {
          return;
        }
        const problem = toProblem(error);
        if (problem?.status === 400 && problem.detail) {
          this.notifier.error(problem.detail);
        }
      },
    });
  }

  private load(): void {
    this.api.list().subscribe((settings) => this.setSettings(settings));
  }

  private setSettings(settings: AppSetting[]): void {
    this.form = new FormGroup(
      Object.fromEntries(settings.map((setting) => [setting.key, settingControl(setting)])),
    );
    this.settings.set(settings);
  }
}
