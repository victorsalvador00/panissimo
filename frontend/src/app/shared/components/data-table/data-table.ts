import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  TemplateRef,
  booleanAttribute,
  computed,
  contentChild,
  contentChildren,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { map } from 'rxjs';
import { ListQuery } from '../../data-access/list-query';

/** Context of the cell, card and detail templates: the row. */
export interface RowContext<T = unknown> {
  $implicit: T;
}

/**
 * A column: `<ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows" let-row>{{ row.folio }}`.
 * `appCellOf` (the same rows given to the table) only types `row` in the template.
 */
@Directive({ selector: 'ng-template[appCell]' })
export class CellDef<T = unknown> {
  readonly name = input.required<string>({ alias: 'appCell' });
  readonly appCellOf = input<readonly T[] | null>(null);
  readonly header = input('');
  readonly sortable = input(false, { transform: booleanAttribute });
  /** Numbers and amounts go to the right. */
  readonly end = input(false, { transform: booleanAttribute });
  readonly template = inject<TemplateRef<RowContext>>(TemplateRef);

  static ngTemplateContextGuard<T>(_dir: CellDef<T>, _ctx: unknown): _ctx is RowContext<T> {
    return true;
  }
}

/** Own card for phones: `<ng-template appCardDef [appCardDefOf]="rows" let-row>`; without it, every column. */
@Directive({ selector: 'ng-template[appCardDef]' })
export class CardDef<T = unknown> {
  readonly appCardDefOf = input<readonly T[] | null>(null);
  readonly template = inject<TemplateRef<RowContext>>(TemplateRef);

  static ngTemplateContextGuard<T>(_dir: CardDef<T>, _ctx: unknown): _ctx is RowContext<T> {
    return true;
  }
}

/** Expandable detail: `<ng-template appRowDetail [appRowDetailOf]="rows" let-row>` (lots of a stock, lines). */
@Directive({ selector: 'ng-template[appRowDetail]' })
export class RowDetail<T = unknown> {
  readonly appRowDetailOf = input<readonly T[] | null>(null);
  readonly template = inject<TemplateRef<RowContext>>(TemplateRef);

  static ngTemplateContextGuard<T>(_dir: RowDetail<T>, _ctx: unknown): _ctx is RowContext<T> {
    return true;
  }
}

/**
 * List table (frontend §8): `mat-table` with columns from `appCell` templates, server sort and paging through
 * `query`/`queryChange` (`page/pageSize/sort/q`), selection kept across pages, expandable rows, skeleton while
 * loading, empty state (`[empty]` content) and one card per row on phones.
 */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './data-table.html',
  styleUrl: './data-table.scss',
})
export class DataTable<T> {
  readonly rows = input.required<readonly T[]>();
  /** Total rows on the server (for the paginator); without it, the rows given. */
  readonly total = input<number | null>(null);
  /** Server query; without it there is no paginator and sorting is off. */
  readonly query = input<ListQuery | null>(null);
  readonly loading = input(false, { transform: booleanAttribute });
  readonly selectable = input(false, { transform: booleanAttribute });
  /** Key of a row (selection and expansion); `id` by default. */
  readonly rowKey = input<(row: T) => unknown>((row) => (row as { id?: unknown }).id);
  readonly emptyMessage = input('No hay registros.');
  /** Accessible name of the table. */
  readonly label = input.required<string>();
  readonly pageSizeOptions = input<number[]>([10, 25, 50, 100]);
  readonly selection = model<readonly T[]>([]);
  readonly queryChange = output<ListQuery>();

  protected readonly cells = contentChildren(CellDef);
  protected readonly card = contentChild(CardDef);
  protected readonly detail = contentChild(RowDetail);
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 767.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly expanded = signal<ReadonlySet<unknown>>(new Set());
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly columns = computed(() => [
    ...(this.selectable() ? ['__select'] : []),
    ...this.cells().map((cell) => cell.name()),
    ...(this.detail() ? ['__expand'] : []),
  ]);

  protected readonly length = computed(() => this.total() ?? this.rows().length);
  protected readonly showEmpty = computed(() => !this.loading() && this.rows().length === 0);
  protected readonly showSkeleton = computed(() => this.loading() && this.rows().length === 0);

  protected readonly sortActive = computed(() => this.query()?.sort?.split(':')[0] ?? '');
  protected readonly sortDirection = computed<SortDirection>(() => {
    const sort = this.query()?.sort;
    if (!sort) return '';
    return sort.endsWith(':desc') ? 'desc' : 'asc';
  });

  private readonly selectedKeys = computed(
    () => new Set(this.selection().map((row) => this.rowKey()(row))),
  );
  protected readonly pageSelected = computed(() => {
    const rows = this.rows();
    const selected = rows.filter((row) => this.selectedKeys().has(this.rowKey()(row))).length;
    return {
      all: rows.length > 0 && selected === rows.length,
      some: selected > 0 && selected < rows.length,
    };
  });

  protected readonly trackRow = (_index: number, row: T) => this.rowKey()(row);
  /**
   * Every row has its detail row when there is a detail template (mat-table evaluates `when` only when the data
   * changes); a collapsed one is hidden and renders nothing.
   */
  protected readonly hasDetail = () => !!this.detail();

  protected isSelected(row: T): boolean {
    return this.selectedKeys().has(this.rowKey()(row));
  }

  protected toggle(row: T): void {
    const key = this.rowKey()(row);
    this.selection.set(
      this.isSelected(row)
        ? this.selection().filter((r) => this.rowKey()(r) !== key)
        : [...this.selection(), row],
    );
  }

  /** Selects or clears the rows of this page; other pages keep their selection. */
  protected togglePage(): void {
    const pageKeys = new Set(this.rows().map((row) => this.rowKey()(row)));
    const others = this.selection().filter((row) => !pageKeys.has(this.rowKey()(row)));
    this.selection.set(this.pageSelected().all ? others : [...others, ...this.rows()]);
  }

  protected isExpanded(row: T): boolean {
    return this.expanded().has(this.rowKey()(row));
  }

  protected toggleExpanded(row: T): void {
    const key = this.rowKey()(row);
    const next = new Set(this.expanded());
    if (!next.delete(key)) next.add(key);
    this.expanded.set(next);
  }

  protected onSort(sort: Sort): void {
    const query = this.query();
    if (!query) return;
    this.queryChange.emit({
      ...query,
      page: 1,
      sort: sort.direction
        ? `${sort.active}${sort.direction === 'desc' ? ':desc' : ''}`
        : undefined,
    });
  }

  protected onPage(event: PageEvent): void {
    const query = this.query();
    if (!query) return;
    this.queryChange.emit({ ...query, page: event.pageIndex + 1, pageSize: event.pageSize });
  }
}
