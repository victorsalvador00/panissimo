import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type {
  PhysicalCountDto,
  PhysicalCountLine,
  PhysicalCountListItem,
} from './data-access/physical-counts.api';
import { CountDetailPage } from './pages/count-detail-page';
import { progressText } from './pages/counts-list-page';
import { toAddedCount } from './ui/add-count-line-dialog';
import { addQty, mergeTarget, toConsumptionRequest } from './ui/consumption-lines';
import {
  countProgress,
  countUpdateRequest,
  filterLines,
  lineMatches,
  linesWithDifference,
  PendingCounts,
  toCountInputs,
} from './ui/count-lines';

const countLine = (overrides: Partial<PhysicalCountLine>): PhysicalCountLine => ({
  id: 'l1',
  itemId: 'azu',
  sku: 'AZU-001',
  itemName: 'Azúcar estándar',
  baseUomCode: 'kg',
  lotId: null,
  lotNumber: null,
  expirationDate: null,
  snapshotQty: 25,
  countedQty: null,
  difference: null,
  ...overrides,
});

const buildCount = (overrides: Partial<PhysicalCountDto> = {}): PhysicalCountDto => ({
  id: 'c1',
  folio: 'CF-000001',
  locationId: 'suc1',
  locationCode: 'SUC-01',
  categoryId: null,
  status: 'InProgress',
  notes: null,
  createdAt: '2026-09-26T10:00:00Z',
  createdBy: null,
  createdByName: null,
  startedAt: '2026-09-26T10:05:00Z',
  closedAt: null,
  lines: [
    countLine({ id: 'l1' }),
    countLine({
      id: 'l2',
      itemId: 'har',
      sku: 'HAR-001',
      itemName: 'Harina',
      lotId: 'lot1',
      lotNumber: 'L-2409',
      snapshotQty: 100,
    }),
  ],
  movements: [],
  version: 1,
  ...overrides,
});

const sugar: ItemOption = {
  id: 'azu',
  sku: 'AZU-001',
  name: 'Azúcar',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: false,
  shelfLifeDays: null,
};
const flour: ItemOption = { ...sugar, id: 'har', sku: 'HAR-001', name: 'Harina', tracksLots: true };

describe('conteo: búsqueda, avance y diferencias', () => {
  const lines = buildCount().lines;

  it('busca por SKU, nombre sin acentos o lote', () => {
    expect(lineMatches(lines[0], 'azucar')).toBe(true);
    expect(lineMatches(lines[0], 'AZU-0')).toBe(true);
    expect(lineMatches(lines[1], 'l-2409')).toBe(true);
    expect(lineMatches(lines[1], 'azu')).toBe(false);
    expect(lineMatches(lines[1], '  ')).toBe(true);
  });

  it('lo capturado sin guardar cuenta como contado en filtros y avance', () => {
    const pending = new Map([['l2', 0]]);
    expect(filterLines(lines, '', 'pending', pending).map((l) => l.id)).toEqual(['l1']);
    expect(filterLines(lines, '', 'counted', pending).map((l) => l.id)).toEqual(['l2']);
    expect(filterLines(lines, 'harina', 'all', pending).map((l) => l.id)).toEqual(['l2']);
    expect(countProgress(lines, pending)).toEqual({ counted: 1, total: 2, missing: 1 });
  });

  it('solo las líneas contadas con diferencia distinta de cero se registran al cerrar', () => {
    const closed = [
      countLine({ id: 'a', countedQty: 25, difference: 0 }),
      countLine({ id: 'b', countedQty: 20, difference: -5 }),
      countLine({ id: 'c', countedQty: null, difference: null }),
    ];
    expect(linesWithDifference(closed).map((l) => l.id)).toEqual(['b']);
  });

  it('muestra el avance del conteo en la lista', () => {
    const row = { status: 'InProgress', countedLines: 3, lineCount: 10 } as PhysicalCountListItem;
    expect(progressText(row)).toBe('3 de 10');
    expect(progressText({ ...row, status: 'Draft' })).toBe('Sin iniciar');
  });
});

describe('conteo: autoguardado', () => {
  it('ack quita solo lo que no cambió mientras se guardaba', () => {
    const pending = new PendingCounts();
    pending.set('l1', 5);
    pending.set('l2', 7);
    const sent = pending.take();
    pending.set('l1', 6); // el usuario siguió escribiendo en l1
    pending.ack(sent);
    expect([...pending.view]).toEqual([['l1', 6]]);
  });

  it('arma el PUT con la versión, categoría y notas del conteo', () => {
    const count = buildCount({ version: 7, categoryId: 'cat', notes: 'Turno noche' });
    expect(countUpdateRequest(count, toCountInputs(new Map([['l1', 0]])))).toEqual({
      version: 7,
      categoryId: 'cat',
      notes: 'Turno noche',
      counts: [
        {
          lineId: 'l1',
          countedQty: 0,
          itemId: null,
          lotId: null,
          lotNumber: null,
          expirationDate: null,
        },
      ],
    });
  });

  it('una línea agregada manda artículo y, si maneja lotes, el lote contado', () => {
    expect(
      toAddedCount({
        item: flour,
        lotNumber: ' L-9 ',
        expirationDate: new Date(2026, 11, 31),
        countedQty: 4,
      }),
    ).toEqual({
      lineId: null,
      itemId: 'har',
      lotId: null,
      lotNumber: 'L-9',
      expirationDate: '2026-12-31',
      countedQty: 4,
    });
    expect(
      toAddedCount({ item: sugar, lotNumber: 'X', expirationDate: null, countedQty: 0 }),
    ).toMatchObject({ itemId: 'azu', lotNumber: null, expirationDate: null, countedQty: 0 });
  });
});

