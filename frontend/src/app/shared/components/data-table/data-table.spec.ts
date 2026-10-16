import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ListQuery } from '../../../core/http/list-query';
import { toHttpParams } from '../../../core/http/list-query';
import { CellDef, DataTable, RowDetailDef, TableColumn } from './data-table';

interface Row {
  id: number;
  folio: string;
  total: number;
}

@Component({
  imports: [DataTable, CellDef],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-data-table
      [columns]="columns"
      [rows]="rows()"
      [total]="total()"
      [loading]="loading()"
      [query]="query()"
      [searchable]="true"
      emptyMessage="No hay órdenes."
      (queryChange)="changes.push($event); query.set($event)"
    >
      <ng-template appCell="total" let-row>$ {{ row.total }}</ng-template>
    </app-data-table>
  `,
})
class Host {
  readonly columns: TableColumn<Row>[] = [
    { key: 'folio', header: 'Folio', sortable: true },
    { key: 'total', header: 'Total', align: 'end' },
  ];
  readonly rows = signal<Row[]>([
    { id: 1, folio: 'OC-1', total: 10 },
    { id: 2, folio: 'OC-2', total: 20 },
  ]);
  readonly total = signal(60);
  readonly loading = signal(false);
  readonly query = signal<ListQuery>({ page: 1, pageSize: 25, sort: 'folio:asc' });
  readonly changes: ListQuery[] = [];
}

describe('app-data-table', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra filas, celdas con plantilla y encabezados', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('tr.mat-mdc-row:not(.detail-row)')).toHaveLength(2);
    expect(el.querySelector('tr.mat-mdc-row td:last-child')?.textContent?.trim()).toBe('$ 10');
    expect(el.querySelector('th')?.textContent).toContain('Folio');
  });

  it('cambiar de página emite page/pageSize', async () => {
    const { el, host } = await render();
    el.querySelector<HTMLButtonElement>('button.mat-mdc-paginator-navigation-next')!.click();
    expect(host.changes.at(-1)).toEqual({ page: 2, pageSize: 25, sort: 'folio:asc' });
  });

  it('ordenar emite sort=campo:dirección y vuelve a la página 1', async () => {
    const { el, host, fixture } = await render();
    host.query.set({ page: 3, pageSize: 25, sort: 'folio:asc' });
    await fixture.whenStable();

    el.querySelector<HTMLElement>('th.mat-sort-header')!.click();
    expect(host.changes.at(-1)).toEqual({ page: 1, pageSize: 25, sort: 'folio:desc' });
  });

  it('buscar emite q con retraso y vuelve a la página 1', async () => {
    const { el, host } = await render();
    vi.useFakeTimers();
    try {
      const input = el.querySelector<HTMLInputElement>('input[type=search]')!;
      input.value = ' oc-7 ';
      input.dispatchEvent(new Event('input'));
      expect(host.changes).toHaveLength(0);

      vi.advanceTimersByTime(300);
      expect(host.changes.at(-1)).toEqual({ page: 1, pageSize: 25, sort: 'folio:asc', q: 'oc-7' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin filas muestra el estado vacío; cargando muestra el esqueleto', async () => {
    const { fixture, host, el } = await render();
    host.rows.set([]);
    host.total.set(0);
    await fixture.whenStable();
    expect(el.querySelector('.empty')?.textContent).toContain('No hay órdenes.');

    host.loading.set(true);
    await fixture.whenStable();
    expect(el.querySelector('.empty')).toBeNull();
    expect(el.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });
});

@Component({
  imports: [DataTable, RowDetailDef],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-data-table [columns]="columns" [rows]="rows" [total]="2" [query]="query">
      <ng-template appRowDetail let-row
        ><p class="detail">Lotes de {{ row.folio }}</p></ng-template
      >
    </app-data-table>
  `,
})
class ExpandHost {
  readonly columns: TableColumn<Row>[] = [{ key: 'folio', header: 'Folio' }];
  readonly rows: Row[] = [
    { id: 1, folio: 'A', total: 1 },
    { id: 2, folio: 'B', total: 2 },
  ];
  readonly query: ListQuery = { page: 1, pageSize: 25 };
}

describe('app-data-table con detalle expandible', () => {
  it('expande y contrae una fila con el botón o al tocarla', async () => {
    const fixture = TestBed.createComponent(ExpandHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = () => el.querySelectorAll<HTMLButtonElement>('td.expand-cell button');

    expect(el.querySelector('.detail')).toBeNull();
    expect(buttons()[0].getAttribute('aria-expanded')).toBe('false');

    buttons()[0].click();
    await fixture.whenStable();
    expect(el.querySelector('.detail')?.textContent).toContain('Lotes de A');
    expect(buttons()[0].getAttribute('aria-expanded')).toBe('true');

    el.querySelectorAll<HTMLElement>('tr.mat-mdc-row:not(.detail-row)')[1].click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.detail')).toHaveLength(2);

    buttons()[0].click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.detail')).toHaveLength(1);
  });
});

@Component({
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-data-table
      [columns]="columns"
      [rows]="rows"
      [query]="query"
      [selectable]="approved"
      [selectionLabel]="label"
      [(selection)]="selection"
    />
  `,
})
class SelectHost {
  readonly columns: TableColumn<Row>[] = [{ key: 'folio', header: 'Folio' }];
  readonly rows: Row[] = [
    { id: 1, folio: 'A', total: 1 },
    { id: 2, folio: 'B', total: 0 },
    { id: 3, folio: 'C', total: 3 },
  ];
  readonly query: ListQuery = { page: 1, pageSize: 25 };
  readonly selection = signal<Row[]>([{ id: 9, folio: 'Otra página', total: 1 }]);
  readonly approved = (row: Row) => row.total > 0;
  readonly label = (row: Row) => `Seleccionar ${row.folio}`;
}

describe('app-data-table con selección', () => {
  it('solo las filas elegibles tienen casilla; la del encabezado elige o quita las de la página', async () => {
    const fixture = TestBed.createComponent(SelectHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const host = fixture.componentInstance;
    const rowBoxes = () => el.querySelectorAll<HTMLInputElement>('td.select-cell input');
    const header = el.querySelector<HTMLInputElement>('th.select-cell input')!;

    expect(rowBoxes()).toHaveLength(2);
    expect(rowBoxes()[0].getAttribute('aria-label')).toBe('Seleccionar A');

    rowBoxes()[1].click();
    await fixture.whenStable();
    expect(host.selection().map((r) => r.folio)).toEqual(['Otra página', 'C']);
    expect(header.indeterminate).toBe(true);

    header.click();
    await fixture.whenStable();
    expect(host.selection().map((r) => r.folio)).toEqual(['Otra página', 'A', 'C']);

    header.click();
    await fixture.whenStable();
    expect(host.selection().map((r) => r.folio)).toEqual(['Otra página']);
  });
});

describe('toHttpParams', () => {
  it('omite vacíos y agrega filtros', () => {
    const params = toHttpParams(
      { page: 2, pageSize: 25, sort: 'folio:desc', q: '' },
      { status: 'Approved', locationId: null },
    );
    expect(params.toString()).toBe('page=2&pageSize=25&sort=folio:desc&status=Approved');
  });
});
