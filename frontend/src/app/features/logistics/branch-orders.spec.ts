import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppDates } from '../../core/i18n/date-adapter';
import { provideAppLocale } from '../../core/i18n/locale';
import type { ItemOption } from '../../shared/data-access/item-lookup.service';
import type { LocationOption } from '../../shared/data-access/location-lookup.service';
import type {
  BranchOrderDto,
  BranchOrderLine,
  BranchOrderSuggestion,
} from './data-access/branch-orders.api';
import type { TransferDto } from './data-access/transfers.api';
import { BranchOrderDetailPage } from './pages/branch-order-detail-page';
import { BranchOrderFormPage } from './pages/branch-order-form-page';
import { BranchOrdersListPage } from './pages/branch-orders-list-page';
import { TransferDetailPage } from './pages/transfer-detail-page';
import {
  approvesSomething,
  branchOrderActions,
  createApproveLine,
  createOrderLine,
  exceedsStock,
  missingSuggestions,
  supplyingOptions,
  toApproveRequest,
} from './ui/branch-order-lines';

const flour: ItemOption = {
  id: 'har',
  sku: 'HAR-001',
  name: 'Harina',
  type: 'RawMaterial',
  baseUomCode: 'kg',
  tracksLots: true,
  shelfLifeDays: 180,
};
const sugar: ItemOption = {
  ...flour,
  id: 'azu',
  sku: 'AZU-001',
  name: 'Azúcar',
  tracksLots: false,
};

const suc1 = { id: 'suc-01', code: 'SUC-01', name: 'Sucursal 01' };
const comLoc = { id: 'com', code: 'COM', name: 'Comisariato' };

function orderLine(overrides: Partial<BranchOrderLine> = {}): BranchOrderLine {
  return {
    id: 'ol1',
    itemId: 'har',
    sku: 'HAR-001',
    itemName: 'Harina',
    baseUomCode: 'kg',
    requestedQty: 10,
    approvedQty: null,
    shippedQty: 0,
    onHandAtOrigin: 6,
    ...overrides,
  };
}

function buildOrder(overrides: Partial<BranchOrderDto> = {}): BranchOrderDto {
  return {
    id: 'o1',
    folio: 'PED-000007',
    requestingLocation: suc1,
    supplyingLocation: comLoc,
    requiredDate: '2026-10-06',
    status: 'Submitted',
    notes: null,
    lines: [
      orderLine(),
      orderLine({
        id: 'ol2',
        itemId: 'azu',
        sku: 'AZU-001',
        itemName: 'Azúcar',
        requestedQty: 4,
        onHandAtOrigin: 50,
      }),
    ],
    transfers: [],
    submittedAt: '2026-10-05T15:00:00Z',
    submittedBy: 'u-1',
    submittedByName: null,
    approvedAt: null,
    approvedBy: null,
    approvedByName: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectedByName: null,
    rejectionReason: null,
    fulfilledAt: null,
    createdAt: '2026-10-05T14:00:00Z',
    createdBy: 'u-1',
    createdByName: null,
    version: 4,
    ...overrides,
  };
}

const suggestion = (overrides: Partial<BranchOrderSuggestion>): BranchOrderSuggestion => ({
  itemId: 'har',
  sku: 'HAR-001',
  itemName: 'Harina',
  baseUomCode: 'kg',
  minQty: 5,
  maxQty: 20,
  onHand: 3,
  inTransit: 0,
  pending: 0,
  suggestedQty: 17,
  ...overrides,
});

const button = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button, a')).find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined;
const overlay = () => document.querySelector('.cdk-overlay-container')!;
const clearOverlay = () =>
  document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));

const branchUser = {
  defaultLocationId: 'suc-01',
  locations: [{ ...suc1, type: 'Branch', isActive: true }],
};
const originUser = {
  defaultLocationId: 'com',
  locations: [{ ...comLoc, type: 'Commissary', isActive: true }],
};

