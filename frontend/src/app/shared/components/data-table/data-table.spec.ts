import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ListQuery } from '../../data-access/list-query';
import { CellDef, DataTable, RowDetail } from './data-table';

interface Row {
  id: string;
  folio: string;
}

const rows = (from: number, count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${from + i}`, folio: `F-${from + i}` }));

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTable, CellDef, RowDetail],
  template: `
    <app-data-table
      label="Prueba"
      [rows]="rows()"
      [total]="40"
      [query]="query()"
      [loading]="loading()"
      selectable
      [(selection)]="selection"
      (queryChange)="changes.push($event)"
    >
      <ng-template appCell="folio" header="Folio" sortable [appCellOf]="rows()" let-row>{{
        row.folio
      }}</ng-template>
      <ng-template appRowDetail [appRowDetailOf]="rows()" let-row
        ><span class="detail">Detalle {{ row.folio }}</span></ng-template
      >
      <p empty class="custom-empty">Nada por aquí.</p>
    </app-data-table>
  `,
})
class Host {
  readonly rows = signal<Row[]>(rows(1, 10));
  readonly query = signal<ListQuery>({ page: 1, pageSize: 10 });
  readonly loading = signal(false);
  readonly selection = signal<readonly Row[]>([]);
  readonly changes: ListQuery[] = [];
}

async function setup() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return {
    fixture,
    host: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('DataTable', () => {
  it('renders the columns and asks the server for another sort or page', async () => {
    const { host, element, fixture } = await setup();
    expect(element.querySelectorAll('tr.mat-mdc-row:not(.detail-row)').length).toBe(10);

    (element.querySelector('th .mat-sort-header-container') as HTMLElement).click();
    await fixture.whenStable();
    expect(host.changes.at(-1)).toEqual({ page: 1, pageSize: 10, sort: 'folio' });

    (element.querySelector('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    expect(host.changes.at(-1)).toEqual({ page: 2, pageSize: 10 });
  });

  it('keeps the selection across pages', async () => {
    const { host, element, fixture } = await setup();
    const selectAll = element.querySelector('th input[type="checkbox"]') as HTMLInputElement;
    selectAll.click();
    await fixture.whenStable();
    expect(host.selection().length).toBe(10);

    host.rows.set(rows(11, 10));
    await fixture.whenStable();
    (element.querySelector('td input[type="checkbox"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(host.selection().map((r) => r.id)).toContain('r1');
    expect(host.selection().map((r) => r.id)).toContain('r11');
    expect(host.selection().length).toBe(11);
  });

  it('expands the detail of a row', async () => {
    const { element, fixture } = await setup();
    expect(element.querySelector('.detail')).toBeNull();
    (element.querySelector('[aria-label="Ver detalle"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('.detail')?.textContent).toContain('Detalle F-1');
  });

  it('shows a skeleton while loading and the empty content without rows', async () => {
    const { host, element, fixture } = await setup();
    host.rows.set([]);
    host.loading.set(true);
    await fixture.whenStable();
    expect(element.querySelector('[role="status"][aria-label="Cargando"]')).not.toBeNull();

    host.loading.set(false);
    await fixture.whenStable();
    expect(element.querySelector('.custom-empty')?.textContent).toContain('Nada por aquí.');
  });
});
