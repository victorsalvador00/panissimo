import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { ENUM_LABELS } from '../../../shared/pipes/status-label.pipe';
import { LocationDto, LocationsApi, LocationType } from '../data-access/locations.api';

/** Qué puede hacer cada tipo de ubicación (lo decide el backend según el tipo). */
export const LOCATION_TYPE_HINTS: Record<LocationType, string> = {
  Branch: 'Recibe traspasos, registra consumo y hace pedidos.',
  Factory: 'Produce y surte a sucursales.',
  Commissary: 'Produce, recibe compras y surte a sucursales.',
};

/** Alta (`data` null) o edición de una ubicación. Cierra con la ubicación guardada. */
@Component({
  selector: 'app-location-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ location ? 'Editar ubicación' : 'Nueva ubicación' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        <mat-form-field appearance="outline">
          <mat-label>Código</mat-label>
          <input matInput formControlName="code" autocomplete="off" required />
          @if (location) {
            <mat-hint>El código no se puede cambiar.</mat-hint>
          } @else {
            <mat-hint>Ej. SUC-11. Letras, números y guion.</mat-hint>
          }
          <mat-error>{{ error('code') }}</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" autocomplete="off" required />
          <mat-error>{{ error('name') }}</mat-error>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="type">
            @for (type of types; track type) {
              <mat-option [value]="type">{{ typeLabels[type] }}</mat-option>
            }
          </mat-select>
          <mat-hint>{{ hints[form.controls.type.value] }}</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Dirección</mat-label>
          <textarea matInput formControlName="address" rows="2"></textarea>
          <mat-error>{{ error('address') }}</mat-error>
        </mat-form-field>
        @if (location) {
          <mat-slide-toggle formControlName="isActive">Activa</mat-slide-toggle>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: var(--sgo-space-1);
    }
  `,
})
export class LocationDialog {
  protected readonly location = inject<LocationDto | null>(MAT_DIALOG_DATA);
  private readonly api = inject(LocationsApi);
  private readonly dialogRef = inject(MatDialogRef<LocationDialog, LocationDto>);
  private readonly formErrors = inject(FormErrors);

  protected readonly types: LocationType[] = ['Branch', 'Commissary', 'Factory'];
  protected readonly typeLabels = ENUM_LABELS.LocationType;
  protected readonly hints = LOCATION_TYPE_HINTS;
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: [
      this.location?.code ?? '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9-]+$/)],
    ],
    name: [this.location?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    type: [(this.location?.type ?? 'Branch') as LocationType],
    address: [this.location?.address ?? '', Validators.maxLength(500)],
    isActive: [this.location?.isActive ?? true],
  });

  constructor() {
    if (this.location) {
      this.form.controls.code.disable();
      this.form.controls.type.disable();
    }
  }

  protected error(field: 'code' | 'name' | 'address'): string {
    const control = this.form.controls[field];
    if (control.hasError('required')) {
      return 'Campo obligatorio.';
    }
    if (control.hasError('pattern')) {
      return 'Solo letras, números y guion, sin espacios.';
    }
    if (control.hasError('maxlength')) {
      return `Máximo ${control.getError('maxlength').requiredLength} caracteres.`;
    }
    return control.getError('server') ?? '';
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const address = value.address.trim() || null;
    const request$ = this.location
      ? this.api.update(this.location.id, {
          name: value.name.trim(),
          address,
          isActive: value.isActive,
          version: this.location.version,
        })
      : this.api.create({
          code: value.code.trim().toUpperCase(),
          name: value.name.trim(),
          type: value.type,
          address,
        });

    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => this.dialogRef.close() });
      },
    });
  }
}