describe('pedidos: reglas', () => {
  it('la sucursal edita, envía y cancela; el origen aprueba o rechaza', () => {
    const both = { create: true, approve: true };
    expect(branchOrderActions('Draft', both, { requesting: true, supplying: false })).toEqual({
      edit: true,
      submit: true,
      cancel: true,
      approve: false,
      reject: false,
    });
    expect(branchOrderActions('Submitted', both, { requesting: true, supplying: false })).toEqual({
      edit: false,
      submit: false,
      cancel: true,
      approve: false,
      reject: false,
    });
    expect(branchOrderActions('Submitted', both, { requesting: false, supplying: true })).toEqual({
      edit: false,
      submit: false,
      cancel: false,
      approve: true,
      reject: true,
    });
    // Sin permiso de aprobar, estar en el origen no basta.
    expect(
      branchOrderActions(
        'Submitted',
        { create: true, approve: false },
        {
          requesting: false,
          supplying: true,
        },
      ).approve,
    ).toBe(false);
    // Aprobado: ya no se cancela el pedido (se cancela su traspaso en borrador).
    expect(
      Object.values(branchOrderActions('Approved', both, { requesting: true, supplying: true })),
    ).not.toContain(true);
  });

  it('solo se pide a la fábrica o al comisariato', () => {
    const loc = (id: string, type: LocationOption['type']): LocationOption => ({
      id,
      code: id,
      name: id,
      type,
    });
    expect(
      supplyingOptions([loc('suc', 'Branch'), loc('com', 'Commissary'), loc('fab', 'Factory')]).map(
        (l) => l.id,
      ),
    ).toEqual(['com', 'fab']);
  });

  it('el sugerido solo agrega artículos que no están en el pedido', () => {
    const lines = [createOrderLine({ item: flour, quantity: 2 }).getRawValue()];
    const result = missingSuggestions(lines, [
      suggestion({}),
      suggestion({ itemId: 'azu', sku: 'AZU-001' }),
    ]);
    expect(result.map((s) => s.itemId)).toEqual(['azu']);
  });

  it('aprobado: prellena lo solicitado, de 0 a lo solicitado; avisa si pasa la existencia', () => {
    const line = orderLine();
    const control = createApproveLine(line);
    expect(control.value).toBe(10);
    expect(exceedsStock(line, control.value)).toBe(true);
    control.setValue(11);
    expect(control.hasError('qtyMax')).toBe(true);
    control.setValue(6);
    expect(control.valid).toBe(true);
    expect(exceedsStock(line, 6)).toBe(false);
  });

  it('arma la aprobación con todas las líneas y no permite aprobar todo en 0', () => {
    const order = buildOrder();
    expect(approvesSomething({ ol1: 0, ol2: 0 })).toBe(false);
    expect(approvesSomething({ ol1: 0, ol2: 4 })).toBe(true);
    expect(toApproveRequest(4, order.lines, { ol1: 6, ol2: null })).toEqual({
      version: 4,
      lines: [
        { lineId: 'ol1', approvedQty: 6 },
        { lineId: 'ol2', approvedQty: 0 },
      ],
    });
  });
});

