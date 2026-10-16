import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormArray } from '@angular/forms';
import { provideHttpTesting, signIn } from '../../core/auth/testing';
import { provideAppDates } from '../../core/i18n/date-adapter';
import { provideAppLocale } from '../../core/i18n/locale';
import type { PurchaseOrderDto, PurchaseOrderLine } from './data-access/purchase-orders.api';
import { GoodsReceiptFormPage } from './pages/goods-receipt-form-page';
import { PurchaseOrderDetailPage } from './pages/purchase-order-detail-page';
import { PurchaseOrderFormPage } from './pages/purchase-order-form-page';
import { PurchaseOrdersListPage } from './pages/purchase-orders-list-page';
import {
  lineAmounts,
  orderTotals,
  PoItemOption,
  purchaseOrderActions,
  roundMoney,
} from './ui/purchase-order-lines';
import {
  anyReceivedValidator,
  createReceiptLine,
  createReceiptLot,
  exceedsPending,
  toReceiptRequest,
} from './ui/receipt-lines';

const flour: PoItemOption = {
  itemId: 'har',
  sku: 'HAR-001',
  name: 'Harina de trigo',
  purchaseUomCode: 'caja',
  taxRate: 0,
  catalogPrice: 412.5,
};
const sugar: PoItemOption = {
  itemId: 'azu',
  sku: 'AZU-001',
  name: 'Azúcar',
  purchaseUomCode: 'bulto',
  taxRate: 0.16,
  catalogPrice: 32,
};

function poLine(overrides: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return {
    id: 'pl1',
    itemId: 'har',
    sku: 'HAR-001',
    itemName: 'Harina de trigo',
    purchaseUomCode: 'caja',
    purchaseToBaseFactor: 25,
    tracksLots: true,
    quantity: 10,
    unitPrice: 412.5,
    taxRate: 0,
    subtotal: 4125,
    taxAmount: 0,
    receivedQty: 6,
    pendingQty: 4,
    requisitionLineId: null,
    requisitionId: null,
    requisitionFolio: null,
    ...overrides,
  };
}

function buildOrder(overrides: Partial<PurchaseOrderDto> = {}): PurchaseOrderDto {
  return {
    id: 'po1',
    folio: 'OC-000031',
    supplier: { id: 's1', taxId: 'HPM010203AB1', name: 'Harinera' },
    deliveryLocation: { id: 'com', code: 'COM', name: 'Comisariato' },
    expectedDate: null,
    status: 'PartiallyReceived',
    notes: null,
    subtotal: 4245,
    taxTotal: 19.2,
    total: 4264.2,
    submittedAt: '2026-09-28T15:00:00Z',
    submittedBy: 'u-1',
    submittedByName: null,
    approvalRequired: true,
    approvedBy: 'u-1',
    approvedByName: null,
    approvedAt: '2026-09-28T16:00:00Z',
    rejectedAt: null,
    rejectedBy: null,
    rejectedByName: null,
    rejectionReason: null,
    closedAt: null,
    closedBy: null,
    closedByName: null,
    lines: [
      poLine(),
      poLine({
        id: 'pl2',
        itemId: 'azu',
        sku: 'AZU-001',
        itemName: 'Azúcar',
        purchaseUomCode: 'bulto',
        tracksLots: false,
        quantity: 4,
        unitPrice: 30,
        taxRate: 0.16,
        subtotal: 120,
        taxAmount: 19.2,
        receivedQty: 4,
        pendingQty: 0,
      }),
    ],
    createdAt: '2026-09-28T14:00:00Z',
    createdBy: 'u-1',
    createdByName: null,
    version: 7,
    ...overrides,
  };
}

