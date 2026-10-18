import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../../../core/auth/auth.service';
import { Notifier } from '../../../core/http/notifier';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { RecordDialogService } from '../../../shared/components/record-dialog/record-dialog';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { CategoriesApi, Category } from '../data-access/catalog-api';

/** /catalogos/categorias (frontend §7.2): list with dialog. */
@Component({
  selector: 'app-categories-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
  ],
  template: `
    <app-page-header title="Categorías">
      @if (canManage) {
        <button matButton="filled" type="button" (click)="create()">
          <mat-icon>add</mat-icon>
          Nueva categoría
        </button>
      }
    </app-page-header>

    <div class="filters">
      <mat-slide-toggle
        [checked]="includeInactive()"
        (change)="includeInactive.set($event.checked)"
      >
        Mostrar inactivas
      </mat-slide-toggle>
    </div>

    <app-data-table
      label="Categorías"
      [rows]="rows()"
      [total]="total()"
      [query]="query()"
      [loading]="categories.isLoading()"
      emptyMessage="No hay categorías."
      (queryChange)="query.set($event)"
    >
      <ng-template appCell="name" header="Nombre" sortable [appCellOf]="rows()" let-category>
        {{ category.name }}
      </ng-template>
      <ng-template appCell="status" header="Estado" [appCellOf]="rows()" let-category>
        <app-status-tag
          [text]="category.isActive ? 'Activa' : 'Inactiva'"
          [color]="category.isActive ? 'green' : 'grey'"
        />
      </ng-template>
      @if (canManage) {
        <ng-template appCell="actions" header="" end [appCellOf]="rows()" let-category>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Editar ' + category.name"
            (click)="edit(category)"
          >
            <mat-icon>edit</mat-icon>
          </button>
        </ng-template>
      }
    </app-data-table>
  `,
  styleUrl: './catalog-list.scss',
})
export class CategoriesPage {
  private readonly api = inject(CategoriesApi);
  private readonly dialogs = inject(RecordDialogService);
  private readonly notifier = inject(Notifier);
  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly includeInactive = signal(false);
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'name' });
  protected readonly categories = rxResource({
    params: () => ({ query: this.query(), includeInactive: this.includeInactive() }),
    stream: ({ params }) =>
      this.api.list(params.query, { includeInactive: params.includeInactive }),
  });
  protected readonly rows = computed(() =>
    this.categories.hasValue() ? this.categories.value().items : [],
  );
  protected readonly total = computed(() =>
    this.categories.hasValue() ? this.categories.value().total : 0,
  );

  protected async create(): Promise<void> {
    const saved = await this.dialogs.open({
      title: 'Nueva categoría',
      fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 }],
      value: {},
      save: (value) => this.api.create({ name: value['name'] as string }),
    });
    if (saved) this.saved('Categoría creada.');
  }

  protected async edit(category: Category): Promise<void> {
    const saved = await this.dialogs.open({
      title: 'Editar categoría',
      fields: [
        { key: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
        { key: 'isActive', label: 'Activa', type: 'toggle' },
      ],
      value: { ...category },
      save: (value) =>
        this.api.update(category.id, {
          version: category.version,
          name: value['name'] as string,
          isActive: value['isActive'] as boolean,
        }),
    });
    if (saved) this.saved('Cambios guardados.');
  }

  private saved(message: string): void {
    this.notifier.info(message);
    this.categories.reload();
  }
}
