import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { debounceTime, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CellDef, DataTable } from '../../../shared/components/data-table/data-table';
import { ItemPhoto } from '../../../shared/components/item-photo/item-photo';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusTag } from '../../../shared/components/status-tag/status-tag';
import { ListQuery } from '../../../shared/data-access/list-query';
import { StatusLabelPipe } from '../../../shared/pipes/pipes';
import { CategoriesApi, ItemFilters, ItemsApi } from '../data-access/catalog-api';
import { ITEM_TYPE_OPTIONS, PRESENTATION_OPTIONS } from '../ui/item-options';

/**
 * /catalogos/articulos (frontend §7.2): search by SKU, internal SKU or name, and filters by type, presentation,
 * category and active. The photo column arrives with app-item-photo (F-23).
 */
@Component({
  selector: 'app-items-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ItemPhoto,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    PageHeader,
    DataTable,
    CellDef,
    StatusTag,
    StatusLabelPipe,
  ],
  templateUrl: './items-list-page.html',
  styleUrl: './catalog-list.scss',
})
export class ItemsListPage {
  private readonly api = inject(ItemsApi);
  private readonly categoriesApi = inject(CategoriesApi);
  protected readonly canManage = inject(AuthService).can('catalog.manage');

  protected readonly typeOptions = ITEM_TYPE_OPTIONS;
  protected readonly presentationOptions = PRESENTATION_OPTIONS;
  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly filters = signal<ItemFilters>({});
  protected readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'name' });

  protected readonly items = rxResource({
    params: () => ({ query: this.query(), filters: this.filters() }),
    stream: ({ params }) => this.api.list(params.query, params.filters),
  });
  protected readonly rows = computed(() => (this.items.hasValue() ? this.items.value().items : []));
  protected readonly total = computed(() => (this.items.hasValue() ? this.items.value().total : 0));

  protected readonly categories = rxResource({
    stream: () => this.categoriesApi.list().pipe(map((page) => page.items)),
    defaultValue: [],
  });

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((q) => this.query.update((x) => ({ ...x, page: 1, q: q.trim() || undefined })));
  }

  protected setFilter(key: keyof ItemFilters, value: string | boolean | null): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
    this.query.update((x) => ({ ...x, page: 1 }));
  }
}
