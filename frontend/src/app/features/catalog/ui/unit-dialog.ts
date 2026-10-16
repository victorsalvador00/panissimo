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
import { UnitDto, UnitsApi, UomKind } from '../data-access/units.api';

/** Alta (`data` null) o edición de una unidad de medida. Cierra con la unidad guardada. */
@Component({
  selector: 'app-unit-dialog',
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
    <h2 mat-dialog-title>{{ unit ? 'Editar unidad' : 'Nueva unidad' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        <mat-form-field appearance="outline">
          <mat-label>Código</mat-label>
          <input matInput formControlName="code" autocomplete="off" required />
          <mat-hint>{{ unit ? 'El código no se puede cambiar.' : 'Ej. kg, l, pz.' }}</mat-hint>
          @if (form.controls.code.hasError('required')) {
            <mat-error>Escribe el código.</mat-error>
          } @else if (form.controls.code.hasError('pattern')) {
            <mat-error>Solo letras, números, punto, guion y guion bajo.</mat-error>
          } @else {
            <mat-error>{{ form.controls.code.getError('server') }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" autocomplete="off" required />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Escribe el nombre.</mat-error>
          } @else {
            <mat-error>{{ form.controls.name.getError('server') }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="kind">
            @for (kind of kinds; track kind) {
              <mat-option [value]="kind">{{ kindLabels[kind] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (unit) {
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
      min-width: min(360px, 80vw);
    }
  `,
})
export class UnitDialog {
  protected readonly unit = inject<UnitDto | null>(MAT_DIALOG_DATA);
  private readonly api = inject(UnitsApi);
  private readonly dialogRef = inject(MatDialogRef<UnitDialog, UnitDto>);
  private readonly formErrors = inject(FormErrors);
  protected readonly saving = signal(false);

  protected readonly kinds: UomKind[] = ['Mass', 'Volume', 'Unit'];
  protected readonly kindLabels = ENUM_LABELS.UomKind;

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: [
      this.unit?.code ?? '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9._-]+$/)],
    ],
    name: [this.unit?.name ?? '', [Validators.required, Validators.maxLength(100)]],
    kind: [(this.unit?.kind ?? 'Mass') as UomKind],
    isActive: [this.unit?.isActive ?? true],
  });

  constructor() {
    if (this.unit) {
      this.form.controls.code.disable();
    }
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { code, name, kind, isActive } = this.form.getRawValue();
    const request$ = this.unit
      ? this.api.update(this.unit.id, {
          name: name.trim(),
          kind,
          isActive,
          version: this.unit.version,
        })
      : this.api.create({ code: code.trim(), name: name.trim(), kind });

    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => this.dialogRef.close() });
      },
    });
  }
}