describe('consumo: captura rápida', () => {
  it('suma al mismo artículo sin lote elegido; con lote elegido abre otra línea', () => {
    const lines = [
      { item: sugar, quantity: 2, lotId: null },
      { item: flour, quantity: 1, lotId: 'lot1' },
    ];
    expect(mergeTarget(lines, sugar)).toBe(0);
    expect(mergeTarget(lines, flour)).toBe(-1);
    expect(addQty(0.1, 0.2)).toBe(0.3);
  });

  it('arma la petición: día como fecha, lote solo en artículos con lotes', () => {
    expect(
      toConsumptionRequest({
        locationId: 'suc1',
        businessDate: new Date(2026, 8, 26),
        notes: ' ',
        lines: [
          { item: sugar, quantity: 2.5, lotId: 'ignorado' },
          { item: flour, quantity: 1, lotId: null },
        ],
      }),
    ).toEqual({
      locationId: 'suc1',
      businessDate: '2026-09-26',
      notes: null,
      lines: [
        { itemId: 'azu', lotId: null, quantity: 2.5 },
        { itemId: 'har', lotId: null, quantity: 1 },
      ],
    });
  });
});

describe('CountDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['inventory.view', 'inventory.count'] });
  });

  afterEach(() => http.verify());

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function open(count: PhysicalCountDto): Promise<ComponentFixture<CountDetailPage>> {
    const fixture = TestBed.createComponent(CountDetailPage);
    (fixture.componentRef as ComponentRef<CountDetailPage>).setInput('id', count.id);
    fixture.detectChanges();
    http.expectOne('/api/v1/physical-counts/c1').flush(count);
    http
      .expectOne((req) => req.url === '/api/v1/item-categories')
      .flush({
        items: [],
        page: 1,
        pageSize: 100,
        total: 0,
      });
    await fixture.whenStable();
    return fixture;
  }

  function type(fixture: ComponentFixture<CountDetailPage>, sku: string, text: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      `input[aria-label^="Contado de ${sku}"]`,
    )!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  const button = (fixture: ComponentFixture<CountDetailPage>, text: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text),
    )!;

  it('guarda lo capturado al salir del campo y luego revisa las diferencias sin mostrar el sistema antes', async () => {
    const fixture = await open(buildCount());
    const el = fixture.nativeElement as HTMLElement;
    // Captura a ciegas: no aparece la existencia del sistema.
    expect(el.textContent).not.toContain('Sistema');
    expect(el.textContent).toContain('0 de 2 contadas');

    type(fixture, 'AZU-001', '20');
    type(fixture, 'HAR-001', '100');
    el.querySelector('ul.lines')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await tick();

    const save = http.expectOne('/api/v1/physical-counts/c1');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body.version).toBe(1);
    expect(save.request.body.counts).toEqual([
      expect.objectContaining({ lineId: 'l1', countedQty: 20 }),
      expect.objectContaining({ lineId: 'l2', countedQty: 100 }),
    ]);
    const saved = buildCount({
      version: 2,
      lines: [
        countLine({ id: 'l1', countedQty: 20, difference: -5 }),
        { ...buildCount().lines[1], countedQty: 100, difference: 0 },
      ],
    });
    save.flush(saved);
    await tick();
    await fixture.whenStable();
    expect(el.textContent).toContain('2 de 2 contadas');
    expect(el.textContent).toContain('Guardado');

    button(fixture, 'Revisar y cerrar').click();
    await tick();
    await fixture.whenStable();
    expect(el.textContent).toContain('Revisar diferencias');
    expect(el.textContent).toContain('Sistema 25 kg');
    expect(el.textContent).toContain('-5 kg');
    expect(el.textContent).not.toContain('HAR-001'); // sin diferencia
  });

  it('con líneas sin contar, el botón indica cuántas faltan y filtra las pendientes', async () => {
    const fixture = await open(buildCount());
    const el = fixture.nativeElement as HTMLElement;
    type(fixture, 'AZU-001', '0');
    await fixture.whenStable();

    const missing = button(fixture, 'Faltan 1');
    expect(missing).toBeTruthy();
    missing.click();
    await tick();
    http.expectOne('/api/v1/physical-counts/c1').flush(
      buildCount({
        version: 2,
        lines: [countLine({ countedQty: 0, difference: -25 }), buildCount().lines[1]],
      }),
    );
    await tick();
    await fixture.whenStable();

    expect(el.textContent).not.toContain('Revisar diferencias');
    const visible = Array.from(el.querySelectorAll('li.line .meta')).map((m) => m.textContent);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toContain('HAR-001');
  });
});