const button = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll('button, a')).find((b) => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined;
const overlay = () => document.querySelector('.cdk-overlay-container')!;

describe('OC: reglas', () => {
  it('importes con IVA por línea y redondeo a centavos como el backend', () => {
    expect(roundMoney(0.125)).toBe(0.13);
    expect(roundMoney(1.005)).toBe(1.01);
    const lines = [
      { item: flour, quantity: 10, unitPrice: 412.5, lineId: null },
      { item: sugar, quantity: 4, unitPrice: 30, lineId: null },
    ];
    expect(lineAmounts(lines[1])).toEqual({ subtotal: 120, tax: 19.2 });
    expect(orderTotals(lines)).toEqual({ subtotal: 4245, tax: 19.2, total: 4264.2 });
    expect(orderTotals([{ item: null, quantity: null, unitPrice: null, lineId: null }]).total).toBe(
      0,
    );
  });

  it('acciones según estado y permisos', () => {
    const all = { manage: true, approve: true, receive: true };
    expect(purchaseOrderActions('Draft', all)).toMatchObject({
      edit: true,
      submit: true,
      cancel: true,
      receive: false,
    });
    expect(purchaseOrderActions('PendingApproval', all)).toMatchObject({
      approve: true,
      reject: true,
      cancel: true,
    });
    expect(purchaseOrderActions('Approved', all)).toMatchObject({
      receive: true,
      cancel: true,
      close: false,
    });
    expect(purchaseOrderActions('PartiallyReceived', all)).toMatchObject({
      receive: true,
      close: true,
      cancel: false,
    });
    for (const status of ['Received', 'Rejected', 'Cancelled', 'Closed'] as const) {
      expect(Object.values(purchaseOrderActions(status, all)).some(Boolean)).toBe(false);
    }
    const warehouse = { manage: false, approve: false, receive: true };
    expect(purchaseOrderActions('Approved', warehouse)).toEqual({
      edit: false,
      submit: false,
      approve: false,
      reject: false,
      cancel: false,
      close: false,
      receive: true,
    });
  });
});

describe('recepción: reglas', () => {
  it('con lotes exige el número si se recibe algo; el 0 no cuenta', () => {
    expect(createReceiptLot(true, { quantity: 2 }).errors).toEqual({ lotRequired: true });
    expect(createReceiptLot(true, { quantity: 0 }).errors).toBeNull();
    expect(createReceiptLot(true, { quantity: 2, lotNumber: 'L-1' }).errors).toBeNull();
    expect(createReceiptLot(false, { quantity: 2 }).errors).toBeNull();
  });

  it('arma la petición con un renglón por lote y omite lo que no llegó', () => {
    const order = buildOrder();
    const line = poLine();
    const sugarLine = poLine({ id: 'pl3', tracksLots: false, pendingQty: 2 });
    const expiration = new Date(2027, 2, 31);
    const request = toReceiptRequest(
      order,
      [line, sugarLine],
      [
        {
          lots: [
            { quantity: 3, lotNumber: ' L-A ', expirationDate: expiration },
            { quantity: 1.5, lotNumber: 'L-B', expirationDate: null },
          ],
        },
        { lots: [{ quantity: 0, lotNumber: '', expirationDate: null }] },
      ],
      ' ',
    );
    expect(request).toEqual({
      purchaseOrderId: 'po1',
      poVersion: 7,
      supplierInvoiceNumber: null,
      lines: [
        { poLineId: 'pl1', quantity: 3, lotNumber: 'L-A', expirationDate: '2027-03-31' },
        { poLineId: 'pl1', quantity: 1.5, lotNumber: 'L-B', expirationDate: null },
      ],
    });
    expect(exceedsPending(line, [{ quantity: 4.5, lotNumber: '', expirationDate: null }])).toBe(
      true,
    );
    expect(exceedsPending(line, [{ quantity: 4, lotNumber: '', expirationDate: null }])).toBe(
      false,
    );
  });

  it('al menos una línea con cantidad', () => {
    const line = createReceiptLine(poLine());
    line.controls.lots.at(0).controls.quantity.setValue(0);
    const array = new FormArray([line]);
    expect(anyReceivedValidator(array)).toEqual({ nothingReceived: true });
    line.controls.lots.at(0).controls.quantity.setValue(1);
    expect(anyReceivedValidator(array)).toBeNull();
  });
});

describe('PurchaseOrdersListPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  function setUp(permissions: string[]) {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions });
    const fixture = TestBed.createComponent(PurchaseOrdersListPage);
    fixture.detectChanges();
    return fixture;
  }

  const empty = { items: [], page: 1, pageSize: 25, total: 0 };
  const lastList = () =>
    http.expectOne((req) => req.url === '/api/v1/purchase-orders' && req.method === 'GET');

  it('Por aprobar solo con permiso; Por recibir filtra las que se pueden recibir', async () => {
    const fixture = setUp(['purchasing.view', 'purchasing.receive']);
    lastList().flush(empty);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = () => Array.from(el.querySelectorAll('a[mat-tab-link]'));
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Todas', 'Por recibir']);

    (tabs()[1] as HTMLElement).click();
    TestBed.tick();
    const req = lastList();
    expect(req.request.params.get('pendingReceipt')).toBe('true');
    expect(req.request.params.has('status')).toBe(false);
    req.flush(empty);
  });

  it('quien aprueba ve Por aprobar y filtra por estado pendiente', async () => {
    const fixture = setUp(['purchasing.view', 'purchasing.po.approve']);
    lastList().flush(empty);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const toApprove = Array.from(el.querySelectorAll<HTMLElement>('a[mat-tab-link]')).find(
      (t) => t.textContent?.trim() === 'Por aprobar',
    )!;
    toApprove.click();
    TestBed.tick();
    const req = lastList();
    expect(req.request.params.get('status')).toBe('PendingApproval');
    req.flush(empty);
  });
});