describe('BranchOrdersListPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  function setUp(permissions: string[], me: object) {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions, ...me });
    const fixture = TestBed.createComponent(BranchOrdersListPage);
    fixture.detectChanges();
    return fixture;
  }

  const empty = { items: [], page: 1, pageSize: 25, total: 0 };
  const lastList = () =>
    http.expectOne((req) => req.url === '/api/v1/branch-orders' && req.method === 'GET');

  it('la sucursal ve solo los de la ubicación activa, sin pestañas', async () => {
    const fixture = setUp(['logistics.view', 'logistics.orders.create'], branchUser);
    const req = lastList();
    expect(req.request.params.get('locationId')).toBe('suc-01');
    req.flush(empty);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('a[mat-tab-link]')).toHaveLength(0);
    expect(button(el, 'add Nuevo pedido')).toBeDefined();
  });

  it('quien aprueba ve todos y la pestaña Por aprobar filtra los enviados', async () => {
    const fixture = setUp(['logistics.view', 'logistics.orders.approve'], originUser);
    const first = lastList();
    expect(first.request.params.has('locationId')).toBe(false);
    first.flush(empty);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(button(el, 'add Nuevo pedido')).toBeUndefined();
    const toApprove = Array.from(el.querySelectorAll<HTMLElement>('a[mat-tab-link]')).find(
      (t) => t.textContent?.trim() === 'Por aprobar',
    )!;
    toApprove.click();
    TestBed.tick();
    const req = lastList();
    expect(req.request.params.get('status')).toBe('Submitted');
    req.flush(empty);
  });
});

describe('BranchOrderFormPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('elige solo el origen, sugiere lo que falta sin tocar lo capturado y lo envía', async () => {
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), provideAppLocale(), ...provideAppDates()],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['logistics.view', 'logistics.orders.create'], ...branchUser });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(BranchOrderFormPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/locations/lookup').flush([
      { ...suc1, type: 'Branch' },
      { ...comLoc, type: 'Commissary' },
    ]);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const form = page['form'];
    expect(el.textContent).toContain('SUC-01 · Sucursal 01');
    expect(form.controls.supplyingLocationId.value).toBe('com');

    form.controls.lines.at(0).patchValue({ item: flour, quantity: 2 });
    button(el, 'auto_awesome Sugerir por mín/máx')!.click();
    const req = http.expectOne((r) => r.url === '/api/v1/branch-orders/suggestion');
    expect(req.request.params.get('locationId')).toBe('suc-01');
    req.flush([
      suggestion({}),
      suggestion({
        itemId: 'azu',
        sku: 'AZU-001',
        minQty: 2,
        maxQty: 6,
        onHand: 1,
        suggestedQty: 5,
      }),
    ]);
    http.expectOne((r) => r.url === '/api/v1/items/lookup').flush([sugar]);
    await fixture.whenStable();

    const lines = form.controls.lines.getRawValue();
    expect(lines.map((l) => [l.item?.sku, l.quantity])).toEqual([
      ['HAR-001', 2],
      ['AZU-001', 5],
    ]);
    expect(el.textContent).toContain('Mín 2 · máx 6 · hay 1');

    button(el, 'Guardar y enviar')!.click();
    const create = http.expectOne({ method: 'POST', url: '/api/v1/branch-orders' });
    expect(create.request.body).toEqual(
      expect.objectContaining({
        requestingLocationId: 'suc-01',
        supplyingLocationId: 'com',
        lines: [
          { itemId: 'har', requestedQty: 2 },
          { itemId: 'azu', requestedQty: 5 },
        ],
      }),
    );
    create.flush(buildOrder({ status: 'Draft' }));
    const submit = http.expectOne({ method: 'POST', url: '/api/v1/branch-orders/o1/submit' });
    expect(submit.request.body).toEqual({ version: 4 });
    submit.flush(buildOrder());
    expect(navigate).toHaveBeenCalledWith(['/logistica/pedidos', 'o1']);
  });
});

