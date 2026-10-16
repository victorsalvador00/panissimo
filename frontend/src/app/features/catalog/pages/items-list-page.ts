import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { defaultListQuery, ListQuery } from '../../../core/http/list-query';
import {
  CardDef,
  CellDef,
  DataTable,
  TableColumn,
} from '../../../shared/components/data-table/data-table';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ENUM_LABELS, enumLabel } from '../../../shared/pipes/status-label.pipe';
import { CategoriesApi } from '../data-access/categories.api';
import { ItemFilters, ItemListItem, ItemsApi, ItemType } from '../data-access/items.api';

@Component({
  selector: 'app-items-list-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    CardDef,
    StatusTag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sgo-page">
      <app-page-header
        title="Artículos"
        subtitle="Materia prima, intermedios y producto terminado."
      >
        @if (canManage) {
          <a mat-stroked-button routerLink="importar">
            <mat-icon>upload_file</mat-icon>
            Importar CSV
          </a>
          <a mat-flat-button routerLink="nuevo">
            <mat-icon>add</mat-icon>
            Nuevo artículo
          </a>
        }
      </app-page-header>

      <div class="sgo-row filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-select [value]="filters().type ?? null" (valueChange)="setFilter('type', $event)">
            <mat-option [value]="null">Todos</mat-option>
            @for (type of types; track type) {
              <mat-option [value]="type">{{ typeLabels[type] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Categoría</mat-label>
          <mat-select
            [value]="filters().categoryId ?? null"
            (valueChange)="setFilter('categoryId', $event)"
          >
            <mat-option [value]="null">Todas</mat-option>
            @for (category of categories.value() ?? []; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-slide-toggle
          [checked]="!!filters().includeInactive"
          (change)="setFilter('includeInactive', $event.checked || null)"
        >
          Mostrar inactivos
        </mat-slide-toggle>
      </div>

      <app-data-table
        [columns]="columns"
        [rows]="items.value()?.items ?? []"
        [total]="items.value()?.total ?? 0"
        [loading]="items.isLoading()"
        [query]="query()"
        [searchable]="true"
        searchPlaceholder="Buscar por SKU o nombre"
        emptyMessage="No hay artículos con esos filtros."
        [emptyActionLabel]="canManage ? 'Nuevo artículo' : undefined"
        (emptyAction)="create()"
        [rowClickable]="canManage"
        (rowClick)="open($event)"
        (queryChange)="query.set($event)"
      >
        <ng-template appCell="isActive" let-row>
          <app-status-tag
            [label]="row.isActive ? 'Activo' : 'Inactivo'"
            [color]="row.isActive ? 'green' : 'gray'"
          />
        </ng-template>
        <ng-template appCardDef let-row>
          <strong>{{ row.sku }} · {{ row.name }}</strong>
          <div class="muted">
            {{ typeLabel(row) }} · {{ row.categoryName }} · {{ row.baseUomCode }}
            @if (row.tracksLots) {
              · Con lotes
            }
          </div>
        </ng-template>
      </app-data-table>
    </section>
  `,
  styles: `
    .filters {
      margin-bottom: var(--sgo-space-4);
    }
    .filters mat-form-field {
      width: 220px;
    }
    .muted {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ItemsListPage {
  private readonly api = inject(ItemsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  private readonly router = inject(Router);

  /** El detalle exige `catalog.manage` (spec §7.2): sin él, la lista es solo de consulta. */
  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly types: ItemType[] = ['RawMaterial', 'Intermediate', 'FinishedGood'];
  protected readonly typeLabels = ENUM_LABELS.ItemType;

  protected readonly columns: TableColumn<ItemListItem>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Nombre', sortable: true },
    { key: 'type', header: 'Tipo', sortable: true, value: (row) => this.typeLabel(row) },
    { key: 'categoryName', header: 'Categoría' },
    { key: 'baseUomCode', header: 'Unidad' },
    { key: 'tracksLots', header: 'Lotes', value: (row) => (row.tracksLots ? 'Sí' : 'No') },
    { key: 'isActive', header: 'Estado' },
  ];

  protected readonly query = signal<ListQuery>(defaultListQuery('name:asc'));
  protected readonly filters = signal<ItemFilters>({});

  protected readonly items = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });

  protected readonly categories = rxResource({
    stream: () =>
      this.categoriesApi.list({ page: 1, pageSize: 100 }).pipe(map((page) => page.items)),
  });

  protected typeLabel(item: ItemListItem): string {
    return enumLabel('ItemType', item.type);
  }

  protected setFilter<K extends keyof ItemFilters>(key: K, value: ItemFilters[K]): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.query.update((query) => ({ ...query, page: 1 }));
  }

  protected create(): void {
    void this.router.navigate(['/catalogos/articulos/nuevo']);
  }

  protected open(item: ItemListItem): void {
    void this.router.navigate(['/catalogos/articulos', item.id]);
  }
}
