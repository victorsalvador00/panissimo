import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { Notifier } from '../../../core/http/notifier';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { QtyInput } from '../../../shared/components/qty-input/qty-input';
import { Stamp } from '../../../shared/components/stamp/stamp';
import { QtyPipe } from '../../../shared/pipes/pipes';
import { FormErrors } from '../../../shared/forms/form-errors';
import { Setting, SettingsApi } from '../data-access/admin-api';

/** /admin/configuracion (frontend §7.8): the form is built from `/settings` (label, limits and decimals). */
@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, PageHeader, QtyInput, Stamp, QtyPipe],
  template: `
    <app-page-header title="Configuración" />

    <form class="pan-card pan-has-action-bar" [formGroup]="form" (ngSubmit)="save()" novalidate>
      @if (loaded.isLoading() && settings().length === 0) {
        <p role="status">Cargando…</p>
      }
      @for (setting of settings(); track setting.key; let i = $index) {
        <div class="setting">
          <app-qty-input
            [formControl]="values.at(i)"
            [label]="setting.label"
            [decimals]="setting.decimals"
            [max]="setting.max"
            allowZero
          />
          <p class="hint">
            Entre {{ setting.min | qty }} y {{ setting.max | qty }}.
            @if (setting.updatedAt) {
              Último cambio: <app-stamp [at]="setting.updatedAt" [by]="setting.updatedByName" />
            }
          </p>
        </div>
      }
      <div class="pan-action-bar">
        <button matButton type="button" [disabled]="saving()" (click)="discard()">Descartar</button>
        <button matButton="filled" type="submit" [disabled]="saving()">Guardar</button>
      </div>
    </form>
  `,
  styles: `
    .setting {
      max-width: 520px;
      margin-bottom: 12px;
    }

    .hint {
      margin: 4px 16px 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class SettingsPage {
  private readonly api = inject(SettingsApi);
  private readonly notifier = inject(Notifier);
  private readonly formErrors = inject(FormErrors);

  protected readonly loaded = rxResource({ stream: () => this.api.list() });
  protected readonly settings = signal<Setting[]>([]);
  protected readonly values = new FormArray<FormControl<number | null>>([]);
  /** The form directive handles the submit (a bare <form> would reload the page). */
  protected readonly form = new FormGroup({ values: this.values });
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      if (this.loaded.hasValue()) this.show(this.loaded.value());
    });
  }

  protected discard(): void {
    this.show(this.settings());
  }

  protected async save(): Promise<void> {
    if (this.values.invalid) {
      this.values.markAllAsTouched();
      return;
    }
    const changed = this.settings()
      .map((setting, i) => ({ setting, value: this.values.at(i).value }))
      .filter(({ setting, value }) => value !== setting.value);
    if (changed.length === 0) {
      this.notifier.info('No hay cambios por guardar.');
      return;
    }
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.update(
          changed.map(({ setting, value }) => ({
            key: setting.key,
            value: value ?? 0,
            version: setting.version,
          })),
        ),
      );
      this.show(saved);
      this.notifier.info('Configuración guardada.');
    } catch (error) {
      // A 409 (someone else changed a value) opens its dialog from the error interceptor.
      this.formErrors.apply(this.values, error);
    } finally {
      this.saving.set(false);
    }
  }

  private show(settings: Setting[]): void {
    this.settings.set(settings);
    this.values.clear({ emitEvent: false });
    for (const setting of settings) {
      this.values.push(
        new FormControl<number | null>(setting.value, [
          Validators.required,
          Validators.min(setting.min),
          Validators.max(setting.max),
        ]),
        { emitEvent: false },
      );
    }
  }
}