describe('BranchOrderDetailPage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    clearOverlay();
  });

  async function open(permissions: string[], me: object, order = buildOrder()) {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions, ...me });
    const fixture = TestBed.createComponent(BranchOrderDetailPage);
    fixture.componentRef.setInput('id', order.id);
    fixture.detectChanges();
    http.expectOne(`/api/v1/branch-orders/${order.id}`).flush(order);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('la sucursal no aprueba su propio pedido; en borrador puede enviar y editar', async () => {
    const { el } = await open(
      ['logistics.view', 'logistics.orders.create', 'logistics.orders.approve'],
      branchUser,
      buildOrder({ status: 'Draft' }),
    );
    expect(button(el, 'Enviar')).toBeDefined();
    expect(button(el, 'Editar')).toBeDefined();
    expect(button(el, 'Aprobar')).toBeUndefined();
  });

  it('el origen aprueba con lo solicitado, ve el aviso de existencia y confirma', async () => {
    const { fixture, el } = await open(
      ['logistics.view', 'logistics.orders.approve', 'logistics.transfers.dispatch'],
      originUser,
    );
    button(el, 'Aprobar')!.click();
    await fixture.whenStable();
    const flourInput = el.querySelector<HTMLInputElement>(
      'input[aria-label="Aprobado de Harina"]',
    )!;
    expect(flourInput.value).toBe('10');
    expect(el.textContent).toContain('Aprobado mayor a la existencia en origen.');

    flourInput.value = '6';
    flourInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Aprobado mayor a la existencia en origen.');

    button(el, 'Confirmar aprobación')!.click();
    await fixture.whenStable();
    const dialog = overlay().querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('¿Aprobar el pedido PED-000007?');
    button(dialog, 'Aprobar')!.click();
    // `afterClosed` se emite al terminar la animación de cierre.
    const req = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: '/api/v1/branch-orders/o1/approve' }),
    );
    expect(req.request.body).toEqual({
      version: 4,
      lines: [
        { lineId: 'ol1', approvedQty: 6 },
        { lineId: 'ol2', approvedQty: 4 },
      ],
    });
    req.flush(
      buildOrder({
        status: 'Approved',
        lines: [orderLine({ approvedQty: 6 }), orderLine({ id: 'ol2', approvedQty: 4 })],
        transfers: [{ id: 't9', folio: 'TR-000009', status: 'Draft' }],
      }),
    );
    await fixture.whenStable();
    const dispatch = button(el, 'local_shipping Ir a despachar') as unknown as HTMLAnchorElement;
    expect(dispatch.getAttribute('href')).toBe('/logistica/traspasos/t9');
  });

  it('no deja aprobar todo en 0', async () => {
    const { fixture, el } = await open(['logistics.view', 'logistics.orders.approve'], originUser);
    button(el, 'Aprobar')!.click();
    await fixture.whenStable();
    fixture.componentInstance['approveForm']().setValue({ ol1: 0, ol2: 0 });
    button(el, 'Confirmar aprobación')!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Aprueba al menos un artículo.');
    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });
});

describe('TransferDetailPage de un pedido', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    clearOverlay();
  });

  it('enlaza el pedido y advierte que cancelar el borrador cancela el pedido', async () => {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['logistics.view', 'logistics.transfers.dispatch'], ...originUser });
    const fixture = TestBed.createComponent(TransferDetailPage);
    fixture.componentRef.setInput('id', 't9');
    fixture.detectChanges();
    const transfer: Partial<TransferDto> = {
      id: 't9',
      folio: 'TR-000009',
      from: comLoc,
      to: suc1,
      branchOrderId: 'o1',
      branchOrderFolio: 'PED-000007',
      status: 'Draft',
      notes: null,
      vehicleDescription: null,
      driverName: null,
      dispatchedAt: null,
      dispatchedBy: null,
      dispatchedByName: null,
      receivedAt: null,
      receivedBy: null,
      receivedByName: null,
      lines: [],
      shippedValue: 0,
      transitLossValue: 0,
      createdAt: '2026-10-05T16:00:00Z',
      createdBy: null,
      createdByName: null,
      version: 1,
    };
    http.expectOne('/api/v1/transfers/t9').flush(transfer);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const link = button(el, 'PED-000007') as unknown as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/logistica/pedidos/o1');

    button(el, 'Cancelar traspaso')!.click();
    await fixture.whenStable();
    expect(overlay().querySelector('mat-dialog-container')!.textContent).toContain(
      'También se cancelará el pedido PED-000007.',
    );
  });
});
