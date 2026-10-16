import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { CategoriesApi, CategoryDto } from '../data-access/categories.api';

/** Alta (`data` null) o edición de una categoría. Cierra con la categoría guardada. */
@Component({
  selector: 'app-category-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ category ? 'Editar categoría' : 'Nueva categoría' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content class="fields">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" autocomplete="off" required />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Escribe el nombre.</mat-error>
          } @else if (form.controls.name.hasError('maxlength')) {
            <mat-error>Máximo 100 caracteres.</mat-error>
          } @else {
            <mat-error>{{ form.controls.name.getError('server') }}</mat-error>
          }
        </mat-form-field>
        @if (category) {
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
export class CategoryDialog {
  protected readonly category = inject<CategoryDto | null>(MAT_DIALOG_DATA);
  private readonly api = inject(CategoriesApi);
  private readonly dialogRef = inject(MatDialogRef<CategoryDialog, CategoryDto>);
  private readonly formErrors = inject(FormErrors);
  protected readonly saving = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [this.category?.name ?? '', [Validators.required, Validators.maxLength(100)]],
    isActive: [this.category?.isActive ?? true],
  });

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const { name, isActive } = this.form.getRawValue();
    const request$ = this.category
      ? this.api.update(this.category.id, {
          name: name.trim(),
          isActive,
          version: this.category.version,
        })
      : this.api.create({ name: name.trim() });

    request$.subscribe({
      next: (saved) => this.dialogRef.close(saved),
      error: (error: unknown) => {
        this.saving.set(false);
        this.formErrors.handle(error, this.form, { reload: () => this.dialogRef.close() });
      },
    });
  }
}
