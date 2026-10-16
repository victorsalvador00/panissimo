import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, FormRecord } from '@angular/forms';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppLocale } from '../../core/i18n/locale';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type { LocationOption } from '../../shared/data-access/location-lookup.service';
import type { TransferDto, TransferLine } from './data-access/transfers.api';
import { LotQty, lotsSumValidator } from '../inventory/ui/lot-split';
import { TransferDetailPage } from './pages/transfer-detail-page';
import { TransferReceivePage } from './pages/transfer-receive-page';
import {
  createReceiveLine,
  destinationOptions,
  isStandardRoute,
  receiveSummary,
  tabFilters,
  toDispatchRequest,
  toReceiveRequest,
  toTransferLines,
} from './ui/transfer-lines';

const loc = (id: string, type: LocationOption['type']): LocationOption => ({
  id,
  code: id.toUpperCase(),
  name: id,
  type,
});
const com = loc('com', 'Commissary');
const fab = loc('fab', 'Factory');
const suc1 = loc('suc-01', 'Branch');
const suc2 = loc('suc-02', 'Branch');

const flour: ItemOption = {
  id: 'har',
  sku: 'HAR-001',
  name: 'Harina',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
};

const transferLine = (overrides: Partial<TransferLine> = {}): TransferLine => ({
  id: 'l1',
  itemId: 'har',
  sku: 'HAR-001',
  itemName: 'Harina',
  baseUomCode: 'kg',
  lotId: 'lot1',
  lotNumber: 'L-2409',
  expirationDate: null,
  shippedQty: 5,
  receivedQty: null,
  shortQty: 0,
  unitCost: 12,
  shortValue: null,
  discrepancyReason: null,
  discrepancyNotes: null,
  ...overrides,
});

const buildTransfer = (overrides: Partial<TransferDto> = {}): TransferDto => ({
  id: 't1',
  folio: 'TR-000001',
  from: { id: 'com', code: 'COM', name: 'Comisariato' },
  to: { id: 'suc-01', code: 'SUC-01', name: 'Sucursal 01' },
  branchOrderId: null,
  branchOrderFolio: null,
  status: 'Dispatched',
  notes: null,
  vehicleDescription: 'NP300',
  driverName: 'Juan',
  dispatchedAt: '2026-09-26T10:00:00Z',
  dispatchedBy: null,
  dispatchedByName: null,
  receivedAt: null,
  receivedBy: null,
  receivedByName: null,
  lines: [
    transferLine(),
    transferLine({
      id: 'l2',
      itemId: 'azu',
      sku: 'AZU-001',
      itemName: 'Azúcar',
      lotId: null,
      lotNumber: null,
      shippedQty: 2,
    }),
  ],
  shippedValue: 84,
  transitLossValue: 0,
  createdAt: '2026-09-26T09:00:00Z',
  createdBy: null,
  createdByName: null,
  version: 3,
  ...overrides,
});

describe('traspasos: rutas y pestañas', () => {
  it('ruta estándar: fábrica o comisariato hacia sucursal', () => {
    expect(isStandardRoute('Commissary', 'Branch')).toBe(true);
    expect(isStandardRoute('Factory', 'Branch')).toBe(true);
    expect(isStandardRoute('Branch', 'Branch')).toBe(false);
    expect(isStandardRoute('Factory', 'Commissary')).toBe(false);
    expect(isStandardRoute('Branch', 'Commissary')).toBe(false);
  });

  it('sin traspasos especiales solo ofrece sucursales; nunca el mismo origen', () => {
    const all = [com, fab, suc1, suc2];
    expect(destinationOptions(all, com, false).map((l) => l.id)).toEqual(['suc-01', 'suc-02']);
    expect(destinationOptions(all, suc1, false)).toEqual([]);
    expect(destinationOptions(all, com, true).map((l) => l.id)).toEqual([
      'fab',
      'suc-01',
      'suc-02',
    ]);
    expect(destinationOptions(all, null, true)).toEqual([]);
  });

  it('cada pestaña filtra por la ubicación activa', () => {
    expect(tabFilters('toDispatch', 'com')).toEqual({ status: 'Draft', fromLocationId: 'com' });
    expect(tabFilters('inTransit', 'suc')).toEqual({ status: 'Dispatched', locationId: 'suc' });
    expect(tabFilters('received', 'suc')).toEqual({ received: true, locationId: 'suc' });
    expect(tabFilters('all', 'suc')).toEqual({ locationId: 'suc' });
  });

  it('las líneas del borrador mandan lote solo en artículos con lotes', () => {
    expect(
      toTransferLines([
        { item: flour, quantity: 5, lotId: 'lot1' },
        { item: { ...flour, id: 'azu', tracksLots: false }, quantity: 2, lotId: 'x' },
      ]),
    ).toEqual([
      { itemId: 'har', lotId: 'lot1', quantity: 5 },
      { itemId: 'azu', lotId: null, quantity: 2 },
    ]);
  });
});

