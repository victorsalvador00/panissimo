import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import { Notifier } from '../../../core/http/notifier.service';
import { CellDef, DataTable, TableColumn } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { CategoriesApi, CategoryDto } from '../data-access/categories.api';
import { CategoryDialog } from '../ui/category-dialog';

@Component({
  selector: 'app-categories-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header title="Categorías" subtitle="Agrupan los artículos (ej. Secos, Lácteos).">
        @if (canManage) {
          <button mat-flat-button type="button" (click)="edit(null)">
            <mat-icon>add</mat-icon>
            Nueva categoría
          </button>
        }
      </app-page-header>

      <mat-slide-toggle
        class="toggle"
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked); query.set({ ...query(), page: 1 })"
      >
        Mostrar inactivas
      </mat-slide-toggle>

      <app-data-table
        [columns]="columns"
        [rows]="categories.value()?.items ?? []"
        [total]="categories.value()?.total ?? 0"
        [loading]="categories.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar categoría"
        emptyMessage="No hay categorías."
        [emptyActionLabel]="canManage ? 'Nueva categoría' : undefined"
        (emptyAction)="edit(null)"
        [rowClickable]="canManage"
        (rowClick)="edit($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="isActive" let-row>
          <app-status-tag
            [label]="row.isActive ? 'Activa' : 'Inactiva'"
            [color]="row.isActive ? 'green' : 'gray'"
          />
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .toggle {
      display: block;
      margin-bottom: var(--sgo-space-3);
    }
  `,
})
export class CategoriesPage {
  private readonly api = inject(CategoriesApi);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);

  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly columns: TableColumn<CategoryDto>[] = [
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('name:asc'));
  protected readonly includeInactive = signal(false);

  protected readonly categories = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) => this.api.list(params.query, params.includeInactive),
  });

  protected edit(category: CategoryDto | null): void {
    this.dialog
      .open<CategoryDialog, CategoryDto | null, CategoryDto>(CategoryDialog, {
        data: category,
        maxWidth: 'calc(100vw - 32px)',
      })
      .afterClosed()
      .pipe(filter((saved): saved is CategoryDto => !!saved))
      .subscribe(() => {
        this.notifier.success(category ? 'Categoría guardada.' : 'Categoría creada.');
        this.categories.reload();
      });
  }
}