describe('PurchaseOrderFormPage', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('sugiere el precio del catálogo, calcula el IVA y al cambiar de proveedor limpia las líneas', async () => {
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), provideAppLocale(), ...provideAppDates()],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({
      permissions: ['purchasing.view', 'purchasing.po.manage'],
      defaultLocationId: 'com',
      locations: [
        { id: 'com', code: 'COM', name: 'Comisariato', type: 'Commissary', isActive: true },
      ],
    });
    const fixture = TestBed.createComponent(PurchaseOrderFormPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Elige el proveedor para agregar artículos de su catálogo.');

    page['form'].controls.supplier.setValue({ id: 's1', name: 'Harinera', taxId: 'HPM010203AB1' });
    await fixture.whenStable();
    const lines = page['form'].controls.lines;
    lines.at(0).controls.item.setValue(sugar);
    expect(lines.at(0).controls.unitPrice.value).toBe(32);
    lines.at(0).controls.unitPrice.setValue(30);
    lines.at(0).controls.quantity.setValue(4);
    await fixture.whenStable();
    const totals = el.querySelector('.totals')!.textContent!;
    expect(totals).toContain('$120.00');
    expect(totals).toContain('$19.20');
    expect(totals).toContain('$139.20');
    expect(el.textContent).toContain('16 %');
    expect(el.textContent).toContain('Catálogo: $32.00');

    page['form'].controls.supplier.setValue({ id: 's2', name: 'Molinos', taxId: 'MOL010203AB1' });
    expect(lines.length).toBe(1);
    expect(lines.at(0).controls.item.value).toBeNull();
  });
});

describe('PurchaseOrderDetailPage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  async function open(permissions: string[], order = buildOrder()) {
    TestBed.configureTestingModule({ providers: [...provideHttpTesting(), provideAppLocale()] });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions });
    const fixture = TestBed.createComponent(PurchaseOrderDetailPage);
    fixture.componentRef.setInput('id', order.id);
    fixture.detectChanges();
    http.expectOne(`/api/v1/purchase-orders/${order.id}`).flush(order);
    TestBed.tick();
    http
      .expectOne((req) => req.url === '/api/v1/goods-receipts')
      .flush({ items: [], page: 1, pageSize: 50, total: 0 });
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('almacén (solo recibir) ve Recibir y lo recibido/pendiente, sin otras acciones', async () => {
    const { el } = await open(['purchasing.view', 'purchasing.receive']);
    const receive = button(el, 'inventory Recibir') as unknown as HTMLAnchorElement;
    expect(receive.getAttribute('href')).toBe('/compras/recepciones/nueva?oc=po1');
    expect(el.textContent).toContain('pendiente 4 caja');
    expect(el.textContent).toContain('$4,264.20');
    expect(button(el, 'Cerrar con saldo')).toBeUndefined();
  });

  it('cerrar con saldo confirma con lo pendiente', async () => {
    const { fixture, el } = await open(['purchasing.view', 'purchasing.po.manage']);
    button(el, 'Cerrar con saldo')!.click();
    await fixture.whenStable();
    const dialog = overlay().querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('¿Cerrar la orden OC-000031 con saldo pendiente?');
    expect(dialog.textContent).toContain('HAR-001 · Harina de trigo');
    expect(dialog.textContent).not.toContain('AZU-001');
    http.expectNone({ method: 'POST' });
  });
});

describe('GoodsReceiptFormPage', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http.verify();
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => (el.innerHTML = ''));
  });

  it('prellena lo pendiente, exige lote y registra varios lotes', async () => {
    TestBed.configureTestingModule({
      providers: [...provideHttpTesting(), provideAppLocale(), ...provideAppDates()],
    });
    http = TestBed.inject(HttpTestingController);
    signIn({ permissions: ['purchasing.view', 'purchasing.receive'] });
    const fixture = TestBed.createComponent(GoodsReceiptFormPage);
    fixture.componentRef.setInput('oc', 'po1');
    fixture.detectChanges();
    http.expectOne('/api/v1/purchase-orders/po1').flush(buildOrder());
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance;

    // Solo la harina tiene saldo; el azúcar ya se recibió completo.
    expect(el.querySelectorAll('li.line')).toHaveLength(1);
    const lots = page['form'].controls.lines.at(0).controls.lots;
    expect(lots.at(0).controls.quantity.value).toBe(4);
    expect(el.textContent).toContain('$1,650.00');

    button(el, 'Registrar recepción')!.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Escribe el lote.');
    expect(document.querySelector('mat-dialog-container')).toBeNull();

    lots.at(0).patchValue({ quantity: 3, lotNumber: 'L-A' });
    button(el, 'add Otro lote')!.click();
    lots.at(1).patchValue({ quantity: 2, lotNumber: 'L-B' });
    await fixture.whenStable();
    expect(el.textContent).toContain('más de lo pendiente');

    button(el, 'Registrar recepción')!.click();
    await fixture.whenStable();
    const dialog = overlay().querySelector('mat-dialog-container')!;
    expect(dialog.textContent).toContain('¿Registrar la recepción de OC-000031?');
    button(dialog, 'Registrar recepción')!.click();
    const req = await vi.waitFor(() =>
      http.expectOne({ method: 'POST', url: '/api/v1/goods-receipts' }),
    );
    expect(req.request.body).toEqual({
      purchaseOrderId: 'po1',
      poVersion: 7,
      supplierInvoiceNumber: null,
      lines: [
        { poLineId: 'pl1', quantity: 3, lotNumber: 'L-A', expirationDate: null },
        { poLineId: 'pl1', quantity: 2, lotNumber: 'L-B', expirationDate: null },
      ],
    });
  });
});