describe('traspasos: despacho', () => {
  const dispatchLine = (manual: boolean, quantities: Record<string, number | null>) =>
    new FormGroup(
      {
        manual: new FormControl(manual, { nonNullable: true }),
        lots: new FormRecord<LotQty>(
          Object.fromEntries(
            Object.entries(quantities).map(([lotId, quantity]) => [
              lotId,
              new FormGroup({
                lotId: new FormControl(lotId, { nonNullable: true }),
                quantity: new FormControl<number | null>(quantity),
              }),
            ]),
          ),
        ),
      },
      { validators: lotsSumValidator(5) },
    );

  it('en reparto manual los lotes deben sumar la cantidad de la línea', () => {
    expect(dispatchLine(true, { a: 3, b: 2 }).valid).toBe(true);
    expect(dispatchLine(true, { a: 3, b: 1 }).errors).toEqual({
      lotsSum: { expected: 5, total: 4 },
    });
    expect(dispatchLine(false, { a: 0 }).valid).toBe(true); // automático
  });

  it('solo manda las líneas con reparto manual y los lotes con cantidad', () => {
    expect(
      toDispatchRequest(3, ' NP300 ', ' Juan ', {
        l1: {
          manual: true,
          lots: { a: { lotId: 'a', quantity: 5 }, b: { lotId: 'b', quantity: 0 } },
        },
        l2: { manual: false, lots: {} },
      }),
    ).toEqual({
      version: 3,
      vehicleDescription: 'NP300',
      driverName: 'Juan',
      lines: [{ lineId: 'l1', lots: [{ lotId: 'a', quantity: 5 }] }],
    });
    expect(toDispatchRequest(3, 'v', 'c', { l1: { manual: false, lots: {} } }).lines).toBeNull();
  });
});

describe('traspasos: recepción (RN-22)', () => {
  it('prellena lo enviado; menos exige motivo; más no se permite', () => {
    const line = createReceiveLine(transferLine({ shippedQty: 5 }));
    expect(line.controls.receivedQty.value).toBe(5);
    expect(line.valid).toBe(true);

    line.controls.receivedQty.setValue(4);
    expect(line.errors).toEqual({ reasonRequired: true });
    line.controls.reason.setValue('Damaged');
    expect(line.valid).toBe(true);

    line.controls.receivedQty.setValue(6);
    expect(line.errors).toEqual({ receivedTooMuch: { shipped: 5 } });
  });

  it('solo las líneas con faltante llevan motivo y notas', () => {
    const lines = buildTransfer().lines;
    const values = {
      l1: { receivedQty: 4, reason: 'Missing' as const, notes: ' caja abierta ' },
      l2: { receivedQty: 2, reason: 'Other' as const, notes: 'ignorar' },
    };
    expect(toReceiveRequest(3, lines, values)).toEqual({
      version: 3,
      lines: [
        {
          lineId: 'l1',
          receivedQty: 4,
          discrepancyReason: 'Missing',
          discrepancyNotes: 'caja abierta',
        },
        { lineId: 'l2', receivedQty: 2, discrepancyReason: null, discrepancyNotes: null },
      ],
    });
    expect(receiveSummary(lines, values)).toEqual({ complete: 1, short: 1 });
  });
});

describe('TransferReceivePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['logistics.view', 'logistics.transfers.receive'] });
  });

  afterEach(() => http.verify());

  async function open(): Promise<ComponentFixture<TransferReceivePage>> {
    const fixture = TestBed.createComponent(TransferReceivePage);
    fixture.componentRef.setInput('id', 't1');
    fixture.detectChanges();
    http.expectOne('/api/v1/transfers/t1').flush(buildTransfer());
    await fixture.whenStable();
    return fixture;
  }

  it('al recibir menos pide el motivo y no deja confirmar sin él', async () => {
    const fixture = await open();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('2 completas');
    expect(el.querySelector('mat-select')).toBeNull();

    const input = el.querySelector<HTMLInputElement>('input[aria-label="Recibido de HAR-001"]')!;
    expect(input.value).toBe('5');
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(el.textContent).toContain('1 con faltante');
    expect(el.querySelector('mat-select')).not.toBeNull();

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Recibir')!
      .click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Elige el motivo del faltante.');
    // No se abrió la confirmación ni se envió nada.
    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });
});

describe('TransferDetailPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['logistics.view'] });
  });

  afterEach(() => http.verify());

  it('muestra quién creó, despachó y recibió el traspaso', async () => {
    const fixture = TestBed.createComponent(TransferDetailPage);
    fixture.componentRef.setInput('id', 't1');
    fixture.detectChanges();
    http.expectOne('/api/v1/transfers/t1').flush(
      buildTransfer({
        status: 'Received',
        createdByName: 'Ana Ruiz',
        dispatchedByName: 'Pedro Gómez',
        receivedAt: '2026-09-26T15:00:00Z',
        receivedByName: 'Laura Méndez',
      }),
    );
    await fixture.whenStable();

    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('dl > div'),
    ).map((row) => row.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows.find((r) => r.startsWith('Creado'))).toContain('· Ana Ruiz');
    expect(rows.find((r) => r.startsWith('Despachado'))).toContain('· Pedro Gómez');
    expect(rows.find((r) => r.startsWith('Recibido'))).toContain('· Laura Méndez');
  });
});
