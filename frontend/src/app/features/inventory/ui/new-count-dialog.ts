import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { map } from 'rxjs';
import { LocationContextService } from '../../../core/context/location-context.service';
import { LocationPicker } from '../../../shared/components/location-picker/location-picker';
import { FormErrors } from '../../../shared/forms/form-errors.service';
import { CategoriesApi } from '../../catalog/data-access/categories.api';
import { PhysicalCountDto, PhysicalCountsApi } from '../data-access/physical-counts.api';

/** Nuevo conteo en borrador: ubicación y, para un conteo parcial, una categoría. */
@Component({
  selector: 'app-new-count-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    LocationPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Nuevo conteo físico</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <app-location-picker formControlName="locationId" label="Ubicación" />
        <mat-form-field appearance="outline">
          <mat-label>Categoría</mat-label>
          <mat-select formControlName="categoryId">
            <mat-option [value]="null">Todas (conteo completo)</mat-option>
            @for (category of categories.value() ?? []; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>Elige una categoría para contar solo esos artículos.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Notas</mat-label>
          <input matInput formControlName="notes" autocomplete="off" />
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Crear conteo</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-dialog-content {
      display: grid;
      gap: var(--sgo-space-2);
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class NewCountDialog {
  private readonly api = inject(PhysicalCountsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly dialogRef = inject<MatDialogRef<NewCountDialog, PhysicalCountDto>>(MatDialogRef);
  private readonly formErrors = inject(FormErrors);

  protected readonly saving = signal(false);

  protected readonly form = new FormGroup({
    locationId: new FormControl<string | null>(
      inject(LocationContextService).activeLocationId(),
      Validators.required,
    ),
    categoryId: new FormControl<string | null>(null),
    notes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(500) }),
  });

  protected readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .create({
        locationId: value.locationId!,
        categoryId: value.categoryId,
        notes: value.notes.trim() || null,
      })
      .subscribe({
        next: (count) => this.dialogRef.close(count),
        error: (error: unknown) => {
          this.saving.set(false);
          this.formErrors.handle(error, this.form);
        },
      });
  }
}
